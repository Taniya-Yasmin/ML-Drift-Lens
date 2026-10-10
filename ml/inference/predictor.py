"""Prediction logic using loaded model pipeline."""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
import pandas as pd
from sklearn.pipeline import Pipeline

logger = logging.getLogger(__name__)


class PredictionError(Exception):
    """Raised when prediction fails."""

    pass


class Predictor:
    """Execute predictions using the loaded model pipeline."""

    def __init__(self, model: Pipeline, contract: dict[str, Any], metadata: dict[str, Any]) -> None:
        """Initialize predictor with model, contract, and metadata."""
        self.model = model
        self.contract = contract
        self.metadata = metadata
        self.model_version = metadata.get("model_version", "unknown")
        self.preprocessing_version = metadata.get("preprocessing_version", "unknown")

    def _contract_feature_names(self) -> list[str]:
        """Return feature names in contract order, supporting both project contract shapes."""
        features = self.contract.get("features", [])

        if isinstance(features, list):
            normalized: list[str] = []
            for feature in features:
                if isinstance(feature, dict):
                    if "name" not in feature:
                        raise PredictionError("Contract feature definition missing 'name'")
                    normalized.append(str(feature["name"]))
                elif isinstance(feature, str):
                    normalized.append(feature)
                else:
                    raise PredictionError(f"Unsupported contract feature definition: {type(feature).__name__}")
            return normalized

        if isinstance(features, dict):
            return [str(name) for name in features.keys()]

        raise PredictionError(f"Unsupported contract features format: {type(features).__name__}")

    def predict(self, input_features: dict[str, Any]) -> dict[str, Any]:
        """
        Execute prediction on input features.

        Args:
            input_features: Dict with 41 feature names and values

        Returns:
            Dict with:
                - prediction_class: 0 or 1
                - prediction: "normal" or "attack" (string)
                - confidence: float [0, 1]
                - raw_probabilities: [prob_class_0, prob_class_1]
        """
        try:
            # Validate input features
            self._validate_features(input_features)
            self._validate_categorical_features(input_features)

            # Convert to DataFrame with correct feature order
            features_df = self._prepare_features(input_features)

            # Use pipeline to transform and predict
            # Pipeline contains both preprocessing and classifier
            prediction_class = self.model.predict(features_df)[0]
            probabilities = self.model.predict_proba(features_df)[0]

            # Get confidence for predicted class
            confidence = float(probabilities[int(prediction_class)])

            # Map class to label
            prediction_label = "attack" if prediction_class == 1 else "normal"

            return {
                "prediction_class": int(prediction_class),
                "prediction": prediction_label,
                "confidence": confidence,
                "raw_probabilities": [float(p) for p in probabilities],
            }

        except PredictionError:
            raise
        except Exception as e:
            raise PredictionError(f"Prediction failed: {e}") from e

    def _validate_features(self, input_features: dict[str, Any]) -> None:
        """Validate that input features match contract."""
        contract_features = set(self._contract_feature_names())
        input_feature_names = set(input_features.keys())

        # Check for missing features
        missing = contract_features - input_feature_names
        if missing:
            raise PredictionError(f"Missing required features: {missing}")

        # Check for extra features
        extra = input_feature_names - contract_features
        if extra:
            raise PredictionError(f"Unexpected features: {extra}")

    def _prepare_features(self, input_features: dict[str, Any]) -> pd.DataFrame:
        """Convert input features dict to DataFrame in correct order."""
        feature_order = self._contract_feature_names()

        # Create DataFrame with features in contract order
        df_data = {feat: [input_features[feat]] for feat in feature_order}
        df = pd.DataFrame(df_data)

        return df

    def _validate_categorical_features(self, input_features: dict[str, Any]) -> None:
        """Reject categories outside the fitted vocabulary before production inference."""
        contract_features = self.contract.get("features", [])
        categorical_names = [
            feature["name"]
            for feature in contract_features
            if isinstance(feature, dict) and feature.get("kind") == "categorical"
        ]
        if not categorical_names:
            return

        pipeline_steps = getattr(self.model, "named_steps", {})
        preprocessing = pipeline_steps.get("preprocessing")
        transformers = getattr(preprocessing, "named_transformers_", {})
        categorical_pipeline = transformers.get("categorical")
        encoder = getattr(categorical_pipeline, "named_steps", {}).get("encoder")
        categories = getattr(encoder, "categories_", None)
        if categories is None:
            return

        for feature_name, accepted_values in zip(categorical_names, categories):
            if input_features[feature_name] not in accepted_values:
                raise PredictionError(
                    f"Unknown category for feature '{feature_name}': {input_features[feature_name]}"
                )
