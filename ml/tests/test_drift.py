import numpy as np

from ml.drift import calculate_psi, evaluate_psi_drift


def test_identical_distributions_have_low_psi() -> None:
    baseline = np.array([0.0] * 50 + [1.0] * 50)
    current = np.array([0.0] * 50 + [1.0] * 50)

    psi_value = calculate_psi(baseline, current)

    assert psi_value < 0.10

    result = evaluate_psi_drift(baseline, current, threshold=0.20, min_samples=30)
    assert result["overall_score"] < 0.10
    assert result["status"] == "low_drift"


def test_moderately_shifted_distribution_has_higher_psi() -> None:
    baseline = np.array([0.0] * 80 + [1.0] * 20)
    current = np.array([0.0] * 65 + [1.0] * 35)

    psi_value = calculate_psi(baseline, current)

    assert 0.10 < psi_value < 0.20

    result = evaluate_psi_drift(baseline, current, threshold=0.20, min_samples=30)
    assert 0.10 <= result["overall_score"] < 0.20
    assert result["status"] == "moderate_drift"


def test_strongly_shifted_distribution_has_significant_psi() -> None:
    baseline = np.array([0.0] * 90 + [1.0] * 10)
    current = np.array([1.0] * 90 + [0.0] * 10)

    psi_value = calculate_psi(baseline, current)

    assert psi_value >= 0.20

    result = evaluate_psi_drift(baseline, current, threshold=0.20, min_samples=30)
    assert result["overall_score"] >= 0.20
    assert result["status"] == "significant_drift"


def test_insufficient_recent_sample_returns_insufficient_data() -> None:
    baseline = np.array([0.0] * 80 + [1.0] * 20)
    current = np.array([0.0] * 10 + [1.0] * 10)

    result = evaluate_psi_drift(
        baseline,
        current,
        threshold=0.20,
        min_samples=30,
        feature_names=["feature_a"],
    )

    assert result["status"] == "insufficient_data"
    assert result["overall_score"] == 0.0
    assert result["number_of_rows"] == 20


def test_default_minimum_protects_small_normal_windows() -> None:
    baseline = np.array([0.0] * 50 + [1.0] * 50)
    current = np.array([0.0] * 15 + [1.0] * 15)

    result = evaluate_psi_drift(baseline, current)

    assert result["status"] == "insufficient_data"
    assert result["overall_score"] == 0.0
    assert result["number_of_rows"] == 30


def test_baseline_anchored_bins_keep_normal_reference_window_below_threshold() -> None:
    baseline = np.linspace(0.0, 1.0, 1000)
    current = baseline[::10]

    result = evaluate_psi_drift(baseline, current, min_samples=100)

    assert result["overall_score"] < 0.20
    assert result["status"] in {"low_drift", "moderate_drift"}
