from app.retrain_service import (
    MIN_F1_IMPROVEMENT,
    MODEL_REGISTRY_NAME,
    promote_staged_model_if_eligible,
    register_candidate_in_staging,
)


class FakeRegistryClient:
    """Registry state with version 1 in Production and version 2 in Staging."""

    def __init__(self):
        self.versions = {"1": "Production", "2": "Staging"}
        self.transitions = []
        self.created_versions = []

    def get_registered_model(self, name):
        return object()

    def create_model_version(self, **kwargs):
        self.created_versions.append(kwargs)
        return type("ModelVersion", (), {"version": "2"})()

    def transition_model_version_stage(self, **kwargs):
        self.transitions.append(kwargs)
        self.versions[kwargs["version"]] = kwargs["stage"]


def test_candidate_is_registered_from_mlflow_run_and_staged():
    client = FakeRegistryClient()

    version = register_candidate_in_staging(client, "run-123")

    assert version == "2"
    assert client.created_versions == [{
        "name": MODEL_REGISTRY_NAME,
        "source": "runs:/run-123/model",
        "run_id": "run-123",
    }]
    assert client.transitions == [{
        "name": MODEL_REGISTRY_NAME,
        "version": "2",
        "stage": "Staging",
        "archive_existing_versions": False,
    }]


def test_staged_candidate_only_promotes_after_minimum_f1_improvement():
    client = FakeRegistryClient()
    current_production = {"f1_score": 0.900}

    promoted = promote_staged_model_if_eligible(
        client,
        candidate_version="2",
        new_metrics={"f1_score": 0.900 + MIN_F1_IMPROVEMENT - 0.0001},
        current_metrics=current_production,
    )

    assert promoted is False
    assert client.versions == {"1": "Production", "2": "Staging"}
    assert client.transitions == []

    promoted = promote_staged_model_if_eligible(
        client,
        candidate_version="2",
        new_metrics={"f1_score": 0.900 + MIN_F1_IMPROVEMENT},
        current_metrics=current_production,
    )

    assert promoted is True
    assert client.transitions == [{
        "name": MODEL_REGISTRY_NAME,
        "version": "2",
        "stage": "Production",
        "archive_existing_versions": True,
    }]
