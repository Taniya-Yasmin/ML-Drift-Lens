import numpy as np
import pandas as pd


def _validate_drift_inputs(
    baseline_df: pd.DataFrame, current_df: pd.DataFrame, numeric_cols: list
) -> None:
    """Reject invalid batches before they enter the established drift calculations."""
    for frame_name, frame in (("baseline", baseline_df), ("current", current_df)):
        if frame.empty:
            raise ValueError(f"{frame_name} drift data must contain at least one row")

        missing = set(numeric_cols).difference(frame.columns)
        if missing:
            raise ValueError(f"{frame_name} drift data is missing columns: {sorted(missing)}")

        for column in numeric_cols:
            try:
                values = frame[column].to_numpy(dtype=float)
            except (TypeError, ValueError) as exc:
                raise ValueError(f"{frame_name}.{column} must contain numeric values") from exc
            if not np.isfinite(values).all():
                raise ValueError(f"{frame_name}.{column} must not contain NaN or infinite values")


def calculate_psi(baseline: np.ndarray, current: np.ndarray, bins: int = 10) -> float:
    """
    Population Stability Index for a single numeric feature.
    PSI < 0.1  -> no significant shift
    0.1-0.25   -> moderate shift
    PSI >= 0.25 -> significant drift
    """
    # Reduce bin count for small batches to avoid noisy PSI estimates
    effective_bins = min(bins, max(2, len(current) // 10))

    breakpoints = np.linspace(0, 100, effective_bins + 1)
    bin_edges = np.percentile(baseline, breakpoints)
    bin_edges[0] -= 1e-6
    bin_edges[-1] += 1e-6
    bin_edges = np.unique(bin_edges)

    if len(bin_edges) < 2:
        return 0.0

    baseline_counts, _ = np.histogram(baseline, bins=bin_edges)
    current_counts, _ = np.histogram(current, bins=bin_edges)

    baseline_pct = baseline_counts / len(baseline) + 1e-6
    current_pct = current_counts / len(current) + 1e-6

    psi = np.sum((current_pct - baseline_pct) * np.log(current_pct / baseline_pct))
    return float(psi)


def calculate_zscore(baseline: np.ndarray, current: np.ndarray) -> float:
    """Z-score of the current batch's mean relative to baseline distribution."""
    baseline_mean, baseline_std = np.mean(baseline), np.std(baseline)
    current_mean = np.mean(current)
    if baseline_std == 0:
        return 0.0
    return float((current_mean - baseline_mean) / baseline_std)


def detect_drift(baseline_df: pd.DataFrame, current_df: pd.DataFrame,
                  numeric_cols: list, psi_threshold: float = 0.25) -> dict:
    """
    Compares current_df against baseline_df across all numeric_cols.
    Returns per-feature PSI/Z-score plus an overall drift verdict.
    """
    _validate_drift_inputs(baseline_df, current_df, numeric_cols)

    results = {}
    drifted_features = []

    for col in numeric_cols:
        psi = calculate_psi(baseline_df[col].values, current_df[col].values)
        z = calculate_zscore(baseline_df[col].values, current_df[col].values)
        results[col] = {"psi": round(psi, 4), "zscore": round(z, 4)}
        if psi >= psi_threshold:
            drifted_features.append(col)

    overall_status = "drift" if len(drifted_features) > 0 else "no_drift"

    return {
        "status": overall_status,
        "drifted_features": drifted_features,
        "num_drifted_features": len(drifted_features),
        "total_features_checked": len(numeric_cols),
        "per_feature": results
    }
