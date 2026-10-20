from fastapi import FastAPI, HTTPException
import pandas as pd
import numpy as np
import joblib
import requests
import os
import mlflow
import xgboost as xgb
from mlflow import MlflowClient
from mlflow.exceptions import MlflowException
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
from datetime import datetime, timezone

from app.schema import HealthResponse, RetrainRequest, RetrainResponse

app = FastAPI(
    title="ML Drift Lens — Retraining Service",
    version="1.0.0",
    description=(
        "Retrains the intrusion-detection model, stages it in MLflow Model Registry, "
        "and promotes it only when the configured F1 threshold is met."
    ),
    openapi_tags=[
        {"name": "Retraining", "description": "Model retraining and registry promotion."},
        {"name": "Service Health", "description": "Service liveness checks."},
    ],
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE_DIR, "models", "model_v1.pkl")
ENCODERS_PATH = os.path.join(BASE_DIR, "models", "encoders.pkl")
TRAIN_DATA_PATH = os.path.join(BASE_DIR, "data", "KDDTrain+.txt")
TEST_DATA_PATH = os.path.join(BASE_DIR, "data", "KDDTest+.txt")

_EXPRESS_API_URL = os.getenv("EXPRESS_API_URL", "http://localhost:3000/api").rstrip("/")
MODELS_API = f"{_EXPRESS_API_URL}/models"
RETRAINING_API = f"{_EXPRESS_API_URL}/retraining"

MODEL_ID = "model_v1"
MODEL_REGISTRY_NAME = "intrusion-detection-model"

# A candidate must improve on the active production model by at least this
# absolute F1 margin before it can replace it. This prevents churn on noise.
MIN_F1_IMPROVEMENT = 0.005

COLUMN_NAMES = [
    "duration", "protocol_type", "service", "flag", "src_bytes",
    "dst_bytes", "land", "wrong_fragment", "urgent", "hot",
    "num_failed_logins", "logged_in", "num_compromised", "root_shell",
    "su_attempted", "num_root", "num_file_creations", "num_shells",
    "num_access_files", "num_outbound_cmds", "is_host_login",
    "is_guest_login", "count", "srv_count", "serror_rate",
    "srv_serror_rate", "rerror_rate", "srv_rerror_rate", "same_srv_rate",
    "diff_srv_rate", "srv_diff_host_rate", "dst_host_count",
    "dst_host_srv_count", "dst_host_same_srv_rate", "dst_host_diff_srv_rate",
    "dst_host_same_src_port_rate", "dst_host_srv_diff_host_rate",
    "dst_host_serror_rate", "dst_host_srv_serror_rate",
    "dst_host_rerror_rate", "dst_host_srv_rerror_rate",
    "label", "difficulty_level"
]
CAT_COLS = ["protocol_type", "service", "flag"]

# Compose/Railway inject MLFLOW_TRACKING_URI. If unset, MLflow keeps its
# local file store so importing this module in tests does not need a server.
_mlflow_tracking_uri = os.getenv("MLFLOW_TRACKING_URI")
if _mlflow_tracking_uri:
    mlflow.set_tracking_uri(_mlflow_tracking_uri)

mlflow.set_experiment("intrusion-detection")


def evaluate_model(model, encoders, X_test, y_test):
    preds = model.predict(X_test)
    return {
        "accuracy": accuracy_score(y_test, preds),
        "precision_score": precision_score(y_test, preds),
        "recall": recall_score(y_test, preds),
        "f1_score": f1_score(y_test, preds),
    }


def get_current_active_metrics():
    """Fetch the currently active model's stored metrics from the backend."""
    try:
        resp = requests.get(MODELS_API, timeout=5)
        resp.raise_for_status()
        rows = resp.json()
        active = [r for r in rows if r.get("model_id") == MODEL_ID and r.get("is_active")]
        if active:
            return active[0]
    except requests.exceptions.RequestException as e:
        print(f"WARNING: could not fetch current model metrics: {e}")
    return None


def meets_promotion_threshold(new_metrics: dict, current_metrics: dict | None) -> bool:
    """Return whether a staged candidate is eligible to replace production."""
    if current_metrics is None or current_metrics.get("f1_score") is None:
        return True
    return new_metrics["f1_score"] >= (
        float(current_metrics["f1_score"]) + MIN_F1_IMPROVEMENT
    )


def register_candidate_in_staging(client: MlflowClient, run_id: str) -> str:
    """Create an MLflow registry version from this run and move it to Staging."""
    try:
        client.get_registered_model(MODEL_REGISTRY_NAME)
    except MlflowException as exc:
        if exc.error_code != "RESOURCE_DOES_NOT_EXIST":
            raise
        client.create_registered_model(MODEL_REGISTRY_NAME)

    model_version = client.create_model_version(
        name=MODEL_REGISTRY_NAME,
        source=f"runs:/{run_id}/model",
        run_id=run_id,
    )
    client.transition_model_version_stage(
        name=MODEL_REGISTRY_NAME,
        version=str(model_version.version),
        stage="Staging",
        archive_existing_versions=False,
    )
    return str(model_version.version)


