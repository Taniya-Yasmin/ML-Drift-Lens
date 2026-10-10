"""Candidate retraining from verified production labels.

This module deliberately writes only versioned candidate artifacts. It never
changes the deployed model artifact or performs model promotion.
"""

from __future__ import annotations

import argparse
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import joblib
import pandas as pd
from sklearn.model_selection import train_test_split

from .model.config import load_contract
from .model.data import normalize_label
from .model.pipeline import build_model_pipeline
from .model.train import evaluate

logger = logging.getLogger(__name__)


def _feature_names(contract: dict[str, Any]) -> list[str]:
    return [feature["name"] for feature in contract["features"]]


def prepare_retraining_data(
    records: list[dict[str, Any]],
    contract: dict[str, Any],
) -> tuple[pd.DataFrame, pd.Series]:
    """Convert labeled prediction records into contract-ordered X and y."""
    feature_names = _feature_names(contract)
    rows: list[dict[str, Any]] = []
    labels: list[int] = []

    for record in records:
        if record.get("actual_label") is None:
            continue

        input_features = record.get("input_features")
        if not isinstance(input_features, dict):
            raise ValueError("input_features must be an object")

        missing = [name for name in feature_names if name not in input_features]
        extra = sorted(set(input_features) - set(feature_names))
        if missing:
            raise ValueError(f"Missing required features: {missing}")
        if extra:
            raise ValueError(f"Unexpected features: {extra}")

        rows.append({name: input_features[name] for name in feature_names})
        labels.append(normalize_label(record["actual_label"]))

    return pd.DataFrame(rows, columns=feature_names), pd.Series(labels, dtype="int8")


def retrain_candidate(
    records: list[dict[str, Any]],
    contract_path: Path,
    candidate_dir: Path,
    model_id: str,
    min_samples: int = 30,
    old_model_version: str | None = None,
    candidate_version: str | None = None,
) -> dict[str, Any]:
    """Train and persist a candidate model from labeled prediction records."""
    if min_samples < 1:
        raise ValueError("min_samples must be positive")
    if not model_id or not model_id.strip():
        raise ValueError("model_id is required")

    contract = load_contract(contract_path)
    features, labels = prepare_retraining_data(records, contract)
    sample_count = len(labels)

    if sample_count < min_samples:
        return {
            "status": "insufficient_data",
            "model_id": model_id,
            "sample_count": sample_count,
            "min_samples": min_samples,
            "candidate_version": None,
            "artifact_path": None,
        }

    if labels.nunique() < 2:
        raise ValueError("At least two label classes are required for retraining")

    validation_fraction = contract["split"]["validation_fraction"]
    random_seed = contract["split"]["random_seed"]
    train_features, validation_features, train_labels, validation_labels = train_test_split(
        features,
        labels,
        test_size=validation_fraction,
        random_state=random_seed,
        stratify=labels,
    )

    model = build_model_pipeline(contract)
    model.fit(train_features, train_labels)
    metrics = evaluate(model, validation_features, validation_labels)

    run_id = candidate_version or (
        f"candidate-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid4().hex[:8]}"
    )
    candidate_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = candidate_dir / f"{run_id}.joblib"
    metadata_path = candidate_dir / f"{run_id}.json"
    metadata = {
        "model_id": model_id,
        "candidate_version": run_id,
        "model_type": "xgboost",
        "feature_schema_version": contract["contract_version"],
        "preprocessing_version": contract["preprocessing"]["version"],
        "training_timestamp": datetime.now(timezone.utc).isoformat(),
        "sample_count": sample_count,
        "min_samples": min_samples,
        "old_model_version": old_model_version,
        "metrics": metrics,
        "promoted": False,
    }

    joblib.dump({"model": model, "contract": contract, "metadata": metadata}, artifact_path)
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    mlflow_run_id = None
    try:
        from .mlflow_integration import MLflowIntegration

        mlflow_run_id = MLflowIntegration().track_candidate(artifact_path, metadata_path)["run_id"]
    except Exception as err:
        logger.warning("MLflow candidate tracking unavailable; keeping candidate local: %s", err)

    if mlflow_run_id:
        metadata["mlflow_run_id"] = mlflow_run_id
        metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
        joblib.dump({"model": model, "contract": contract, "metadata": metadata}, artifact_path)

    return {
        "status": "completed",
        "model_id": model_id,
        "sample_count": sample_count,
        "min_samples": min_samples,
        "candidate_version": run_id,
        "artifact_path": str(artifact_path),
        "metadata_path": str(metadata_path),
        "metrics": metrics,
        "mlflow_run_id": mlflow_run_id,
        "promoted": False,
    }


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--candidate-dir", type=Path, required=True)
    parser.add_argument("--model-id", required=True)
    parser.add_argument("--min-samples", type=int, default=30)
    parser.add_argument("--old-model-version")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    records = json.load(__import__("sys").stdin)
    result = retrain_candidate(
        records=records,
        contract_path=args.contract,
        candidate_dir=args.candidate_dir,
        model_id=args.model_id,
        min_samples=args.min_samples,
        old_model_version=args.old_model_version,
    )
    print(json.dumps(result))


if __name__ == "__main__":
    main()