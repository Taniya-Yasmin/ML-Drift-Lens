from datetime import datetime, timezone

import numpy as np
import pandas as pd

from app.drift import detect_drift
from app.event_publisher import (
    DriftEvent,
    PostgresDriftEventPublisher,
    publish_drift_event_if_detected,
)


class RecordingPublisher:
    def __init__(self):
        self.events = []

    def publish_drift_event(self, event):
        self.events.append(event)
        return 42


class FakeResponse:
    def raise_for_status(self):
        return None

    def json(self):
        return {"id": 42}


def test_drift_event_is_published_with_required_payload_and_not_for_no_drift():
    baseline = pd.DataFrame({"feature": np.linspace(0, 100, 100)})
    shifted = pd.DataFrame({"feature": np.linspace(1_000, 1_100, 100)})
    publisher = RecordingPublisher()

    drift_result = detect_drift(baseline, shifted, ["feature"])
    drift_result["checked_at"] = "2026-09-01T12:00:00+00:00"
    persisted_id = publish_drift_event_if_detected(
        drift_result, model_version="model_v1", psi_threshold=0.25, publisher=publisher
    )

    assert persisted_id == 42
    assert len(publisher.events) == 1
    assert publisher.events[0].model_dump() == {
        "timestamp": datetime(2026, 9, 1, 12, 0, tzinfo=timezone.utc),
        "model_version": "model_v1",
        "drift_score": drift_result["per_feature"]["feature"]["psi"],
        "affected_features": ["feature"],
        "severity": "high",
        "threshold": 0.25,
    }

    no_drift_result = detect_drift(baseline, baseline.copy(), ["feature"])
    no_drift_result["checked_at"] = "2026-09-01T12:00:00+00:00"
    assert publish_drift_event_if_detected(
        no_drift_result, model_version="model_v1", psi_threshold=0.25, publisher=publisher
    ) is None
    assert len(publisher.events) == 1


def test_postgres_publisher_sends_event_and_existing_drift_scores_fields(monkeypatch):
    captured = {}

    def fake_post(url, json, timeout):
        captured.update(url=url, json=json, timeout=timeout)
        return FakeResponse()

    monkeypatch.setattr("app.event_publisher.requests.post", fake_post)
    event = DriftEvent(
        timestamp=datetime(2026, 9, 1, 12, 0, tzinfo=timezone.utc),
        model_version="model_v1",
        drift_score=0.75,
        affected_features=["src_bytes", "count"],
        severity="high",
        threshold=0.25,
    )

    persisted_id = PostgresDriftEventPublisher("http://node/api/drift").publish_drift_event(event)

    assert persisted_id == 42
    assert captured["url"] == "http://node/api/drift"
    assert captured["json"] == {
        "timestamp": "2026-09-01T12:00:00Z",
        "model_version": "model_v1",
        "drift_score": 0.75,
        "affected_features": ["src_bytes", "count"],
        "severity": "high",
        "threshold": 0.25,
        "model_id": "model_v1",
        "metric_type": "PSI",
        "score": 0.75,
        "status": "drift",
    }