def promote_staged_model_if_eligible(
    client: MlflowClient,
    candidate_version: str,
    new_metrics: dict,
    current_metrics: dict | None,
) -> bool:
    """Promote only an eligible staged model and archive the old production version."""
    if not meets_promotion_threshold(new_metrics, current_metrics):
        return False

    client.transition_model_version_stage(
        name=MODEL_REGISTRY_NAME,
        version=candidate_version,
        stage="Production",
        archive_existing_versions=True,
    )
    return True


@app.get(
    "/health",
    response_model=HealthResponse,
    tags=["Service Health"],
    summary="Check retraining service health",
    description="Returns the liveness status of the retraining API.",
)
def health() -> HealthResponse:
    return {"status": "ok"}


@app.post(
    "/retrain",
    response_model=RetrainResponse,
    tags=["Retraining"],
    summary="Retrain and evaluate a candidate model",
    description=(
        "Runs the established retraining workflow, registers the candidate in MLflow "
        "Staging, and promotes it to Production only when it meets the F1 improvement gate."
    ),
)
def retrain(request: RetrainRequest) -> RetrainResponse:
    triggered_by = request.triggered_by

    start_time = datetime.now(timezone.utc).isoformat()

    train_df = pd.read_csv(TRAIN_DATA_PATH, names=COLUMN_NAMES).drop(columns=["difficulty_level"])
    test_df = pd.read_csv(TEST_DATA_PATH, names=COLUMN_NAMES).drop(columns=["difficulty_level"])

    encoders = joblib.load(ENCODERS_PATH)
    for c in CAT_COLS:
        train_df[c] = train_df[c].apply(lambda v: encoders[c].transform([v])[0] if v in encoders[c].classes_ else -1)
        test_df[c] = test_df[c].apply(lambda v: encoders[c].transform([v])[0] if v in encoders[c].classes_ else -1)

    train_df["binary_label"] = (train_df["label"] != "normal").astype(int)
    test_df["binary_label"] = (test_df["label"] != "normal").astype(int)

    drop_cols = ["label", "binary_label"]
    X_train = train_df.drop(columns=drop_cols)
    y_train = train_df["binary_label"]
    X_test = test_df.drop(columns=drop_cols)
    y_test = test_df["binary_label"]

    with mlflow.start_run() as run:
        new_model = xgb.XGBClassifier(n_estimators=100, max_depth=6, eval_metric="logloss")
        new_model.fit(X_train, y_train)

        new_metrics = evaluate_model(new_model, encoders, X_test, y_test)

        mlflow.log_metric("accuracy", new_metrics["accuracy"])
        mlflow.log_metric("precision", new_metrics["precision_score"])
        mlflow.log_metric("recall", new_metrics["recall"])
        mlflow.log_metric("f1", new_metrics["f1_score"])
        mlflow.xgboost.log_model(new_model, "model")

        mlflow_run_id = run.info.run_id

    current_metrics = get_current_active_metrics()
    try:
        registry_client = MlflowClient()
        candidate_version = register_candidate_in_staging(registry_client, mlflow_run_id)
        is_better = promote_staged_model_if_eligible(
            registry_client, candidate_version, new_metrics, current_metrics
        )
    except MlflowException as exc:
        raise HTTPException(
            status_code=502,
            detail=f"MLflow model registry operation failed: {exc}",
        ) from exc

    # Get the old model's integer id (for the retraining_jobs FK)
    old_model_version_id = current_metrics["id"] if current_metrics else None

    new_model_version_id = None
    try:
        model_resp = requests.post(MODELS_API, json={
            "model_id": MODEL_ID,
            "mlflow_run_id": mlflow_run_id,
            "accuracy": round(new_metrics["accuracy"], 4),
            "precision_score": round(new_metrics["precision_score"], 4),
            "recall": round(new_metrics["recall"], 4),
            "f1_score": round(new_metrics["f1_score"], 4),
            "is_active": is_better
        }, timeout=5)
        model_resp.raise_for_status()
        new_model_version_id = model_resp.json().get("id")  # integer PK from model_versions
    except requests.exceptions.RequestException as e:
        print(f"WARNING: failed to log model version: {e}")

    if is_better:
        joblib.dump(new_model, MODEL_PATH)

    end_time = datetime.now(timezone.utc).isoformat()

    try:
        job_resp = requests.post(RETRAINING_API, json={
            "model_id": MODEL_ID,
            "triggered_by": triggered_by,
            "start_time": start_time,
            "end_time": end_time,
            "old_model_version": old_model_version_id,   # integer id
            "new_model_version": new_model_version_id,   # integer id
            "promoted": is_better
        }, timeout=5)
        job_resp.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"WARNING: failed to log retraining job: {e}")

    return {
        "promoted": is_better,
        "new_metrics": new_metrics,
        "current_metrics": current_metrics,
        "mlflow_run_id": mlflow_run_id
    }
