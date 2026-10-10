"""NSL-KDD loading, label normalization, and schema validation."""

from __future__ import annotations

from pathlib import Path

import pandas as pd


def normalize_label(value: object) -> int:
    """Map NSL-KDD labels to the Phase 1 binary target contract."""
    normalized = str(value).strip().lower()
    if normalized.endswith("."):
        normalized = normalized[:-1]
    return 0 if normalized == "normal" else 1


def validate_frame(frame: pd.DataFrame, contract: dict) -> None:
    """Reject wrong columns, order, missing values, or unsupported types."""
    feature_names = [feature["name"] for feature in contract["features"]]
    expected_columns = feature_names + [contract["task"]["target_column"], "difficulty_level"]
    if list(frame.columns) != expected_columns:
        raise ValueError(
            "Dataset columns do not match the contract exactly. "
            f"Expected {expected_columns}, received {list(frame.columns)}"
        )
    if frame.isna().any().any():
        missing_columns = frame.columns[frame.isna().any()].tolist()
        raise ValueError(f"Missing values are not allowed: {missing_columns}")

    categorical_names = {
        feature["name"]
        for feature in contract["features"]
        if feature["kind"] == "categorical"
    }
    numerical_names = set(feature_names) - categorical_names
    for column in numerical_names:
        if not pd.api.types.is_numeric_dtype(frame[column]):
            raise ValueError(f"Numerical feature '{column}' contains non-numeric values")


def load_dataset(path: Path, contract: dict) -> tuple[pd.DataFrame, pd.Series]:
    """Read a headerless NSL-KDD file and return validated features and labels."""
    feature_names = [feature["name"] for feature in contract["features"]]
    columns = feature_names + [contract["task"]["target_column"], "difficulty_level"]
    frame = pd.read_csv(path, header=None, names=columns, sep=",", skipinitialspace=True)
    validate_frame(frame, contract)
    features = frame[feature_names].copy()
    labels = frame[contract["task"]["target_column"]].map(normalize_label).astype("int8")
    return features, labels