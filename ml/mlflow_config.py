"""MLflow configuration for ModelWatch."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class MLflowConfig:
    """MLflow configuration with environment variable support."""

    tracking_uri: str
    experiment_name: str
    registered_model_name: str
    artifact_root: Path | None = None

    @classmethod
    def from_environment(cls) -> MLflowConfig:
        """Load configuration from environment variables.
        
        Environment variables:
        - MLFLOW_TRACKING_URI: MLflow tracking server URI
          Default: file-based local tracking at ./mlruns
        - MLFLOW_EXPERIMENT_NAME: Experiment name for tracking
          Default: "ModelWatch-IDS"
        - MLFLOW_REGISTERED_MODEL_NAME: Name for registered model
          Default: "ModelWatch-IDS-Baseline"
        - MLFLOW_ARTIFACT_ROOT: Root directory for artifacts
          Default: None (use MLflow default)
        """
        tracking_uri = os.getenv(
            "MLFLOW_TRACKING_URI",
            f"file:{Path.cwd() / 'mlruns'}",
        )
        experiment_name = os.getenv(
            "MLFLOW_EXPERIMENT_NAME",
            "ModelWatch-IDS",
        )
        registered_model_name = os.getenv(
            "MLFLOW_REGISTERED_MODEL_NAME",
            "ModelWatch-IDS-Baseline",
        )
        artifact_root_env = os.getenv("MLFLOW_ARTIFACT_ROOT")
        artifact_root = Path(artifact_root_env) if artifact_root_env else None

        return cls(
            tracking_uri=tracking_uri,
            experiment_name=experiment_name,
            registered_model_name=registered_model_name,
            artifact_root=artifact_root,
        )

    def __str__(self) -> str:
        """Return a string representation for logging."""
        return (
            f"MLflowConfig(tracking_uri={self.tracking_uri}, "
            f"experiment={self.experiment_name}, "
            f"registered_model={self.registered_model_name})"
        )
