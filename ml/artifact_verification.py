"""Artifact loading and verification module for ModelWatch."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import joblib
from sklearn.pipeline import Pipeline

logger = logging.getLogger(__name__)


class ArtifactVerificationError(Exception):
    """Raised when artifact verification fails."""

    pass


def verify_artifact_exists(artifact_path: Path) -> None:
    """Verify that the model artifact file exists."""
    if not artifact_path.exists():
        raise ArtifactVerificationError(
            f"Model artifact not found at {artifact_path}. "
            f"Run training first: python -m ml.model --artifact {artifact_path} ..."
        )
    if not artifact_path.is_file():
        raise ArtifactVerificationError(f"Artifact path is not a file: {artifact_path}")


def load_artifact(artifact_path: Path) -> dict[str, Any]:
    """Load and verify the model artifact structure.
    
    Returns dict with keys:
        - model: sklearn Pipeline
        - contract: data contract dict
        - metadata: training metadata dict
    """
    verify_artifact_exists(artifact_path)
    
    try:
        artifact = joblib.load(artifact_path)
    except Exception as err:
        raise ArtifactVerificationError(
            f"Failed to load artifact from {artifact_path}: {err}"
        ) from err
    
    return artifact


def verify_artifact_structure(artifact: dict[str, Any]) -> None:
    """Verify that the artifact contains expected components."""
    required_keys = {"model", "contract", "metadata"}
    missing_keys = required_keys - set(artifact.keys())
    if missing_keys:
        raise ArtifactVerificationError(
            f"Artifact is missing required keys: {missing_keys}"
        )
    
    # Verify model is a Pipeline
    if not isinstance(artifact["model"], Pipeline):
        raise ArtifactVerificationError(
            f"Expected artifact['model'] to be sklearn Pipeline, got {type(artifact['model'])}"
        )
    
    # Verify pipeline has preprocessing and classifier
    pipeline_steps = {name for name, _ in artifact["model"].named_steps.items()}
    required_steps = {"preprocessing", "classifier"}
    missing_steps = required_steps - pipeline_steps
    if missing_steps:
        raise ArtifactVerificationError(
            f"Pipeline is missing required steps: {missing_steps}"
        )
    
    # Verify metadata structure
    if not isinstance(artifact["metadata"], dict):
        raise ArtifactVerificationError("Metadata must be a dictionary")
    
    metadata = artifact["metadata"]
    required_metadata = {
        "model_id",
        "model_version",
        "preprocessing_version",
        "validation_metrics",
        "test_metrics",
    }
    missing_metadata = required_metadata - set(metadata.keys())
    if missing_metadata:
        raise ArtifactVerificationError(
            f"Metadata is missing required fields: {missing_metadata}"
        )


def verify_versioning(metadata: dict[str, Any]) -> None:
    """Verify that model and preprocessing versions are present and valid."""
    model_version = metadata.get("model_version")
    preprocessing_version = metadata.get("preprocessing_version")
    
    if not model_version:
        raise ArtifactVerificationError("Metadata missing 'model_version'")
    if not preprocessing_version:
        raise ArtifactVerificationError("Metadata missing 'preprocessing_version'")
    
    logger.info(f"Model version: {model_version}")
    logger.info(f"Preprocessing version: {preprocessing_version}")


def load_metadata(metadata_path: Path) -> dict[str, Any]:
    """Load and return metadata JSON file."""
    if not metadata_path.exists():
        raise ArtifactVerificationError(
            f"Metadata file not found at {metadata_path}"
        )
    
    try:
        with metadata_path.open(encoding="utf-8") as f:
            metadata = json.load(f)
    except Exception as err:
        raise ArtifactVerificationError(
            f"Failed to load metadata from {metadata_path}: {err}"
        ) from err
    
    return metadata


def verify_artifact_complete(
    artifact_path: Path,
    metadata_path: Path | None = None,
) -> dict[str, Any]:
    """Complete verification workflow.
    
    Returns the loaded artifact dict if all checks pass.
    
    Raises ArtifactVerificationError if any check fails.
    """
    logger.info(f"Verifying artifact at {artifact_path}")
    
    # Load the artifact
    artifact = load_artifact(artifact_path)
    
    # Verify structure
    verify_artifact_structure(artifact)
    
    # Verify versioning
    verify_versioning(artifact["metadata"])
    
    # If metadata path is provided, verify it can be loaded
    if metadata_path is not None:
        loaded_metadata = load_metadata(metadata_path)
        if loaded_metadata != artifact["metadata"]:
            logger.warning(
                "Metadata in artifact differs from metadata file. "
                "Artifact metadata will be used."
            )
    
    logger.info("✓ Artifact verification passed")
    return artifact
