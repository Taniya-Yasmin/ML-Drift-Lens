"""MLflow model signature for NSL-KDD intrusion detection."""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
import pandas as pd

try:
    from mlflow.models import ModelSignature
    from mlflow.types.schema import ColSpec, Schema
    MLFLOW_AVAILABLE = True
except ImportError:
    MLFLOW_AVAILABLE = False
    ModelSignature = None
    ColSpec = None
    Schema = None

logger = logging.getLogger(__name__)


def create_nsl_kdd_signature():
    """Create MLflow model signature for NSL-KDD input/output.
    
    The signature documents that:
    - Input: 41 numerical/categorical features from NSL-KDD
    - Output: Binary classification (0=normal, 1=attack)
    
    This prevents training/serving mismatch and enables MLflow
    to validate inputs against the expected schema.
    
    Returns None if MLflow is not available.
    """
    if not MLFLOW_AVAILABLE:
        logger.warning("MLflow not available; model signature will not be created")
        return None
    
    # Input schema: 41 NSL-KDD features
    input_features = [
        "duration", "protocol_type", "service", "flag", "src_bytes", "dst_bytes",
        "land", "wrong_fragment", "urgent", "hot", "num_failed_logins", "logged_in",
        "num_compromised", "root_shell", "su_attempted", "num_root", "num_file_creations",
        "num_shells", "num_access_files", "num_outbound_cmds", "is_host_login", "is_guest_login",
        "count", "srv_count", "serror_rate", "srv_serror_rate", "rerror_rate", "srv_rerror_rate",
        "same_srv_rate", "diff_srv_rate", "srv_diff_host_rate", "dst_host_count", "dst_host_srv_count",
        "dst_host_same_srv_rate", "dst_host_diff_srv_rate", "dst_host_same_src_port_rate",
        "dst_host_srv_diff_host_rate", "dst_host_serror_rate", "dst_host_srv_serror_rate",
        "dst_host_rerror_rate", "dst_host_srv_rerror_rate"
    ]
    
    # Most features are numeric; protocol_type, service, flag are categorical
    categorical_features = {"protocol_type", "service", "flag"}
    
    # Build input column specifications
    input_cols = []
    for feature in input_features:
        if feature in categorical_features:
            input_cols.append(ColSpec(type="string", name=feature))
        else:
            input_cols.append(ColSpec(type="double", name=feature))
    
    input_schema = Schema(input_cols)
    
    # Output schema: binary classification (0 or 1)
    output_schema = Schema([ColSpec(type="integer", name="prediction")])
    
    signature = ModelSignature(inputs=input_schema, outputs=output_schema)
    logger.info(f"Created model signature with {len(input_features)} input features")
    return signature


def create_nsl_kdd_input_example() -> pd.DataFrame:
    """Create an example NSL-KDD input for documentation.
    
    This example is used by MLflow to document expected input format.
    Values are representative but not from actual NSL-KDD data.
    """
    example_dict = {
        "duration": 0.0,
        "protocol_type": "tcp",
        "service": "http",
        "flag": "SF",
        "src_bytes": 0.0,
        "dst_bytes": 0.0,
        "land": 0.0,
        "wrong_fragment": 0.0,
        "urgent": 0.0,
        "hot": 0.0,
        "num_failed_logins": 0.0,
        "logged_in": 0.0,
        "num_compromised": 0.0,
        "root_shell": 0.0,
        "su_attempted": 0.0,
        "num_root": 0.0,
        "num_file_creations": 0.0,
        "num_shells": 0.0,
        "num_access_files": 0.0,
        "num_outbound_cmds": 0.0,
        "is_host_login": 0.0,
        "is_guest_login": 0.0,
        "count": 0.0,
        "srv_count": 0.0,
        "serror_rate": 0.0,
        "srv_serror_rate": 0.0,
        "rerror_rate": 0.0,
        "srv_rerror_rate": 0.0,
        "same_srv_rate": 0.0,
        "diff_srv_rate": 0.0,
        "srv_diff_host_rate": 0.0,
        "dst_host_count": 0.0,
        "dst_host_srv_count": 0.0,
        "dst_host_same_srv_rate": 0.0,
        "dst_host_diff_srv_rate": 0.0,
        "dst_host_same_src_port_rate": 0.0,
        "dst_host_srv_diff_host_rate": 0.0,
        "dst_host_serror_rate": 0.0,
        "dst_host_srv_serror_rate": 0.0,
        "dst_host_rerror_rate": 0.0,
        "dst_host_srv_rerror_rate": 0.0,
    }
    return pd.DataFrame([example_dict])
