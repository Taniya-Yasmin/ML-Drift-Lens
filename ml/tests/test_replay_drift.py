import copy

from ml.simulation.replay import apply_drift_to_payload


BASE_PAYLOAD = {
    "duration": 10.0,
    "protocol_type": "tcp",
    "service": "http",
    "flag": "SF",
    "src_bytes": 100.0,
    "dst_bytes": 200.0,
    "land": 0.0,
    "wrong_fragment": 0.0,
    "urgent": 0.0,
    "hot": 0.0,
    "num_failed_logins": 0.0,
    "logged_in": 1.0,
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
    "count": 50.0,
    "srv_count": 60.0,
    "serror_rate": 0.2,
    "srv_serror_rate": 0.3,
    "rerror_rate": 0.1,
    "srv_rerror_rate": 0.2,
    "same_srv_rate": 0.8,
    "diff_srv_rate": 0.1,
    "srv_diff_host_rate": 0.2,
    "dst_host_count": 2.0,
    "dst_host_srv_count": 3.0,
    "dst_host_same_srv_rate": 0.7,
    "dst_host_diff_srv_rate": 0.1,
    "dst_host_same_src_port_rate": 0.8,
    "dst_host_srv_diff_host_rate": 0.1,
    "dst_host_serror_rate": 0.2,
    "dst_host_srv_serror_rate": 0.3,
    "dst_host_rerror_rate": 0.1,
    "dst_host_srv_rerror_rate": 0.2,
    "label": "normal",
    "difficulty_level": 1,
}


def _feature_names() -> tuple[str, ...]:
    return (
        "duration",
        "src_bytes",
        "dst_bytes",
        "count",
        "srv_count",
        "serror_rate",
        "srv_serror_rate",
        "same_srv_rate",
        "dst_host_count",
        "dst_host_srv_count",
        "dst_host_same_srv_rate",
        "dst_host_serror_rate",
        "dst_host_srv_serror_rate",
    )


def test_none_mode_leaves_features_unchanged() -> None:
    payload = copy.deepcopy(BASE_PAYLOAD)

    result = apply_drift_to_payload(
        payload,
        row_index=3,
        total_rows=10,
        drift_mode="none",
        drift_start=0.5,
        drift_factor=2.0,
        drift_features=_feature_names(),
    )

    assert result == payload


def test_sudden_mode_keeps_rows_before_drift_point_unchanged() -> None:
    payload = copy.deepcopy(BASE_PAYLOAD)

    result = apply_drift_to_payload(
        payload,
        row_index=2,
        total_rows=10,
        drift_mode="sudden",
        drift_start=0.5,
        drift_factor=2.0,
        drift_features=_feature_names(),
    )

    assert result["src_bytes"] == BASE_PAYLOAD["src_bytes"]
    assert result["dst_bytes"] == BASE_PAYLOAD["dst_bytes"]
    assert result["label"] == BASE_PAYLOAD["label"]


def test_sudden_mode_changes_selected_features_after_drift_point() -> None:
    payload = copy.deepcopy(BASE_PAYLOAD)

    result = apply_drift_to_payload(
        payload,
        row_index=6,
        total_rows=10,
        drift_mode="sudden",
        drift_start=0.5,
        drift_factor=2.0,
        drift_features=_feature_names(),
    )

    assert result["src_bytes"] == 200.0
    assert result["dst_bytes"] == 400.0
    assert result["count"] == 100.0
    assert result["label"] == BASE_PAYLOAD["label"]


def test_gradual_mode_increases_shift_over_time() -> None:
    payload = copy.deepcopy(BASE_PAYLOAD)

    early = apply_drift_to_payload(
        payload,
        row_index=4,
        total_rows=10,
        drift_mode="gradual",
        drift_start=0.5,
        drift_factor=2.0,
        drift_features=_feature_names(),
    )
    late = apply_drift_to_payload(
        payload,
        row_index=8,
        total_rows=10,
        drift_mode="gradual",
        drift_start=0.5,
        drift_factor=2.0,
        drift_features=_feature_names(),
    )

    assert early["src_bytes"] < late["src_bytes"]
    assert early["dst_bytes"] < late["dst_bytes"]
    assert late["src_bytes"] > BASE_PAYLOAD["src_bytes"]


def test_original_labels_remain_unchanged_and_payload_shape_is_preserved() -> None:
    payload = copy.deepcopy(BASE_PAYLOAD)

    result = apply_drift_to_payload(
        payload,
        row_index=8,
        total_rows=10,
        drift_mode="sudden",
        drift_start=0.5,
        drift_factor=2.0,
        drift_features=_feature_names(),
    )

    assert result["label"] == "normal"
    assert result["difficulty_level"] == 1
    assert set(result.keys()) == set(BASE_PAYLOAD.keys())
    assert len(result) == len(BASE_PAYLOAD)


def test_transformation_is_deterministic() -> None:
    payload_a = copy.deepcopy(BASE_PAYLOAD)
    payload_b = copy.deepcopy(BASE_PAYLOAD)

    first = apply_drift_to_payload(
        payload_a,
        row_index=7,
        total_rows=10,
        drift_mode="gradual",
        drift_start=0.5,
        drift_factor=2.0,
        drift_features=_feature_names(),
    )
    second = apply_drift_to_payload(
        payload_b,
        row_index=7,
        total_rows=10,
        drift_mode="gradual",
        drift_start=0.5,
        drift_factor=2.0,
        drift_features=_feature_names(),
    )

    assert first == second
