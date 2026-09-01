"""HTTP client for the Express monitoring API.

This is the only module that talks to Express. EventPublisher (and later
Redis Streams) should call these functions so core ML code never depends
on URL paths or field names.

Failures are logged and return None — they must not crash inference,
drift checks, or retraining.
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

EXPRESS_API_URL = os.getenv("EXPRESS_API_URL", "http://localhost:3000/api").rstrip("/")
REQUEST_TIMEOUT_SECONDS = float(os.getenv("EXPRESS_API_TIMEOUT", "5"))


def _url(path: str) -> str:
    return f"{EXPRESS_API_URL}{path}"


def _request(method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any] | None:
    """Send JSON to Express. Never raises to the caller."""
    url = _url(path)
    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            response = client.request(method, url, json=payload)
    except httpx.RequestError as exc:
        logger.error("Express unreachable: %s %s — %s", method, url, exc)
        return None

    if response.is_error:
        logger.error(
            "Express %s %s returned %s: %s",
            method,
            url,
            response.status_code,
            response.text,
        )
        return None

    try:
        data = response.json()
    except ValueError:
        logger.error("Express %s %s returned non-JSON: %s", method, url, response.text)
        return None

    if not isinstance(data, dict):
        logger.error("Express %s %s returned unexpected JSON type: %r", method, url, type(data))
        return None

    return data


# ---------------------------------------------------------------------------
# POST /api/predictions
# body: { model_id, input_features (object), prediction, confidence (0-1) }
# ---------------------------------------------------------------------------
def post_prediction(
    *,
    model_id: str,
    input_features: dict[str, Any],
    prediction: str | int | float,
    confidence: float,
) -> dict[str, Any] | None:
    return _request(
        "POST",
        "/predictions",
        {
            "model_id": model_id,
            "input_features": input_features,
            "prediction": prediction,
            "confidence": confidence,
        },
    )


# ---------------------------------------------------------------------------
# POST /api/drift
# body: { model_id, metric_type, score, threshold, status }
# metric_type must contain "psi" or "z" (case-insensitive) for the dashboard.
# status values the dashboard treats as open breaches: "breach", "critical"
# ---------------------------------------------------------------------------
def post_drift_score(
    *,
    model_id: str,
    metric_type: str,
    score: float,
    threshold: float,
    status: str,
) -> dict[str, Any] | None:
    return _request(
        "POST",
        "/drift",
        {
            "model_id": model_id,
            "metric_type": metric_type,
            "score": score,
            "threshold": threshold,
            "status": status,
        },
    )


# ---------------------------------------------------------------------------
# POST /api/alerts
# body: { drift_score_id, model_id, message, status }
# drift_score_id = integer `id` from the POST /api/drift response.
# ---------------------------------------------------------------------------
def post_alert(
    *,
    drift_score_id: int,
    model_id: str,
    message: str,
    status: str,
) -> dict[str, Any] | None:
    return _request(
        "POST",
        "/alerts",
        {
            "drift_score_id": drift_score_id,
            "model_id": model_id,
            "message": message,
            "status": status,
        },
    )


# ---------------------------------------------------------------------------
# POST /api/retraining
# required: { model_id, triggered_by: "auto" | "manual" }
# optional extras the Express insert already accepts (start_time, etc.)
# Start-of-job: omit end_time so the dashboard counts the job as running.
# ---------------------------------------------------------------------------
def post_retraining_job(
    *,
    model_id: str,
    triggered_by: str,
    start_time: str | None = None,
    old_model_version: str | int | None = None,
) -> dict[str, Any] | None:
    payload: dict[str, Any] = {
        "model_id": model_id,
        "triggered_by": triggered_by,
    }
    if start_time is not None:
        payload["start_time"] = start_time
    if old_model_version is not None:
        payload["old_model_version"] = old_model_version
    return _request("POST", "/retraining", payload)


# ---------------------------------------------------------------------------
# PUT /api/retraining/:id
# body: { promoted (bool), end_time }
# ---------------------------------------------------------------------------
def update_retraining_job(
    *,
    job_id: int,
    promoted: bool,
    end_time: str,
    new_model_version: str | int | None = None,
) -> dict[str, Any] | None:
    payload: dict[str, Any] = {
        "promoted": promoted,
        "end_time": end_time,
    }
    # Express update currently only SETs promoted + end_time. Extra keys are
    # ignored by the controller. new_model_version is accepted here so the
    # caller can pass it; it will not persist until Express is extended.
    if new_model_version is not None:
        payload["new_model_version"] = new_model_version
    return _request("PUT", f"/retraining/{job_id}", payload)


# ---------------------------------------------------------------------------
# POST /api/models
# contract: { model_id, accuracy, precision_score, recall, f1_score } (metrics optional, 0-1)
# mlflow_run_id is already accepted by Express and is what the dashboard uses
# to match retraining old/new versions — included when the caller has it.
# is_active is left to update_model_active(), not set on create.
# ---------------------------------------------------------------------------
def post_model_version(
    *,
    model_id: str,
    accuracy: float | None = None,
    precision_score: float | None = None,
    recall: float | None = None,
    f1_score: float | None = None,
    mlflow_run_id: str | None = None,
) -> dict[str, Any] | None:
    payload: dict[str, Any] = {"model_id": model_id}
    if accuracy is not None:
        payload["accuracy"] = accuracy
    if precision_score is not None:
        payload["precision_score"] = precision_score
    if recall is not None:
        payload["recall"] = recall
    if f1_score is not None:
        payload["f1_score"] = f1_score
    if mlflow_run_id is not None:
        payload["mlflow_run_id"] = mlflow_run_id
    return _request("POST", "/models", payload)


# ---------------------------------------------------------------------------
# PUT /api/models/:id
# body: { is_active (bool) }
# `:id` is the integer PK of model_versions, not the string model_id.
# ---------------------------------------------------------------------------
def update_model_active(*, version_id: int, is_active: bool) -> dict[str, Any] | None:
    return _request("PUT", f"/models/{version_id}", {"is_active": is_active})
