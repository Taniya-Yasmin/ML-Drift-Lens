from pathlib import Path

import joblib
import pandas as pd
import pytest
from sklearn.metrics import confusion_matrix

from ml.model.config import load_contract
from ml.model.pipeline import build_model_pipeline
from ml.model.train import analyze_class_distribution, evaluate


CONTRACT = load_contract(Path(__file__).parents[1] / "contracts" / "nsl_kdd_data_contract.json")
FEATURES = [feature["name"] for feature in CONTRACT["features"]]


def fixture_data() -> tuple[pd.DataFrame, pd.Series]:
    rows = []
    labels = []
    for index in range(12):
        row = {name: float(index + 1) for name in FEATURES}
        row.update({"protocol_type": "tcp" if index % 2 else "udp", "service": "http", "flag": "SF"})
        rows.append(row)
        labels.append(index % 2)
    return pd.DataFrame(rows, columns=FEATURES), pd.Series(labels)


def test_pipeline_fits_and_evaluates_real_fixture_data() -> None:
    features, labels = fixture_data()
    model = build_model_pipeline(CONTRACT).fit(features, labels)
    metrics = evaluate(model, features, labels)
    assert set(metrics) >= {"accuracy", "precision", "recall", "f1", "confusion_matrix", 
                            "true_positives", "true_negatives", "false_positives", "false_negatives"}
    assert metrics["confusion_matrix"] == confusion_matrix(labels, model.predict(features), labels=[0, 1]).tolist()
    assert 0 <= metrics["accuracy"] <= 1
    assert 0 <= metrics["precision"] <= 1
    assert 0 <= metrics["recall"] <= 1
    assert 0 <= metrics["f1"] <= 1


def test_pipeline_evaluates_unknown_category_from_holdout_data() -> None:
    features, labels = fixture_data()
    model = build_model_pipeline(CONTRACT).fit(features, labels)
    features.loc[0, "protocol_type"] = "unknown_protocol"
    predictions = model.predict(features)
    assert predictions.shape == (len(features),)


def test_model_generates_probability_predictions() -> None:
    features, labels = fixture_data()
    model = build_model_pipeline(CONTRACT).fit(features, labels)
    probabilities = model.predict_proba(features)
    assert probabilities.shape == (len(labels), 2)
    assert (probabilities >= 0).all() and (probabilities <= 1).all()
    assert abs((probabilities.sum(axis=1) - 1).max()) < 1e-10


def test_metrics_include_confusion_matrix_elements() -> None:
    features, labels = fixture_data()
    model = build_model_pipeline(CONTRACT).fit(features, labels)
    metrics = evaluate(model, features, labels)
    
    tp = metrics["true_positives"]
    tn = metrics["true_negatives"]
    fp = metrics["false_positives"]
    fn = metrics["false_negatives"]
    
    # Verify confusion matrix structure
    cm = metrics["confusion_matrix"]
    assert cm[0][0] == tn
    assert cm[0][1] == fp
    assert cm[1][0] == fn
    assert cm[1][1] == tp
    
    # Verify all elements are non-negative
    assert tp >= 0 and tn >= 0 and fp >= 0 and fn >= 0


def test_roc_auc_present_when_both_classes_present() -> None:
    features, labels = fixture_data()
    model = build_model_pipeline(CONTRACT).fit(features, labels)
    metrics = evaluate(model, features, labels)
    # If both classes are present, ROC-AUC should be calculated
    if len(labels.unique()) == 2:
        assert "roc_auc" in metrics
        assert 0 <= metrics["roc_auc"] <= 1


def test_class_distribution_analysis() -> None:
    features, labels = fixture_data()
    dist = analyze_class_distribution(labels, "test")
    
    assert "distribution" in dist
    assert "percentages" in dist
    assert "0" in dist["distribution"]
    assert "1" in dist["distribution"]
    assert sum(dist["distribution"].values()) == len(labels)
    assert abs(sum(dist["percentages"].values()) - 100.0) < 0.1


def test_model_artifact_can_be_saved_and_loaded(tmp_path):
    """Test that trained model can be saved and loaded with joblib."""
    features, labels = fixture_data()
    model = build_model_pipeline(CONTRACT).fit(features, labels)
    
    artifact_path = tmp_path / "test_model.joblib"
    metadata = {
        "model_id": "test-model",
        "model_version": "0.1.0",
        "preprocessing_version": "preprocessing-v1",
    }
    
    joblib.dump({"model": model, "contract": CONTRACT, "metadata": metadata}, artifact_path)
    
    # Load and verify
    loaded = joblib.load(artifact_path)
    assert "model" in loaded
    assert "contract" in loaded
    assert "metadata" in loaded
    
    # Verify loaded model makes same predictions
    predictions_orig = model.predict(features)
    predictions_loaded = loaded["model"].predict(features)
    assert (predictions_orig == predictions_loaded).all()


def test_training_does_not_use_test_data() -> None:
    """Verify that training set preprocessing is fitted only on training data."""
    features, labels = fixture_data()
    
    # Create a separate test set with unseen categorical values
    test_features = features.copy()
    test_features.loc[0, "protocol_type"] = "unknown_protocol"
    
    # Train model on training data only
    model = build_model_pipeline(CONTRACT).fit(features, labels)
    
    # Holdout-only categories remain absent from fitted vocabulary but can be evaluated.
    encoder = model.named_steps["preprocessing"].named_transformers_["categorical"].named_steps["encoder"]
    assert "unknown_protocol" not in encoder.categories_[0]
    assert model.predict(test_features).shape == (len(test_features),)
