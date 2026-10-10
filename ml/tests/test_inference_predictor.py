"""Tests for inference predictor."""

from __future__ import annotations

from typing import Any

import pytest
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from ml.inference.predictor import PredictionError, Predictor


@pytest.fixture
def simple_pipeline() -> Pipeline:
    """Create a simple pipeline with StandardScaler and LogisticRegression."""
    # Create and fit pipeline on dummy data
    import numpy as np

    pipeline = Pipeline([("scaler", StandardScaler()), ("clf", LogisticRegression(random_state=42))])

    # Fit with dummy data (2 features, 2 classes)
    X = np.array([[1.0, 2.0], [2.0, 3.0], [4.0, 5.0], [5.0, 6.0]])
    y = np.array([0, 0, 1, 1])
    pipeline.fit(X, y)

    return pipeline


@pytest.fixture
def predictor(simple_pipeline: Pipeline) -> Predictor:
    """Create a predictor with simple pipeline."""
    contract = {
        "features": {"feat1": "numeric", "feat2": "numeric"},
    }
    metadata = {
        "model_version": "0.1.0",
        "preprocessing_version": "0.1.0",
    }
    return Predictor(simple_pipeline, contract, metadata)


def test_predictor_valid_prediction(predictor: Predictor) -> None:
    """Test prediction with valid input."""
    input_features = {"feat1": 1.0, "feat2": 2.0}
    result = predictor.predict(input_features)

    assert "prediction_class" in result
    assert "prediction" in result
    assert "confidence" in result
    assert "raw_probabilities" in result

    assert result["prediction_class"] in [0, 1]
    assert result["prediction"] in ["normal", "attack"]
    assert 0.0 <= result["confidence"] <= 1.0
    assert len(result["raw_probabilities"]) == 2


def test_predictor_missing_features(predictor: Predictor) -> None:
    """Test error when features are missing."""
    input_features = {"feat1": 1.0}  # Missing feat2

    with pytest.raises(PredictionError, match="Missing required features"):
        predictor.predict(input_features)


def test_predictor_extra_features(predictor: Predictor) -> None:
    """Test error when extra features provided."""
    input_features = {"feat1": 1.0, "feat2": 2.0, "feat3": 3.0}  # Extra feat3

    with pytest.raises(PredictionError, match="Unexpected features"):
        predictor.predict(input_features)


def test_predictor_empty_features(predictor: Predictor) -> None:
    """Test error with empty features."""
    input_features = {}

    with pytest.raises(PredictionError, match="Missing required features"):
        predictor.predict(input_features)


def test_predictor_prediction_class_mapping(predictor: Predictor) -> None:
    """Test that prediction class is correctly mapped to label."""
    # Test with a value that should predict class 0
    result1 = predictor.predict({"feat1": 1.0, "feat2": 2.0})
    if result1["prediction_class"] == 0:
        assert result1["prediction"] == "normal"
    else:
        assert result1["prediction"] == "attack"

    # Test with a value that should predict class 1
    result2 = predictor.predict({"feat1": 5.0, "feat2": 6.0})
    if result2["prediction_class"] == 0:
        assert result2["prediction"] == "normal"
    else:
        assert result2["prediction"] == "attack"


def test_predictor_confidence_matches_probability(predictor: Predictor) -> None:
    """Test that confidence matches the predicted class probability."""
    result = predictor.predict({"feat1": 1.0, "feat2": 2.0})

    predicted_class = result["prediction_class"]
    confidence = result["confidence"]
    probabilities = result["raw_probabilities"]

    assert confidence == probabilities[predicted_class]


def test_predictor_metadata_access(predictor: Predictor) -> None:
    """Test access to model metadata."""
    assert predictor.model_version == "0.1.0"
    assert predictor.preprocessing_version == "0.1.0"


def test_predictor_rejects_categories_outside_fitted_vocabulary() -> None:
    model = Pipeline([
        ("preprocessing", ColumnTransformer([
            ("categorical", Pipeline([
                ("encoder", OneHotEncoder(handle_unknown="ignore")),
            ]), ["protocol_type"]),
        ])),
        ("classifier", LogisticRegression(random_state=42)),
    ])
    features = pd.DataFrame({"protocol_type": ["tcp", "udp", "tcp", "udp"]})
    model.fit(features, [0, 0, 1, 1])
    predictor = Predictor(
        model,
        {"features": [{"name": "protocol_type", "kind": "categorical"}]},
        {"model_version": "0.1.0", "preprocessing_version": "preprocessing-v1"},
    )

    with pytest.raises(PredictionError, match="Unknown category for feature 'protocol_type'"):
        predictor.predict({"protocol_type": "unknown_protocol"})
