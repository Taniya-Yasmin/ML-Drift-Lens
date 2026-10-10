"""Replay labeled NSL-KDD rows through the existing prediction APIs."""

from __future__ import annotations

import argparse
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from ml.model.config import load_contract
from ml.model.data import load_dataset

DEFAULT_DRIFT_FEATURES = (
    "duration",
    "src_bytes",
    "dst_bytes",
    "count",
    "srv_count",
    "serror_rate",
    "srv_serror_rate",
    "same_srv_rate",
    "dst_host_count",
    "dst_host_srv_count",
    "dst_host_same_srv_rate",
    "dst_host_serror_rate",
    "dst_host_srv_serror_rate",
)


@dataclass(frozen=True)
class ReplayConfig:
    dataset_path: Path
    contract_path: Path
    metadata_path: Path
    api_url: str = "http://localhost:3000/api"
    rows: int = 10
    delay_seconds: float = 1.0
    timeout_seconds: float = 10.0
    drift_mode: str = "none"
    drift_start: float = 0.5
    drift_factor: float = 2.0


def _validate_drift_settings(drift_mode: str, drift_start: float, drift_factor: float) -> None:
    if drift_mode not in {"none", "sudden", "gradual"}:
        raise ValueError("drift_mode must be one of: none, sudden, gradual")
    if not 0.0 <= drift_start <= 1.0:
        raise ValueError("drift_start must be between 0.0 and 1.0")
    if drift_factor <= 0.0:
        raise ValueError("drift_factor must be greater than 0")


def _selected_drift_features(contract: dict[str, Any]) -> tuple[str, ...]:
    feature_names = [
        feature["name"]
        for feature in contract["features"]
        if feature["kind"] == "numerical"
    ]
    selected = [name for name in DEFAULT_DRIFT_FEATURES if name in feature_names]
    if not selected:
        return tuple(feature_names[:10])
    return tuple(selected)


def apply_drift_to_payload(
    feature_payload: dict[str, Any],
    row_index: int,
    total_rows: int,
    drift_mode: str = "none",
    drift_start: float = 0.5,
    drift_factor: float = 2.0,
    drift_features: tuple[str, ...] | None = None,
) -> dict[str, Any]:
    """Apply a deterministic feature shift without changing labels or payload schema."""
    _validate_drift_settings(drift_mode, drift_start, drift_factor)

    transformed = dict(feature_payload)
    if drift_mode == "none" or total_rows <= 0:
        return transformed

    selected_features = drift_features or DEFAULT_DRIFT_FEATURES
    if not selected_features:
        return transformed

    drift_start_index = max(0, min(total_rows - 1, int(total_rows * float(drift_start))))
    row_position = row_index + 1

    if drift_mode == "sudden":
        if row_position <= drift_start_index:
            return transformed
        for name in selected_features:
            if name in transformed and isinstance(transformed[name], (int, float)):
                transformed[name] = float(transformed[name]) * float(drift_factor)
        return transformed

    if row_position <= drift_start_index:
        return transformed

    progress = (row_position - drift_start_index) / max(total_rows - drift_start_index, 1)
    scale = 1.0 + (float(drift_factor) - 1.0) * min(progress, 1.0)
    for name in selected_features:
        if name in transformed and isinstance(transformed[name], (int, float)):
            transformed[name] = float(transformed[name]) * float(scale)
    return transformed


def _post_json(url: str, payload: dict[str, Any], timeout: float) -> dict[str, Any]:
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _put_json(url: str, payload: dict[str, Any], timeout: float) -> dict[str, Any]:
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="PUT",
    )
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _safe_error(error: Exception) -> str:
    if isinstance(error, HTTPError):
        return f"HTTP {error.code}"
    if isinstance(error, URLError):
        return "connection error"
    return type(error).__name__


