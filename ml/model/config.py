"""Configuration and contract loading for the baseline model."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class ModelConfig:
    contract_path: Path
    train_path: Path
    test_path: Path
    artifact_path: Path
    metadata_path: Path
    model_id: str = "nsl-kdd-baseline"
    model_version: str = "0.1.0"


def load_contract(path: Path) -> dict[str, Any]:
    """Load and minimally validate the Phase 1 JSON contract."""
    with path.open(encoding="utf-8") as contract_file:
        contract = json.load(contract_file)

    required_sections = {"dataset", "task", "features", "preprocessing", "split"}
    missing_sections = required_sections - contract.keys()
    if missing_sections:
        raise ValueError(f"Contract is missing sections: {sorted(missing_sections)}")
    if contract["task"]["target_column"] != "label":
        raise ValueError("This trainer requires the contract target column to be 'label'")
    if len(contract["features"]) != 41:
        raise ValueError("NSL-KDD contract must define exactly 41 features")
    return contract