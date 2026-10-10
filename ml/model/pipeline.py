"""The single preprocessing pipeline shared by training and future inference."""

from __future__ import annotations

from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from xgboost import XGBClassifier


def build_model_pipeline(contract: dict) -> Pipeline:
    """Build an unfitted, deterministic preprocessing-plus-classifier pipeline."""
    categorical = [
        feature["name"]
        for feature in contract["features"]
        if feature["kind"] == "categorical"
    ]
    numerical = [
        feature["name"]
        for feature in contract["features"]
        if feature["kind"] == "numerical"
    ]
    numerical_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )
    categorical_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
        ]
    )
    preprocessing = ColumnTransformer(
        transformers=[
            ("numerical", numerical_pipeline, numerical),
            ("categorical", categorical_pipeline, categorical),
        ],
        remainder="drop",
        verbose_feature_names_out=False,
    )
    return Pipeline(
        steps=[
            ("preprocessing", preprocessing),
            ("classifier", XGBClassifier(
                n_estimators=100,
                max_depth=6,
                learning_rate=0.1,
                random_state=42,
                use_label_encoder=False,
                eval_metric='logloss',
                verbosity=0,
            )),
        ]
    )