def replay(config: ReplayConfig) -> dict[str, int]:
    """Replay rows and attach each source label through the update endpoint."""
    contract = load_contract(config.contract_path)
    features, labels = load_dataset(config.dataset_path, contract)
    metadata = json.loads(config.metadata_path.read_text(encoding="utf-8"))
    model_id = str(metadata["model_id"])
    model_version = str(metadata["model_version"])
    preprocessing_version = str(metadata["preprocessing_version"])
    drift_features = _selected_drift_features(contract)

    if config.rows < 1:
        raise ValueError("rows must be at least 1")
    if config.delay_seconds < 0:
        raise ValueError("delay must not be negative")
    _validate_drift_settings(config.drift_mode, config.drift_start, config.drift_factor)

    attempted = min(config.rows, len(features))
    predictions_successful = 0
    labels_successfully_stored = 0
    failures = 0

    for row_number in range(attempted):
        actual_label = "attack" if int(labels.iloc[row_number]) == 1 else "normal"
        feature_payload = features.iloc[row_number].to_dict()
        feature_payload = apply_drift_to_payload(
            feature_payload,
            row_index=row_number,
            total_rows=attempted,
            drift_mode=config.drift_mode,
            drift_start=config.drift_start,
            drift_factor=config.drift_factor,
            drift_features=drift_features,
        )
        try:
            prediction = _post_json(
                f"{config.api_url.rstrip('/')}/predictions",
                {
                    "model_id": model_id,
                    "model_version": model_version,
                    "preprocessing_version": preprocessing_version,
                    "input_features": feature_payload,
                },
                config.timeout_seconds,
            )
            predictions_successful += 1
            prediction_id = prediction["stored_id"]
            try:
                _put_json(
                    f"{config.api_url.rstrip('/')}/predictions/{prediction_id}",
                    {"actual_label": actual_label},
                    config.timeout_seconds,
                )
                labels_successfully_stored += 1
                print(
                    f"row={row_number + 1} prediction_id={prediction_id} "
                    f"predicted_class={prediction['prediction_class']} "
                    f"confidence={prediction['confidence']:.4f} "
                    f"actual_label={actual_label} status=success"
                )
            except (HTTPError, URLError, KeyError, json.JSONDecodeError) as error:
                failures += 1
                print(
                    f"row={row_number + 1} prediction_id={prediction_id} "
                    f"actual_label_update=failed error={_safe_error(error)}"
                )
        except (HTTPError, URLError, KeyError, json.JSONDecodeError) as error:
            failures += 1
            print(f"row={row_number + 1} prediction=failed error={_safe_error(error)}")

        if row_number + 1 < attempted:
            time.sleep(config.delay_seconds)

    summary = {
        "rows_attempted": attempted,
        "predictions_successful": predictions_successful,
        "labels_successfully_stored": labels_successfully_stored,
        "failures": failures,
    }
    print(
        "summary "
        + " ".join(f"{key}={value}" for key, value in summary.items())
    )
    return summary


def parse_args() -> ReplayConfig:
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dataset",
        type=Path,
        default=root / "ml" / "data" / "raw" / "nsl-kdd-upstream" / "KDDTest+.txt",
    )
    parser.add_argument(
        "--contract",
        type=Path,
        default=root / "ml" / "contracts" / "nsl_kdd_data_contract.json",
    )
    parser.add_argument(
        "--metadata",
        type=Path,
        default=root / "ml" / "artifacts" / "metadata.json",
    )
    parser.add_argument("--api-url", default="http://localhost:3000/api")
    parser.add_argument("--rows", type=int, default=10)
    parser.add_argument("--delay", type=float, default=1.0)
    parser.add_argument("--timeout", type=float, default=10.0)
    parser.add_argument("--drift-mode", choices=["none", "sudden", "gradual"], default="none")
    parser.add_argument("--drift-start", type=float, default=0.5)
    parser.add_argument("--drift-factor", type=float, default=2.0)
    args = parser.parse_args()
    return ReplayConfig(
        dataset_path=args.dataset,
        contract_path=args.contract,
        metadata_path=args.metadata,
        api_url=args.api_url,
        rows=args.rows,
        delay_seconds=args.delay,
        timeout_seconds=args.timeout,
        drift_mode=args.drift_mode,
        drift_start=args.drift_start,
        drift_factor=args.drift_factor,
    )


if __name__ == "__main__":
    replay(parse_args())