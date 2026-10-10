"""MLflow tracking integration for ModelWatch."""

from __future__ import annotations

import logging
import platform
from dataclasses import asdict
from pathlib import Path
from typing import Any

try:
    import mlflow
    import mlflow.sklearn
    MLFLOW_AVAILABLE = True
except ImportError:
    MLFLOW_AVAILABLE = False

from packaging import version as pkg_version
from sklearn import __version__ as sklearn_version

from .mlflow_config import MLflowConfig

logger = logging.getLogger(__name__)


class MLflowTracker:
    """Wrapper for MLflow tracking operations."""

    def __init__(self, config: MLflowConfig | None = None):
        """Initialize MLflow tracker with configuration.
        
        Args:
            config: MLflow configuration. If None, loads from environment.
        """
        self.config = config or MLflowConfig.from_environment()
        if not MLFLOW_AVAILABLE:
            raise RuntimeError("MLflow is not installed")
        self._setup_mlflow()

    def _setup_mlflow(self) -> None:
        """Configure MLflow client."""
        logger.info(f"Setting up MLflow: {self.config}")
        mlflow.set_tracking_uri(self.config.tracking_uri)
        logger.info(f"MLflow tracking URI: {self.config.tracking_uri}")

    def create_run(
        self,
        experiment_name: str | None = None,
        run_name: str | None = None,
        tags: dict[str, str] | None = None,
    ) -> str:
        """Create a new MLflow run and return the run ID.
        
        Args:
            experiment_name: Experiment name (uses config default if None)
            run_name: Run name (optional)
            tags: Initial tags to set on run
        
        Returns:
            MLflow run ID
        """
        exp_name = experiment_name or self.config.experiment_name
        
        # Set experiment (creates if doesn't exist)
        experiment = mlflow.get_experiment_by_name(exp_name)
        if experiment is None:
            logger.info(f"Creating new experiment: {exp_name}")
            exp_id = mlflow.create_experiment(exp_name)
        else:
            exp_id = experiment.experiment_id
            logger.info(f"Using existing experiment: {exp_name}")
        
        # Start run
        run = mlflow.start_run(experiment_id=exp_id, run_name=run_name)
        run_id = run.info.run_id
        logger.info(f"Started MLflow run: {run_id}")
        
        # Set initial tags
        if tags:
            mlflow.set_tags(tags)
        
        return run_id

    def log_parameters(self, params: dict[str, Any]) -> None:
        """Log parameters to MLflow run.
        
        Converts values to strings as required by MLflow.
        """
        for key, value in params.items():
            mlflow.log_param(key, str(value))
        logger.info(f"Logged {len(params)} parameters")

    def log_metrics(self, metrics: dict[str, float], step: int = 0) -> None:
        """Log metrics to MLflow run."""
        for key, value in metrics.items():
            if isinstance(value, (int, float)):
                mlflow.log_metric(key, value, step=step)
        logger.info(f"Logged {len(metrics)} metrics")

    def log_confusion_matrix(self, cm_list: list[list[int]], step: int = 0) -> None:
        """Log confusion matrix as structured data.
        
        Args:
            cm_list: 2x2 confusion matrix as list [[TN, FP], [FN, TP]]
            step: MLflow step
        """
        if len(cm_list) == 2 and len(cm_list[0]) == 2 and len(cm_list[1]) == 2:
            tn, fp, fn, tp = cm_list[0][0], cm_list[0][1], cm_list[1][0], cm_list[1][1]
            mlflow.log_metrics({
                "confusion_matrix_tn": tn,
                "confusion_matrix_fp": fp,
                "confusion_matrix_fn": fn,
                "confusion_matrix_tp": tp,
            }, step=step)
            logger.info("Logged confusion matrix elements")

    def log_tags(self, tags: dict[str, str]) -> None:
        """Log tags to MLflow run."""
        mlflow.set_tags(tags)
        logger.info(f"Logged {len(tags)} tags")

    def log_artifacts(self, local_path: Path | str, artifact_path: str = "") -> None:
        """Log artifacts to MLflow run.
        
        Args:
            local_path: Local file or directory path to log
            artifact_path: Optional artifact path within MLflow
        """
        local_path = Path(local_path)
        if local_path.is_file():
            mlflow.log_artifact(str(local_path), artifact_path)
            logger.info(f"Logged artifact file: {local_path.name}")
        elif local_path.is_dir():
            mlflow.log_artifacts(str(local_path), artifact_path)
            logger.info(f"Logged artifact directory: {local_path}")
        else:
            logger.warning(f"Artifact path not found: {local_path}")

    def log_model(
        self,
        model: Any,
        model_dir: str = "model",
        conda_env: dict[str, Any] | None = None,
        input_example: Any = None,
        signature: Any = None,
    ) -> None:
        """Log sklearn model to MLflow.
        
        Args:
            model: sklearn Pipeline or model
            model_dir: Directory name within MLflow artifacts
            conda_env: Conda environment specification
            input_example: Example model input for schema inference
            signature: MLflow model signature
        """
        mlflow.sklearn.log_model(
            model,
            model_dir,
            conda_env=conda_env,
            input_example=input_example,
            signature=signature,
            pip_requirements=[
                f"mlflow=={mlflow.__version__}",
                f"scikit-learn=={sklearn_version}",
                "joblib",
                "numpy",
                "pandas",
                "xgboost",
            ],
        )
        logger.info(f"Logged model to {model_dir}")

    def get_run_info(self) -> dict[str, Any]:
        """Get current run information."""
        run = mlflow.active_run()
        if run is None:
            raise RuntimeError("No active MLflow run")
        
        return {
            "run_id": run.info.run_id,
            "experiment_id": run.info.experiment_id,
            "status": run.info.status,
            "artifact_uri": run.info.artifact_uri,
        }

    def end_run(self, status: str = "FINISHED") -> None:
        """End the current MLflow run."""
        mlflow.end_run(status)
        logger.info(f"Ended MLflow run with status: {status}")

    @staticmethod
    def get_environment_info() -> dict[str, str]:
        """Get environment information for reproducibility tracking."""
        return {
            "python_version": platform.python_version(),
            "sklearn_version": sklearn_version,
            "mlflow_version": mlflow.__version__,
            "platform": platform.platform(),
        }
