"""Complete MLflow integration workflow for Phase 4."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import joblib

try:
    import mlflow
    MLFLOW_AVAILABLE = True
except ImportError:
    MLFLOW_AVAILABLE = False

from .artifact_verification import verify_artifact_complete, ArtifactVerificationError
from .mlflow_config import MLflowConfig
from .mlflow_tracking import MLflowTracker
from .model_signature import create_nsl_kdd_signature, create_nsl_kdd_input_example

logger = logging.getLogger(__name__)


class MLflowIntegration:
    """Complete MLflow integration for model tracking and registration."""

    def __init__(self, config: MLflowConfig | None = None):
        """Initialize MLflow integration.
        
        Args:
            config: MLflow configuration. If None, loads from environment.
        """
        self.config = config or MLflowConfig.from_environment()
        self.tracker = MLflowTracker(self.config)

    def track_training(
        self,
        artifact_path: Path,
        metadata_path: Path | None = None,
        run_name: str | None = None,
    ) -> dict[str, Any]:
        """Track model training in MLflow.
        
        Workflow:
        1. Verify artifact exists and is valid
        2. Create MLflow run
        3. Log parameters, metrics, and tags
        4. Log model and artifacts
        5. Return run information
        
        Args:
            artifact_path: Path to the joblib model artifact
            metadata_path: Path to the metadata JSON (optional)
            run_name: Optional name for the MLflow run
        
        Returns:
            Dict with run_id, registered_model_name, and model_version
        """
        logger.info("Starting MLflow tracking workflow")
        
        # Step 1: Verify artifact
        logger.info("Step 1: Verifying artifact...")
        try:
            artifact = verify_artifact_complete(artifact_path, metadata_path)
        except ArtifactVerificationError as err:
            logger.error(f"Artifact verification failed: {err}")
            raise
        
        model = artifact["model"]
        metadata = artifact["metadata"]
        
        # Step 2: Create MLflow run
        logger.info("Step 2: Creating MLflow run...")
        run_name = run_name or f"train-{metadata.get('model_version', 'unknown')}"
        
        initial_tags = {
            "project": "ModelWatch",
            "task": "network_intrusion_detection",
            "dataset": "NSL-KDD",
            "model_type": metadata.get("model_type", "unknown"),
            "model_version": metadata.get("model_version", "unknown"),
            "preprocessing_version": metadata.get("preprocessing_version", "unknown"),
        }
        
        run_id = self.tracker.create_run(
            experiment_name=self.config.experiment_name,
            run_name=run_name,
            tags=initial_tags,
        )
        
        # Step 3: Log parameters
        logger.info("Step 3: Logging parameters...")
        parameters = {
            "model_id": metadata.get("model_id", "unknown"),
            "model_type": metadata.get("model_type", "unknown"),
            "random_state": metadata.get("random_state", "unknown"),
            "num_features": metadata.get("num_features", 41),
            "dataset_version": metadata.get("dataset_version", "unknown"),
            "preprocessing_version": metadata.get("preprocessing_version", "unknown"),
        }
        self.tracker.log_parameters(parameters)
        
        # Step 4: Log metrics
        logger.info("Step 4: Logging metrics...")
        
        # Log validation metrics
        val_metrics = metadata.get("validation_metrics", {})
        if val_metrics:
            validation_prefixed = {f"validation_{k}": v for k, v in val_metrics.items()
                                   if isinstance(v, (int, float))}
            self.tracker.log_metrics(validation_prefixed, step=0)
            
            # Log confusion matrix separately
            if "confusion_matrix" in val_metrics:
                self.tracker.log_confusion_matrix(val_metrics["confusion_matrix"], step=0)
        
        # Log test metrics (final evaluation)
        test_metrics = metadata.get("test_metrics", {})
        if test_metrics:
            test_prefixed = {f"test_{k}": v for k, v in test_metrics.items()
                            if isinstance(v, (int, float))}
            self.tracker.log_metrics(test_prefixed, step=1)
            
            # Log confusion matrix separately
            if "confusion_matrix" in test_metrics:
                self.tracker.log_confusion_matrix(test_metrics["confusion_matrix"], step=1)
        
        # Step 5: Log class distribution
        logger.info("Step 5: Logging class distribution...")
        class_dist = metadata.get("class_distribution", {})
        if class_dist:
            for split_name, split_data in class_dist.items():
                if isinstance(split_data, dict) and "distribution" in split_data:
                    dist = split_data["distribution"]
                    for class_label, count in dist.items():
                        mlflow.log_metric(f"class_dist_{split_name}_class_{class_label}", count)
        
        # Step 6: Log environment info
        logger.info("Step 6: Logging environment info...")
        env_info = MLflowTracker.get_environment_info()
        self.tracker.log_tags(env_info)
        
        # Step 7: Log model with signature
        logger.info("Step 7: Logging model...")
        input_example = create_nsl_kdd_input_example()
        signature = create_nsl_kdd_signature()
        
        self.tracker.log_model(
            model,
            model_dir="model",
            input_example=input_example,
            signature=signature,
        )
        
        # Step 8: Log artifact files
        logger.info("Step 8: Logging artifact files...")
        if artifact_path.exists():
            self.tracker.log_artifacts(artifact_path, artifact_path="joblib")
        
        if metadata_path and metadata_path.exists():
            self.tracker.log_artifacts(metadata_path, artifact_path="metadata")
        
        # Step 9: Get run info
        run_info = self.tracker.get_run_info()
        logger.info(f"MLflow run created: {run_info['run_id']}")
        
        # Step 10: End run
        self.tracker.end_run("FINISHED")
        logger.info("MLflow run completed")
        
        return {
            "run_id": run_id,
            "registered_model_name": self.config.registered_model_name,
            "model_version": metadata.get("model_version"),
            "preprocessing_version": metadata.get("preprocessing_version"),
            "artifact_uri": run_info.get("artifact_uri"),
        }

    def register_model(
        self,
        run_id: str,
        version_name: str | None = None,
        description: str | None = None,
    ) -> dict[str, Any]:
        """Register the model from a run with MLflow Model Registry.
        
        Args:
            run_id: MLflow run ID
            version_name: Optional name/description for this version
            description: Optional detailed description
        
        Returns:
            Dict with registered model name and version number
        """
        logger.info(f"Registering model from run {run_id}")
        
        try:
            model_uri = f"runs:/{run_id}/model"
            
            # Register or update model
            model_version = mlflow.register_model(
                model_uri,
                self.config.registered_model_name,
            )
            
            logger.info(
                f"Model registered: {self.config.registered_model_name} "
                f"version {model_version.version}"
            )
            
            # Add description if provided
            if description:
                client = mlflow.tracking.MlflowClient()
                client.update_registered_model(
                    self.config.registered_model_name,
                    description,
                )
            
            return {
                "registered_model_name": self.config.registered_model_name,
                "version_number": model_version.version,
                "status": model_version.status,
                "run_id": run_id,
            }
        
        except Exception as err:
            logger.error(f"Model registration failed: {err}")
            raise

    def track_candidate(
        self,
        artifact_path: Path,
        metadata_path: Path,
        run_name: str | None = None,
    ) -> dict[str, Any]:
        """Track a candidate artifact without registering or promoting it."""
        artifact = joblib.load(artifact_path)
        metadata = artifact.get("metadata", {})
        metadata_file = json.loads(metadata_path.read_text(encoding="utf-8"))
        if metadata_file != metadata:
            raise ArtifactVerificationError("Candidate metadata file differs from artifact metadata")
        candidate_version = metadata.get("candidate_version")
        if not metadata.get("model_id") or not candidate_version:
            raise ArtifactVerificationError("Candidate metadata is missing model_id or candidate_version")

        run_id = self.tracker.create_run(
            experiment_name=self.config.experiment_name,
            run_name=run_name or f"candidate-{candidate_version}",
            tags={
                "project": "ModelWatch",
                "task": "network_intrusion_detection",
                "candidate": "true",
                "model_id": str(metadata["model_id"]),
                "model_version": str(candidate_version),
            },
        )
        try:
            self.tracker.log_parameters({
                "model_id": metadata["model_id"],
                "candidate_version": candidate_version,
                "old_model_version": metadata.get("old_model_version", "unknown"),
                "sample_count": metadata.get("sample_count", 0),
                "preprocessing_version": metadata.get("preprocessing_version", "unknown"),
            })
            metrics = metadata.get("metrics", {})
            self.tracker.log_metrics(
                {f"validation_{key}": value for key, value in metrics.items()
                 if isinstance(value, (int, float))},
            )
            if "confusion_matrix" in metrics:
                self.tracker.log_confusion_matrix(metrics["confusion_matrix"])
            self.tracker.log_tags(MLflowTracker.get_environment_info())
            self.tracker.log_model(
                artifact["model"],
                model_dir="model",
                input_example=create_nsl_kdd_input_example(),
                signature=create_nsl_kdd_signature(),
            )
            self.tracker.log_artifacts(artifact_path, artifact_path="joblib")
            self.tracker.log_artifacts(metadata_path, artifact_path="metadata")
            run_info = self.tracker.get_run_info()
            self.tracker.end_run("FINISHED")
            return {
                "run_id": run_id,
                "model_version": candidate_version,
                "artifact_uri": run_info.get("artifact_uri"),
            }
        except Exception:
            self.tracker.end_run("FAILED")
            raise

    def get_registered_model_info(self) -> dict[str, Any]:
        """Get information about the registered model."""
        try:
            client = mlflow.tracking.MlflowClient()
            model = client.get_registered_model(self.config.registered_model_name)
            
            return {
                "name": model.name,
                "latest_version": model.latest_versions[0].version if model.latest_versions else None,
                "creation_timestamp": model.creation_timestamp,
                "last_updated_timestamp": model.last_updated_timestamp,
                "versions_count": len(model.latest_versions),
            }
        except Exception as err:
            logger.warning(f"Could not fetch registered model info: {err}")
            return {}
