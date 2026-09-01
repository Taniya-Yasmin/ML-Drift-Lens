"""Swappable publisher for drift events emitted by the ML service."""

from datetime import datetime
from typing import Literal, Protocol

import requests
from pydantic import BaseModel, ConfigDict, Field


class DriftEvent(BaseModel):
    """Integration event persisted to the Node-owned PostgreSQL drift_scores table."""

    model_config = ConfigDict(extra="forbid")

    timestamp: datetime
    model_version: str = Field(min_length=1)
    drift_score: float = Field(ge=0)
    affected_features: list[str]
    severity: Literal["medium", "high"]
    threshold: float = Field(gt=0)


class EventPublisher(Protocol):
    def publish_drift_event(self, event: DriftEvent) -> int | None:
        """Publish a drift event and return the persisted drift_scores identifier."""


class PostgresDriftEventPublisher:
    """Persist drift events through the Node service, which owns PostgreSQL access."""

    def __init__(self, drift_api_url: str, timeout_seconds: int = 5):
        self.drift_api_url = drift_api_url
        self.timeout_seconds = timeout_seconds

    def publish_drift_event(self, event: DriftEvent) -> int | None:
        # The first five fields are the integration event. The remaining fields
        # retain the existing Node / drift_scores persistence contract.
        payload = {
            **event.model_dump(mode="json"),
            "model_id": event.model_version,
            "metric_type": "PSI",
            "score": event.drift_score,
            "status": "drift",
        }
        try:
            response = requests.post(self.drift_api_url, json=payload, timeout=self.timeout_seconds)
            response.raise_for_status()
            return response.json().get("id")
        except requests.exceptions.RequestException as exc:
            print(f"WARNING: failed to persist drift event: {exc}")
            return None


def severity_for_drift_score(drift_score: float, threshold: float) -> Literal["medium", "high"]:
    """Map the established PSI threshold to an integration-event severity."""
    return "high" if drift_score >= threshold * 2 else "medium"


def publish_drift_event_if_detected(
    result: dict,
    model_version: str,
    psi_threshold: float,
    publisher: EventPublisher,
) -> int | None:
    """Publish only drift verdicts; normal checks remain local history entries."""
    if result["status"] != "drift":
        return None

    drift_score = max((score["psi"] for score in result["per_feature"].values()), default=0.0)
    timestamp = datetime.fromisoformat(result["checked_at"].replace("Z", "+00:00"))
    event = DriftEvent(
        timestamp=timestamp,
        model_version=model_version,
        drift_score=round(drift_score, 4),
        affected_features=result["drifted_features"],
        severity=severity_for_drift_score(drift_score, psi_threshold),
        threshold=psi_threshold,
    )
    return publisher.publish_drift_event(event)
