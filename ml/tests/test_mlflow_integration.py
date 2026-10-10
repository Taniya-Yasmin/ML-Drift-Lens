"""Tests for MLflow integration (Phase 4)."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import joblib
import pytest

from ml.artifact_verification import (
    ArtifactVerificationError,
    load_artifact,
    verify_artifact_complete,
    verify_artifact_structure,
    verify_versioning,
)
from ml.mlflow_config import MLflowConfig

try:
    import mlflow
    from ml.mlflow_integration import MLflowIntegration
    from ml.mlflow_tracking import MLflowTracker
    MLFLOW_AVAILABLE = True
except ImportError:
    MLFLOW_AVAILABLE = False

from ml.model.config import load_contract
from ml.model.pipeline import build_model_pipeline


# Mark entire test module to skip if MLflow not available
pytestmark = pytest.mark.skipif(not MLFLOW_AVAILABLE, reason="MLflow not installed")


# Shared test data
CONTRACT = load_contract(Path(__file__).parents[1] / "contracts" / "nsl_kdd_data_contract.json")


def create_test_artifact() -> dict:
    """Create a minimal test artifact structure."""
    import pandas as pd
    
    # Create dummy data
    features = {name: [0.0] * 5 for name in [f["name"] for f in CONTRACT["features"]]}
    features.update({"protocol_type": ["tcp"] * 5, "service": ["http"] * 5, "flag": ["SF"] * 5})
    df = pd.DataFrame(features)
    labels = pd.Series([0, 1, 0, 1, 0])
    
    # Train model
    model = build_model_pipeline(CONTRACT)
    model.fit(df, labels)
    
    # Create metadata
    metadata = {
        "model_id": "test-baseline",
        "model_version": "0.1.0",
        "model_type": "logistic_regression",
        "dataset_version": "1.0.0",
        "preprocessing_version": "preprocessing-v1",
        "random_state": 42,
        "num_features": 41,
        "training_timestamp": "2026-09-01T00:00:00Z",
        "validation_metrics": {
            "accuracy": 0.8,
            "precision": 0.75,
            "recall": 0.8,
            "f1": 0.77,
            "roc_auc": 0.85,
            "confusion_matrix": [[3, 1], [1, 4]],
            "true_positives": 4,
            "true_negatives": 3,
            "false_positives": 1,
            "false_negatives": 1,
        },
        "test_metrics": {
            "accuracy": 0.78,
            "precision": 0.73,
            "recall": 0.78,
            "f1": 0.75,
            "roc_auc": 0.83,
            "confusion_matrix": [[5, 2], [2, 6]],
            "true_positives": 6,
            "true_negatives": 5,
            "false_positives": 2,
            "false_negatives": 2,
        },
        "class_distribution": {
            "training": {"distribution": {"0": 10, "1": 15}, "percentages": {"0": 40.0, "1": 60.0}},
        },
    }
    
    return {
        "model": model,
        "contract": CONTRACT,
        "metadata": metadata,
    }


# --- Test 1: Load existing artifact ---
def test_artifact_loads_successfully(tmp_path):
    """Test that joblib artifact can be loaded."""
    artifact_path = tmp_path / "test_model.joblib"
    test_artifact = create_test_artifact()
    joblib.dump(test_artifact, artifact_path)
    
    loaded = load_artifact(artifact_path)
    
    assert "model" in loaded
    assert "contract" in loaded
    assert "metadata" in loaded


# --- Test 2: Verify artifact structure ---
def test_artifact_structure_is_valid(tmp_path):
    """Test that artifact has expected pipeline structure."""
    artifact_path = tmp_path / "test_model.joblib"
    test_artifact = create_test_artifact()
    joblib.dump(test_artifact, artifact_path)
    
    loaded = load_artifact(artifact_path)
    verify_artifact_structure(loaded)  # Should not raise
    
    # Verify pipeline steps
    assert "preprocessing" in loaded["model"].named_steps
    assert "classifier" in loaded["model"].named_steps


# --- Test 3: Verify metadata ---
def test_metadata_has_required_fields(tmp_path):
    """Test that metadata contains required version information."""
    artifact_path = tmp_path / "test_model.joblib"
    test_artifact = create_test_artifact()
    joblib.dump(test_artifact, artifact_path)
    
    loaded = load_artifact(artifact_path)
    verify_versioning(loaded["metadata"])  # Should not raise
    
    assert loaded["metadata"]["model_version"]
    assert loaded["metadata"]["preprocessing_version"]


def local_config(tmp_path: Path) -> MLflowConfig:
    return MLflowConfig(
        tracking_uri=f"file:{tmp_path / 'mlruns'}",
        experiment_name="test-modelwatch",
        registered_model_name="test-modelwatch-baseline",
    )


# --- Test 4: MLflow tracking creates run ---
@pytest.mark.skipif(not MLFLOW_AVAILABLE, reason="MLflow not installed")
def test_mlflow_run_creation(tmp_path):
    """Test that a real local MLflow run can be created and queried."""
    tracker = MLflowTracker(local_config(tmp_path))
    run_id = tracker.create_run(tags={"test": "true"})
    tracker.end_run()

    run = mlflow.tracking.MlflowClient(tracking_uri=tracker.config.tracking_uri).get_run(run_id)
    assert run.info.status == "FINISHED"
    assert run.data.tags["test"] == "true"


@pytest.mark.skipif(not MLFLOW_AVAILABLE, reason="MLflow not installed")
def test_parameters_and_metrics_logging(tmp_path):
    """Test that real parameters and metrics are persisted."""
    tracker = MLflowTracker(local_config(tmp_path))
    run_id = tracker.create_run()
    tracker.log_parameters({"model_id": "test-baseline", "model_version": "0.1.0"})
    tracker.log_metrics({"validation_f1": 0.77, "validation_accuracy": 0.8})
    tracker.end_run()

    run = mlflow.tracking.MlflowClient(tracking_uri=tracker.config.tracking_uri).get_run(run_id)
    assert run.data.params["model_id"] == "test-baseline"
    assert run.data.params["model_version"] == "0.1.0"
    assert run.data.metrics["validation_f1"] == pytest.approx(0.77)
    assert run.data.metrics["validation_accuracy"] == pytest.approx(0.8)


@pytest.mark.skipif(not MLFLOW_AVAILABLE, reason="MLflow not installed")
def test_model_logging(tmp_path):
    """Test that the model and source artifacts are logged to a real run."""
    import mlflow

    artifact_path = tmp_path / "test_model.joblib"
    metadata_path = tmp_path / "metadata.json"
    test_artifact = create_test_artifact()
    joblib.dump(test_artifact, artifact_path)
    metadata_path.write_text(json.dumps(test_artifact["metadata"]), encoding="utf-8")

    result = MLflowIntegration(local_config(tmp_path)).track_training(artifact_path, metadata_path)
    client = mlflow.tracking.MlflowClient(tracking_uri=local_config(tmp_path).tracking_uri)
    artifacts = [item.path for item in client.list_artifacts(result["run_id"])]
    assert "model" in artifacts
    assert "joblib" in artifacts
    assert "metadata" in artifacts


@pytest.mark.skipif(not MLFLOW_AVAILABLE, reason="MLflow not installed")
def test_mlflow_integration_workflow(tmp_path):
    """Test complete tracking and metadata consistency for baseline training."""
    import mlflow

    artifact_path = tmp_path / "test_model.joblib"
    metadata_path = tmp_path / "metadata.json"
    test_artifact = create_test_artifact()
    joblib.dump(test_artifact, artifact_path)
    metadata_path.write_text(json.dumps(test_artifact["metadata"]), encoding="utf-8")

    result = MLflowIntegration(local_config(tmp_path)).track_training(artifact_path, metadata_path)
    client = mlflow.tracking.MlflowClient(tracking_uri=local_config(tmp_path).tracking_uri)
    run = client.get_run(result["run_id"])
    assert run.data.tags["model_version"] == "0.1.0"
    assert run.data.params["model_id"] == "test-baseline"
    assert run.data.metrics["test_f1"] == pytest.approx(0.75)
    assert result["model_version"] == "0.1.0"


@pytest.mark.skipif(not MLFLOW_AVAILABLE, reason="MLflow not installed")
def test_candidate_tracking_does_not_register_or_promote(tmp_path):
    """Test candidate tracking records a run while leaving promotion local."""
    import mlflow

    artifact_path = tmp_path / "candidate.joblib"
    metadata_path = tmp_path / "candidate.json"
    candidate = create_test_artifact()
    candidate["metadata"] = {
        "model_id": "test-baseline",
        "candidate_version": "candidate-test-001",
        "preprocessing_version": "preprocessing-v1",
        "metrics": {"accuracy": 0.8, "f1": 0.77},
        "promoted": False,
    }
    joblib.dump(candidate, artifact_path)
    metadata_path.write_text(json.dumps(candidate["metadata"]), encoding="utf-8")

    config = local_config(tmp_path)
    result = MLflowIntegration(config).track_candidate(artifact_path, metadata_path)
    run = mlflow.tracking.MlflowClient(tracking_uri=config.tracking_uri).get_run(result["run_id"])
    assert run.data.tags["candidate"] == "true"
    assert run.data.params["candidate_version"] == "candidate-test-001"
    assert run.data.metrics["validation_f1"] == pytest.approx(0.77)
    assert candidate["metadata"]["promoted"] is False


# --- Test 8: Missing artifact produces clear error ---
def test_missing_artifact_error():
    """Test that missing artifact produces actionable error."""
    missing_path = Path("/nonexistent/model.joblib")
    
    with pytest.raises(ArtifactVerificationError, match="not found"):
        verify_artifact_complete(missing_path)


# --- Test 9: MLflow configuration from environment ---
def test_mlflow_config_from_environment(monkeypatch):
    """Test that MLflow config loads from environment variables."""
    monkeypatch.setenv("MLFLOW_TRACKING_URI", "http://custom-server:5000")
    monkeypatch.setenv("MLFLOW_EXPERIMENT_NAME", "custom-exp")
    monkeypatch.setenv("MLFLOW_REGISTERED_MODEL_NAME", "custom-model")
    
    config = MLflowConfig.from_environment()
    
    assert config.tracking_uri == "http://custom-server:5000"
    assert config.experiment_name == "custom-exp"
    assert config.registered_model_name == "custom-model"


# --- Test 10: Default configuration ---
def test_mlflow_config_defaults():
    """Test that MLflow config has sensible defaults."""
    config = MLflowConfig.from_environment()
    
    assert config.tracking_uri  # Has a default
    assert config.experiment_name == "ModelWatch-IDS"
    assert config.registered_model_name == "ModelWatch-IDS-Baseline"
