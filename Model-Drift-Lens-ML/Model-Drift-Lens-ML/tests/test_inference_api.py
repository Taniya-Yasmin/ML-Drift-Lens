from fastapi.testclient import TestClient

from app import main


class FakeResponse:
    def raise_for_status(self):
        return None


def test_predict_returns_typed_prediction(monkeypatch, nsl_kdd_payload):
    monkeypatch.setattr(main.requests, "post", lambda *args, **kwargs: FakeResponse())
    client = TestClient(main.app)

    response = client.post("/predict", json=nsl_kdd_payload)

    assert response.status_code == 200
    body = response.json()
    assert body["prediction"] in {"normal", "attack"}
    assert 0 <= body["confidence"] <= 1
    assert "timestamp" in body


def test_predict_rejects_malformed_payload(monkeypatch, nsl_kdd_payload):
    monkeypatch.setattr(main.requests, "post", lambda *args, **kwargs: FakeResponse())
    client = TestClient(main.app)

    response = client.post("/predict", json={**nsl_kdd_payload, "service": "not-trained"})

    assert response.status_code == 422
    assert response.json()["detail"]


def test_predict_handles_model_artifact_loading_failure(monkeypatch, nsl_kdd_payload):
    monkeypatch.setattr(main, "model", None)
    monkeypatch.setattr(main, "encoders", None)
    monkeypatch.setattr(main, "model_load_error", "model_v1.pkl is unreadable")
    client = TestClient(main.app)

    response = client.post("/predict", json=nsl_kdd_payload)

    assert response.status_code == 503
    assert "Model artifacts are unavailable" in response.json()["detail"]
