"""Minimal PSI-based drift detection for the NSL-KDD ModelWatch baseline.

The first implementation intentionally stays small and does not persist drift into
PostgreSQL. It loads the training/reference distribution from KDDTrain+.txt and
compares it to recent production rows stored in predictions.input_features.

The implementation is intentionally conservative: for numerical features only,
PSI is calculated with a fixed histogram over a combined baseline/current range.
The final score uses the maximum PSI across the monitored features; this keeps the
output easy to explain in a viva while staying configurable.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Iterable, Sequence

import numpy as np
import pandas as pd

from ml.model.config import load_contract
from ml.model.data import load_dataset

DEFAULT_PSI_THRESHOLD = 0.20
# A max-over-feature PSI score is unstable on very small windows, especially
# when many monitored features are sparse. Keep the default in warm-up until
# the current window is large enough for a meaningful comparison.
DEFAULT_MIN_SAMPLES = 100


def _project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _load_contract_and_baseline() -> tuple[dict[str, Any], pd.DataFrame]:
    root = _project_root()
    contract_path = root / "ml" / "contracts" / "nsl_kdd_data_contract.json"
    train_path = root / "ml" / "data" / "raw" / "nsl-kdd-upstream" / "KDDTrain+.txt"
    contract = load_contract(contract_path)
    features, _ = load_dataset(train_path, contract)
    numeric_features = [
        feature["name"]
        for feature in contract["features"]
        if feature["kind"] == "numerical"
    ]
    return contract, features[numeric_features].copy()


def _normalize_recent_payloads(raw_rows: Iterable[dict[str, Any]], feature_names: Sequence[str]) -> list[dict[str, float]]:
    """Convert DB payloads into the same feature order as the model contract."""
    normalized_rows: list[dict[str, float]] = []
    for raw_row in raw_rows:
        if not isinstance(raw_row, dict):
            continue

        ordered_row: dict[str, float] = {}
        for feature_name in feature_names:
            value = raw_row.get(feature_name)
            if value is None:
                continue
            try:
                ordered_row[feature_name] = float(value)
            except (TypeError, ValueError):
                continue
        if ordered_row:
            normalized_rows.append(ordered_row)
    return normalized_rows


def load_baseline_distribution() -> pd.DataFrame:
    """Load the NSL-KDD training baseline distribution using the existing data loader."""
    _, baseline_df = _load_contract_and_baseline()
    return baseline_df


def _backend_db_env() -> dict[str, str]:
    root = _project_root()
    env_path = root / "ml-drift-lens-backend" / ".env"

    if env_path.exists():
        with env_path.open(encoding="utf-8") as env_file:
            for line in env_file:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip())

    password = os.environ.get("DB_PASSWORD")
    if not password:
        raise RuntimeError("DB_PASSWORD must be configured to query prediction data")

    return {
        "host": os.environ.get("DB_HOST", "localhost"),
        "port": os.environ.get("DB_PORT", "5432"),
        "dbname": os.environ.get("DB_NAME", "ml_drift_lens"),
        "user": os.environ.get("DB_USER", "postgres"),
        "password": password,
    }


def fetch_recent_prediction_features(limit: int = 100) -> list[dict[str, Any]]:
    """Read recent input_features rows from PostgreSQL using the existing backend config.

    This is intentionally safe and read-only. If the database driver is missing or the
    database is unavailable, it raises a RuntimeError instead of mutating any table.
    """
    try:
        import psycopg
    except ImportError as exc:  # pragma: no cover - environment-dependent path
        raise RuntimeError("psycopg is required to query recent prediction features") from exc

    config = _backend_db_env()

    with psycopg.connect(**config) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT input_features FROM predictions ORDER BY timestamp DESC LIMIT %s",
                (limit,),
            )
            rows = cursor.fetchall()

    return [row[0] for row in rows if isinstance(row[0], dict)]


def _prepare_numeric_buckets(values: np.ndarray, bins: int = 10) -> tuple[np.ndarray, np.ndarray]:
    values = np.asarray(values, dtype=float)
    if values.size == 0:
        return np.array([]), np.array([])

    finite = values[np.isfinite(values)]
    if finite.size == 0:
        return np.array([]), np.array([])

    min_value = float(np.min(finite))
    max_value = float(np.max(finite))

    if np.isclose(min_value, max_value):
        half_width = max(abs(min_value) * 0.5, 1.0)
        edges = np.array([min_value - half_width, min_value + half_width], dtype=float)
    else:
        edges = np.linspace(min_value, max_value, bins + 1, dtype=float)

    counts, _ = np.histogram(finite, bins=edges)
    return counts, edges


def calculate_psi(baseline: Sequence[float], current: Sequence[float], bins: int = 10) -> float:
    """Calculate the Population Stability Index for a single numerical feature.

    PSI is a standard distribution-shift metric. Values below 0.10 are usually
    considered low, 0.10-0.20 moderate, and >= 0.20 significant, but the threshold
    is configurable because no universal cutoff applies to every model.
    """
    baseline_values = np.asarray(baseline, dtype=float)
    current_values = np.asarray(current, dtype=float)
    baseline_values = baseline_values[np.isfinite(baseline_values)]
    current_values = current_values[np.isfinite(current_values)]

    if baseline_values.size == 0 or current_values.size == 0:
        return 0.0

    # Anchor bins to the reference distribution. Bins derived from the combined
    # sample move with the current window and can overstate drift on small, valid
    # production samples.
    edges = np.unique(np.quantile(baseline_values, np.linspace(0.0, 1.0, bins + 1)))
    if edges.size < 2:
        return 0.0
    edges[0] = -np.inf
    edges[-1] = np.inf
    baseline_counts, _ = np.histogram(baseline_values, bins=edges)
    current_counts, _ = np.histogram(current_values, bins=edges)

    baseline_pct = baseline_counts / max(baseline_counts.sum(), 1)
    current_pct = current_counts / max(current_counts.sum(), 1)

    epsilon = 1e-6
    baseline_pct = np.clip(baseline_pct, epsilon, None)
    current_pct = np.clip(current_pct, epsilon, None)

    return float(np.sum((current_pct - baseline_pct) * np.log(current_pct / baseline_pct)))


def _summarize_feature_scores(
    baseline_frame: pd.DataFrame,
    current_frame: pd.DataFrame,
    feature_names: Sequence[str],
    threshold: float = DEFAULT_PSI_THRESHOLD,
    min_samples: int = DEFAULT_MIN_SAMPLES,
) -> tuple[float, dict[str, float], list[str], str]:
    if len(current_frame) < min_samples:
        return 0.0, {}, list(feature_names), "insufficient_data"

    feature_scores: dict[str, float] = {}
    for name in feature_names:
        if name not in baseline_frame.columns or name not in current_frame.columns:
            continue
        baseline_values = baseline_frame[name].astype(float).to_numpy()
        current_values = current_frame[name].astype(float).to_numpy()
        feature_scores[name] = calculate_psi(baseline_values, current_values)

    if not feature_scores:
        return 0.0, {}, list(feature_names), "insufficient_data"

    overall_score = max(feature_scores.values())
    if overall_score < 0.10:
        status = "low_drift"
    elif overall_score < threshold:
        status = "moderate_drift"
    else:
        status = "significant_drift"

    return overall_score, feature_scores, list(feature_scores.keys()), status


def evaluate_psi_drift(
    baseline: pd.DataFrame | dict[str, Sequence[float]] | Sequence[float],
    current: pd.DataFrame | dict[str, Sequence[float]] | Sequence[float],
    *,
    threshold: float = DEFAULT_PSI_THRESHOLD,
    min_samples: int = DEFAULT_MIN_SAMPLES,
    feature_names: Sequence[str] | None = None,
) -> dict[str, Any]:
    """Evaluate PSI drift for the provided baseline/current distributions.

    Returns a dictionary with the keys the project expects for a first-pass drift
    metric: metric_type, overall_score, threshold, status, number_of_rows,
    features_analyzed, and optionally per_feature details.
    """
    if isinstance(baseline, pd.DataFrame) and isinstance(current, pd.DataFrame):
        baseline_frame = baseline.copy()
        current_frame = current.copy()
        columns = list(feature_names) if feature_names is not None else list(baseline_frame.columns)
        baseline_frame = baseline_frame[columns]
        current_frame = current_frame[columns]
        overall_score, feature_scores, analyzed, status = _summarize_feature_scores(
            baseline_frame,
            current_frame,
            columns,
            threshold=threshold,
            min_samples=min_samples,
        )
        return {
            "metric_type": "PSI",
            "overall_score": float(overall_score),
            "threshold": float(threshold),
            "status": status,
            "number_of_rows": int(len(current_frame)),
            "features_analyzed": analyzed,
            "per_feature": feature_scores,
        }

    if isinstance(baseline, dict) and isinstance(current, dict):
        baseline_map = {str(key): np.asarray(value, dtype=float) for key, value in baseline.items()}
        current_map = {str(key): np.asarray(value, dtype=float) for key, value in current.items()}
        shared_names = list(feature_names) if feature_names is not None else sorted(set(baseline_map) & set(current_map))
        if len(current_map) < min_samples and not isinstance(next(iter(current_map.values()), None), (list, tuple, np.ndarray)):
            pass

        if len(current_map) < min_samples:
            return {
                "metric_type": "PSI",
                "overall_score": 0.0,
                "threshold": float(threshold),
                "status": "insufficient_data",
                "number_of_rows": int(sum(len(value) for value in current_map.values() if hasattr(value, '__len__')) or 0),
                "features_analyzed": list(shared_names),
                "per_feature": {},
            }

        feature_scores: dict[str, float] = {}
        for name in shared_names:
            if name not in baseline_map or name not in current_map:
                continue
            feature_scores[name] = calculate_psi(baseline_map[name], current_map[name])

        overall_score = max(feature_scores.values(), default=0.0)
        if overall_score < 0.10:
            status = "low_drift"
        elif overall_score < threshold:
            status = "moderate_drift"
        elif len(current_map) < min_samples:
            status = "insufficient_data"
        else:
            status = "significant_drift"

        return {
            "metric_type": "PSI",
            "overall_score": float(overall_score),
            "threshold": float(threshold),
            "status": status,
            "number_of_rows": int(sum(len(value) for value in current_map.values() if hasattr(value, '__len__')) or 0),
            "features_analyzed": list(feature_scores.keys()),
            "per_feature": feature_scores,
        }

    baseline_values = np.asarray(baseline, dtype=float)
    current_values = np.asarray(current, dtype=float)

    if current_values.size < min_samples:
        return {
            "metric_type": "PSI",
            "overall_score": 0.0,
            "threshold": float(threshold),
            "status": "insufficient_data",
            "number_of_rows": int(current_values.size),
            "features_analyzed": list(feature_names or ["feature"]),
            "per_feature": {},
        }

    feature_name = (feature_names or ["feature"])[0]
    psi_value = calculate_psi(baseline_values, current_values)
    if psi_value < 0.10:
        status = "low_drift"
    elif psi_value < threshold:
        status = "moderate_drift"
    else:
        status = "significant_drift"

    return {
        "metric_type": "PSI",
        "overall_score": float(psi_value),
        "threshold": float(threshold),
        "status": status,
        "number_of_rows": int(current_values.size),
        "features_analyzed": [feature_name],
        "per_feature": {feature_name: float(psi_value)},
    }


def detect_psi_drift(
    *,
    threshold: float = DEFAULT_PSI_THRESHOLD,
    min_samples: int = DEFAULT_MIN_SAMPLES,
    dataset_path: str | Path | None = None,
    contract_path: str | Path | None = None,
    recent_rows: Sequence[dict[str, Any]] | None = None,
    limit: int = 100,
) -> dict[str, Any]:
    """High-level entry point for the first minimal drift check.

    This method intentionally does not write to PostgreSQL; it only calculates and
    returns a PSI drift result based on the baseline training set and recent rows.
    """
    contract, baseline_df = _load_contract_and_baseline()
    if dataset_path is not None or contract_path is not None:
        root = _project_root()
        contract_path = Path(contract_path) if contract_path is not None else root / "ml" / "contracts" / "nsl_kdd_data_contract.json"
        dataset_path = Path(dataset_path) if dataset_path is not None else root / "ml" / "data" / "raw" / "KDDTrain+.txt"
        contract = load_contract(contract_path)
        baseline_features, _ = load_dataset(dataset_path, contract)
        numeric_feature_names = [
            feature["name"]
            for feature in contract["features"]
            if feature["kind"] == "numerical"
        ]
        baseline_df = baseline_features[numeric_feature_names].copy()

    if recent_rows is None:
        recent_rows = fetch_recent_prediction_features(limit=limit)

    feature_names = [name for name in baseline_df.columns if name not in {"label", "difficulty_level"}]
    current_rows = [
        {feature_name: float(row.get(feature_name, 0)) for feature_name in feature_names if feature_name in row}
        for row in recent_rows
    ]
    current_frame = pd.DataFrame(current_rows)
    if current_frame.empty:
        return {
            "metric_type": "PSI",
            "overall_score": 0.0,
            "threshold": float(threshold),
            "status": "insufficient_data",
            "number_of_rows": 0,
            "features_analyzed": [],
            "per_feature": {},
        }

    # ensure the same feature order and only compare numerical features.
    current_frame = current_frame.reindex(columns=feature_names)
    if len(current_frame) < min_samples:
        return {
            "metric_type": "PSI",
            "overall_score": 0.0,
            "threshold": float(threshold),
            "status": "insufficient_data",
            "number_of_rows": int(len(current_frame)),
            "features_analyzed": feature_names,
            "per_feature": {},
        }

    overall_score, feature_scores, analyzed, status = _summarize_feature_scores(
        baseline_df,
        current_frame,
        feature_names,
        threshold=threshold,
        min_samples=min_samples,
    )
    return {
        "metric_type": "PSI",
        "overall_score": float(overall_score),
        "threshold": float(threshold),
        "status": status,
        "number_of_rows": int(len(current_frame)),
        "features_analyzed": analyzed,
        "per_feature": feature_scores,
    }


__all__ = [
    "DEFAULT_MIN_SAMPLES",
    "DEFAULT_PSI_THRESHOLD",
    "calculate_psi",
    "detect_psi_drift",
    "evaluate_psi_drift",
    "fetch_recent_prediction_features",
    "load_baseline_distribution",
]


def main() -> None:
    """Evaluate JSON prediction feature rows supplied on standard input."""
    rows = json.load(sys.stdin)
    result = detect_psi_drift(recent_rows=rows, limit=len(rows))
    print(json.dumps(result))


if __name__ == "__main__":
    main()
