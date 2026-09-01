from fastapi import FastAPI, HTTPException, Query
import pandas as pd
import numpy as np
import joblib
import requests
import os
from datetime import datetime, timezone

from app.drift import detect_drift
from app.schema import DriftCheckResponse, HealthResponse
from app.event_publisher import (
    EventPublisher,
    PostgresDriftEventPublisher,
    publish_drift_event_if_detected,
)

app = FastAPI(
    title="ML Drift Lens — Drift Detection Service",
    version="1.0.0",
    description=(
        "Evaluates recent prediction traffic against the reference baseline using the "
        "configured PSI and Z-score drift checks."
    ),
    openapi_tags=[
        {"name": "Drift Detection", "description": "Distribution-shift evaluation and history."},
        {"name": "Service Health", "description": "Service liveness checks."},
    ],
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASELINE_PATH = os.path.join(BASE_DIR, "data", "baseline.csv")
ENCODERS_PATH = os.path.join(BASE_DIR, "models", "encoders.pkl")

PREDICTIONS_API = "http://localhost:3000/api/predictions"
DRIFT_API = "http://localhost:3000/api/drift"
ALERTS_API = "http://localhost:3000/api/alerts"

# Load baseline + encoders once at startup
baseline_df = pd.read_csv(BASELINE_PATH)
encoders = joblib.load(ENCODERS_PATH)

CAT_COLS = ["protocol_type", "service", "flag"]
NUMERIC_COLS = [c for c in baseline_df.columns if c not in CAT_COLS + ["binary_label"]]

# In-memory drift history for this run (resets if service restarts —
# fine for now, GET /drift-history just reflects checks done this session)
drift_history = []
event_publisher: EventPublisher = PostgresDriftEventPublisher(DRIFT_API)


def fetch_recent_predictions(limit: int = 50) -> pd.DataFrame:
    """Pull recent predictions from Member A's backend and rebuild a feature DataFrame."""
    try:
        resp = requests.get(PREDICTIONS_API, timeout=5)
        resp.raise_for_status()
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Could not reach predictions API: {e}")

    rows = resp.json()
    if not rows:
        return pd.DataFrame()

    # Each row's input_features is the raw dict sent by /predict
    features_list = [row["input_features"] for row in rows[:limit]]
    df = pd.DataFrame(features_list)
    return df


def encode_for_drift(df: pd.DataFrame) -> pd.DataFrame:
    """Apply the same LabelEncoders used at training time, matching /predict's logic."""
    df = df.copy()
    for c in CAT_COLS:
        try:
            df[c] = encoders[c].transform(df[c])
        except ValueError:
            # unseen category value -> encode as -1 so it doesn't crash the whole batch
            df[c] = df[c].apply(
                lambda v: encoders[c].transform([v])[0] if v in encoders[c].classes_ else -1
            )
    return df

def create_alert_for_drift(result: dict, model_id: str, drift_score_id: int | None) -> None:
    """Keep the existing alert write after a drift event has been persisted."""
    if drift_score_id is not None:
        max_psi = max((f["psi"] for f in result["per_feature"].values()), default=0.0)
        alert_payload = {
            "drift_score_id": drift_score_id,
            "model_id": model_id,
            "message": (
                f"Drift detected: {result['num_drifted_features']}/"
                f"{result['total_features_checked']} features drifted "
                f"(max PSI={round(max_psi, 4)}). "
                f"Drifted features: {', '.join(result['drifted_features'][:5])}"
                f"{'...' if len(result['drifted_features']) > 5 else ''}"
            ),
            "status": "triggered"
        }
        try:
            alert_resp = requests.post(ALERTS_API, json=alert_payload, timeout=5)
            alert_resp.raise_for_status()
            print(f"Alert created: {alert_resp.json()}")
        except requests.exceptions.RequestException as e:
            print(f"WARNING: failed to create alert: {e}")


@app.get(
    "/health",
    response_model=HealthResponse,
    tags=["Service Health"],
    summary="Check drift service health",
    description="Returns the liveness status of the drift-detection API.",
)
def health() -> HealthResponse:
    return {"status": "ok"}


@app.get(
    "/drift-status",
    response_model=DriftCheckResponse,
    tags=["Drift Detection"],
    summary="Evaluate recent prediction drift",
    description=(
        "Fetches recent prediction features, compares them to the reference baseline, "
        "and emits a drift event when PSI crosses the configured threshold."
    ),
)
def drift_status(
    limit: int = Query(default=50, ge=1, le=10_000, description="Maximum recent predictions to evaluate."),
    psi_threshold: float = Query(default=0.25, gt=0, description="PSI value that marks a feature as drifted."),
    min_sample_size: int = Query(default=10, ge=1, le=10_000, description="Minimum prediction count required for evaluation."),
) -> DriftCheckResponse:
    recent_df = fetch_recent_predictions(limit=limit)

    if recent_df.empty:
        raise HTTPException(status_code=400, detail="No predictions available yet to check drift against.")

    if len(recent_df) < min_sample_size:
        raise HTTPException(
            status_code=400,
            detail=f"Only {len(recent_df)} predictions available; need at least "
                   f"{min_sample_size} for a statistically meaningful drift check."
        )

    recent_encoded = encode_for_drift(recent_df)

    try:
        result = detect_drift(baseline_df, recent_encoded, NUMERIC_COLS, psi_threshold=psi_threshold)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid drift input data: {exc}") from exc
    result["checked_at"] = datetime.now(timezone.utc).isoformat()
    result["sample_size"] = len(recent_df)

    drift_history.append(result)

    drift_score_id = publish_drift_event_if_detected(
        result,
        model_version="model_v1",
        psi_threshold=psi_threshold,
        publisher=event_publisher,
    )
    create_alert_for_drift(result, model_id="model_v1", drift_score_id=drift_score_id)

    return result


@app.get(
    "/drift-history",
    response_model=list[DriftCheckResponse],
    tags=["Drift Detection"],
    summary="List in-memory drift checks",
    description="Returns drift checks completed since this service instance started.",
)
def drift_history_endpoint() -> list[DriftCheckResponse]:
    return drift_history
