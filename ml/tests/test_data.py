from pathlib import Path

import pandas as pd
import pytest

from ml.model.config import load_contract
from ml.model.data import normalize_label, validate_frame


CONTRACT = load_contract(Path(__file__).parents[1] / "contracts" / "nsl_kdd_data_contract.json")
FEATURES = [feature["name"] for feature in CONTRACT["features"]]
COLUMNS = FEATURES + ["label", "difficulty_level"]


def valid_frame() -> pd.DataFrame:
    row = {name: 0.0 for name in FEATURES}
    row.update({"protocol_type": "tcp", "service": "http", "flag": "SF", "label": "normal", "difficulty_level": 1})
    return pd.DataFrame([row], columns=COLUMNS)


def test_label_mapping_is_binary_and_normalizes_periods() -> None:
    assert normalize_label(" normal. ") == 0
    assert normalize_label("neptune.") == 1


def test_schema_validation_accepts_contract_frame() -> None:
    validate_frame(valid_frame(), CONTRACT)


def test_schema_validation_rejects_missing_values() -> None:
    frame = valid_frame()
    frame.loc[0, "duration"] = None
    with pytest.raises(ValueError, match="Missing values"):
        validate_frame(frame, CONTRACT)


def test_schema_validation_rejects_wrong_columns() -> None:
    frame = valid_frame().rename(columns={"duration": "wrong_name"})
    with pytest.raises(ValueError, match="columns do not match"):
        validate_frame(frame, CONTRACT)