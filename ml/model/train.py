"""Command-line training and evaluation for the ModelWatch baseline."""

from __future__ import annotations

import argparse
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score, roc_auc_score, roc_curve
from sklearn.model_selection import train_test_split

from .config import ModelConfig, load_contract
from .data import load_dataset
from .pipeline import build_model_pipeline

logger = logging.getLogger(__name__)


def _track_with_mlflow(artifact_path: Path, metadata_path: Path) -> str | None:
    """Track a completed artifact without making tracking a training prerequisite."""
    try:
        from ..mlflow_integration import MLflowIntegration

        result = MLflowIntegration().track_training(artifact_path, metadata_path)
        return result["run_id"]
    except Exception as err:
        logger.warning("MLflow tracking unavailable; continuing without run metadata: %s", err)
        return None


def analyze_class_distribution(labels: Any, split_name: str) -> dict[str, Any]:
    """Analyze and return class distribution statistics."""
    unique, counts = np.unique(labels, return_counts=True)
    distribution = {str(int(label)): int(count) for label, count in zip(unique, counts)}
    total = int(np.sum(counts))
    percentages = {str(int(label)): float(count / total * 100) for label, count in zip(unique, counts)}
    
    logger.info(f"{split_name} class distribution:")
    logger.info(f"  Class 0 (normal): {distribution.get('0', 0)} ({percentages.get('0', 0):.1f}%)")
    logger.info(f"  Class 1 (attack): {distribution.get('1', 0)} ({percentages.get('1', 0):.1f}%)")
    
    return {"distribution": distribution, "percentages": percentages}


def evaluate(model: Any, features: Any, labels: Any) -> dict[str, Any]:
    """Calculate real metrics from predictions on the supplied labeled data."""
    predictions = model.predict(features)
    
    # Get probability predictions for ROC-AUC calculation
    probabilities = None
    try:
        probabilities = model.predict_proba(features)[:, 1]
    except (AttributeError, IndexError):
        pass
    
    metrics = {
        "accuracy": float(accuracy_score(labels, predictions)),
        "precision": float(precision_score(labels, predictions, zero_division=0)),
        "recall": float(recall_score(labels, predictions, zero_division=0)),
        "f1": float(f1_score(labels, predictions, zero_division=0)),
        "confusion_matrix": confusion_matrix(labels, predictions, labels=[0, 1]).tolist(),
    }
    
    # Add ROC-AUC if probabilities are available
    if probabilities is not None:
        try:
            metrics["roc_auc"] = float(roc_auc_score(labels, probabilities))
        except ValueError:
            # ROC-AUC requires both classes to be present
            pass
    
    # Calculate and add TP, TN, FP, FN from confusion matrix
    cm = confusion_matrix(labels, predictions, labels=[0, 1])
    tn, fp, fn, tp = cm.ravel()
    metrics["true_negatives"] = int(tn)
    metrics["false_positives"] = int(fp)
    metrics["false_negatives"] = int(fn)
    metrics["true_positives"] = int(tp)
    
    return metrics


def train(config: ModelConfig) -> dict[str, Any]:
    """Train on KDDTrain+, evaluate validation and untouched KDDTest+, and persist artifacts."""
    contract = load_contract(config.contract_path)
    train_features, train_labels = load_dataset(config.train_path, contract)
    test_features, test_labels = load_dataset(config.test_path, contract)
    
    logger.info(f"Loaded training data: {train_features.shape[0]} samples, {train_features.shape[1]} features")
    logger.info(f"Loaded test data: {test_features.shape[0]} samples, {test_features.shape[1]} features")
    
    # Analyze class distribution in full training data
    logger.info("Training set class distribution:")
    train_distribution = analyze_class_distribution(train_labels, "Training")
    
    # Create stratified validation split
    features, validation_features, labels, validation_labels = train_test_split(
        train_features,
        train_labels,
        test_size=contract["split"]["validation_fraction"],
        random_state=contract["split"]["random_seed"],
        stratify=train_labels,
    )
    
    logger.info(f"Split into train ({features.shape[0]} samples) and validation ({validation_features.shape[0]} samples)")
    
    # Analyze class distribution in train split
    logger.info("Training split class distribution (used for fitting):")
    train_split_distribution = analyze_class_distribution(labels, "Train split")
    
    # Analyze class distribution in validation split
    logger.info("Validation split class distribution:")
    validation_distribution = analyze_class_distribution(validation_labels, "Validation")
    
    # Analyze class distribution in test set
    logger.info("Test set class distribution:")
    test_distribution = analyze_class_distribution(test_labels, "Test")
    
    # Train model
    logger.info("Building and training model pipeline...")
    model = build_model_pipeline(contract)
    model.fit(features, labels)
    logger.info("Model training complete")
    
    # Evaluate on validation and test sets
    logger.info("Evaluating on validation set...")
    validation_metrics = evaluate(model, validation_features, validation_labels)
    
    logger.info("Evaluating on test set...")
    test_metrics = evaluate(model, test_features, test_labels)
    
    # Create metadata
    metadata = {
        "model_id": config.model_id,
        "model_version": config.model_version,
        "model_type": "xgboost",
        "dataset_version": contract["contract_version"],
        "feature_schema_version": contract["contract_version"],
        "preprocessing_version": contract["preprocessing"]["version"],
        "random_state": contract["split"]["random_seed"],
        "num_features": 41,
        "training_timestamp": datetime.now(timezone.utc).isoformat(),
        "class_distribution": {
            "training": train_distribution,
            "train_split": train_split_distribution,
            "validation": validation_distribution,
            "test": test_distribution,
        },
        "validation_metrics": validation_metrics,
        "test_metrics": test_metrics,
    }
    
    # Persist artifacts
    config.artifact_path.parent.mkdir(parents=True, exist_ok=True)
    config.metadata_path.parent.mkdir(parents=True, exist_ok=True)
    
    logger.info(f"Saving model artifact to {config.artifact_path}")
    joblib.dump({"model": model, "contract": contract, "metadata": metadata}, config.artifact_path)
    
    logger.info(f"Saving metadata to {config.metadata_path}")
    config.metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    mlflow_run_id = _track_with_mlflow(config.artifact_path, config.metadata_path)
    if mlflow_run_id:
        metadata["mlflow_run_id"] = mlflow_run_id
        config.metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
        joblib.dump({"model": model, "contract": contract, "metadata": metadata}, config.artifact_path)
    
    logger.info("Training complete!")
    return metadata


def parse_args() -> ModelConfig:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--train", dest="train_path", type=Path, required=True)
    parser.add_argument("--test", dest="test_path", type=Path, required=True)
    parser.add_argument("--artifact", type=Path, required=True)
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--model-id", default="nsl-kdd-baseline")
    parser.add_argument("--model-version", default="0.1.0")
    parser.add_argument("--verbose", action="store_true", help="Enable debug logging")
    args = parser.parse_args()
    
    # Configure logging
    log_level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    
    return ModelConfig(
        contract_path=args.contract,
        train_path=args.train_path,
        test_path=args.test_path,
        artifact_path=args.artifact,
        metadata_path=args.metadata,
        model_id=args.model_id,
        model_version=args.model_version,
    )


if __name__ == "__main__":
    result = train(parse_args())
    print(json.dumps(result, indent=2))