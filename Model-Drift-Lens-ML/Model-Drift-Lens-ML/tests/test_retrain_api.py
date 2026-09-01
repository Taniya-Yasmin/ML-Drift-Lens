from contextlib import nullcontext
from types import SimpleNamespace

import pandas as pd
from fastapi.testclient import TestClient

from app import retrain_service


class FakeEncoder:
    classes_ = ["http", "tcp", "SF"]

    def transform(self, values):
        return [0] * len(values)


class FakeModel:
    def fit(self, X, y):
        self.fitted_rows = len(X)


class FakeRun:
    class info:
        run_id = "test-mlflow-run"


class FakeResponse:
    def __init__(self, body):
        self.body = body

    def raise_for_status(self):
        return None

    def json(self):
        return self.body


class FakeRegistryClient:
    def __init__(self):
        self.transitions = []

    def get_registered_model(self, name):
        return object()

    def create_model_version(self, **kwargs):
        return SimpleNamespace(version="2")

    def transition_model_version_stage(self, **kwargs):
        self.transitions.append(kwargs)


def test_retrain_trigger_mocks_mlflow_and_logs_result(monkeypatch):
    def fake_read_csv(*args, **kwargs):
        row = {column: 0 for column in retrain_service.COLUMN_NAMES}
        row.update({"protocol_type": "tcp", "service": "http", "flag": "SF", "label": "normal"})
        return pd.DataFrame([row, row.copy()])

    posted_payloads = []
    registry_client = FakeRegistryClient()

    monkeypatch.setattr(retrain_service.pd, "read_csv", fake_read_csv)
    monkeypatch.setattr(retrain_service.joblib, "load", lambda *args: {column: FakeEncoder() for column in retrain_service.CAT_COLS})
    monkeypatch.setattr(retrain_service.xgb, "XGBClassifier", lambda **kwargs: FakeModel())
    monkeypatch.setattr(retrain_service, "evaluate_model", lambda *args: {
        "accuracy": 0.95, "precision_score": 0.94, "recall": 0.93, "f1_score": 0.935,
    })
    monkeypatch.setattr(retrain_service.mlflow, "start_run", lambda: nullcontext(FakeRun()))
    monkeypatch.setattr(retrain_service.mlflow, "log_metric", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        retrain_service.mlflow,
        "xgboost",
        SimpleNamespace(log_model=lambda *args, **kwargs: None),
    )
    monkeypatch.setattr(retrain_service.requests, "get", lambda *args, **kwargs: FakeResponse([]))
    monkeypatch.setattr(retrain_service, "MlflowClient", lambda: registry_client)
    monkeypatch.setattr(
        retrain_service.requests,
        "post",
        lambda url, json, **kwargs: (posted_payloads.append((url, json)) or FakeResponse({"id": 101})),
    )
    monkeypatch.setattr(retrain_service.joblib, "dump", lambda *args, **kwargs: None)

    response = TestClient(retrain_service.app).post("/retrain", json={"triggered_by": "manual"})

    assert response.status_code == 200
    assert response.json()["mlflow_run_id"] == "test-mlflow-run"
    assert len(posted_payloads) == 2
    assert posted_payloads[0][1]["mlflow_run_id"] == "test-mlflow-run"
    assert posted_payloads[1][1]["triggered_by"] == "manual"
    assert [call["stage"] for call in registry_client.transitions] == ["Staging", "Production"]
