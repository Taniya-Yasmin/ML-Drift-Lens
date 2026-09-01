import numpy as np
import pandas as pd
import pytest

from app.drift import detect_drift


def test_identical_distributions_do_not_flag_drift():
    baseline = pd.DataFrame({"feature": np.linspace(0, 100, 100)})

    result = detect_drift(baseline, baseline.copy(), ["feature"])

    assert result["status"] == "no_drift"
    assert result["drifted_features"] == []
    assert result["per_feature"]["feature"]["psi"] == 0.0


def test_shifted_distribution_flags_drift():
    baseline = pd.DataFrame({"feature": np.linspace(0, 100, 100)})
    shifted = pd.DataFrame({"feature": np.linspace(1_000, 1_100, 100)})

    result = detect_drift(baseline, shifted, ["feature"], psi_threshold=0.25)

    assert result["status"] == "drift"
    assert result["drifted_features"] == ["feature"]
    assert result["per_feature"]["feature"]["psi"] >= 0.25


def test_empty_batch_is_rejected_before_drift_calculation():
    baseline = pd.DataFrame({"feature": [1.0, 2.0]})

    with pytest.raises(ValueError, match="current drift data must contain at least one row"):
        detect_drift(baseline, pd.DataFrame({"feature": []}), ["feature"])


def test_single_data_point_returns_a_finite_result():
    baseline = pd.DataFrame({"feature": np.linspace(0, 100, 100)})

    result = detect_drift(baseline, pd.DataFrame({"feature": [50.0]}), ["feature"])

    assert np.isfinite(result["per_feature"]["feature"]["psi"])
    assert np.isfinite(result["per_feature"]["feature"]["zscore"])


def test_all_identical_values_do_not_create_spurious_drift():
    baseline = pd.DataFrame({"feature": [5.0] * 20})

    result = detect_drift(baseline, baseline.copy(), ["feature"])

    assert result["status"] == "no_drift"
    assert result["per_feature"]["feature"] == {"psi": 0.0, "zscore": 0.0}


def test_nan_values_are_rejected_before_drift_calculation():
    baseline = pd.DataFrame({"feature": [1.0, 2.0, 3.0]})
    current = pd.DataFrame({"feature": [1.0, np.nan, 3.0]})

    with pytest.raises(ValueError, match="must not contain NaN or infinite values"):
        detect_drift(baseline, current, ["feature"])
