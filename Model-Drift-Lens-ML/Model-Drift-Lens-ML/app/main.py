from fastapi import FastAPI, HTTPException
import joblib
import pandas as pd
import requests
import os
from datetime import datetime, timezone

from app.schema import HealthResponse, PredictionResponse, TrafficInput

app = FastAPI(
    title="ML Drift Lens — Inference Service",
    version="1.0.0",
    description=(
        "Classifies validated NSL-KDD network-traffic feature vectors with the "
        "production XGBoost intrusion-detection model."
    ),
    openapi_tags=[
        {"name": "Inference", "description": "Production traffic classification."},
        {"name": "Service Health", "description": "Service liveness checks."},
    ],
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE_DIR, "models", "model_v1.pkl")
ENCODERS_PATH = os.path.join(BASE_DIR, "models", "encoders.pkl")

model = None
encoders = None
model_load_error = None


def load_model_artifacts() -> None:
    """Load inference artifacts without preventing the API process from starting."""
    global model, encoders, model_load_error
    try:
        model = joblib.load(MODEL_PATH)
        encoders = joblib.load(ENCODERS_PATH)
        model_load_error = None
    except Exception as exc:
        model = None
        encoders = None
        model_load_error = str(exc)


def get_model_artifacts():
    if model is None or encoders is None:
        detail = "Model artifacts are unavailable."
        if model_load_error:
            detail = f"{detail} Loading failed: {model_load_error}"
        raise HTTPException(status_code=503, detail=detail)
    return model, encoders


load_model_artifacts()

FEATURE_ORDER = [
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
    "dst_host_rerror_rate", "dst_host_srv_rerror_rate"
]

CAT_COLS = ["protocol_type", "service", "flag"]

BACKEND_URL = os.getenv("EXPRESS_API_URL", "http://localhost:3000/api").rstrip("/") + "/predictions"
MODEL_ID = "model_v1"


@app.get(
    "/health",
    response_model=HealthResponse,
    tags=["Service Health"],
    summary="Check inference service health",
    description="Returns the liveness status of the inference API.",
)
def health() -> HealthResponse:
    return {"status": "ok"}


@app.post(
    "/predict",
    response_model=PredictionResponse,
    tags=["Inference"],
    summary="Classify a network-traffic feature vector",
    description=(
        "Validates an NSL-KDD feature vector, encodes supported categorical values, "
        "and returns the predicted class and confidence."
    ),
)
def predict(data: TrafficInput) -> PredictionResponse:
    loaded_model, loaded_encoders = get_model_artifacts()
    input_features = data.model_dump(mode="json")
    row = pd.DataFrame([input_features])
    row = row[FEATURE_ORDER]

    for c in CAT_COLS:
        try:
            row[c] = loaded_encoders[c].transform(row[c])
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown value for '{c}': {row[c].values[0]!r}. "
                       f"This category was never seen during training/encoding."
            )

    pred = loaded_model.predict(row)[0]
    conf = float(loaded_model.predict_proba(row)[0].max())
    prediction_label = "attack" if pred == 1 else "normal"

    result = {
        "prediction": prediction_label,
        "confidence": round(conf, 4),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

    try:
        requests.post(BACKEND_URL, json={
            "model_id": MODEL_ID,
            "input_features": input_features,
            "prediction": prediction_label,
            "confidence": round(conf, 4)
        }, timeout=2)
    except requests.exceptions.RequestException as e:
        print(f"WARNING: failed to log prediction to backend: {e}")

    return result
