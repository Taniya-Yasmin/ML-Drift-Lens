import requests
import random

PREDICT_URL = "http://127.0.0.1:8000/predict"

normal_sample = {
    "duration": 0, "protocol_type": "tcp", "service": "http", "flag": "SF",
    "src_bytes": 181, "dst_bytes": 5450, "land": 0, "wrong_fragment": 0,
    "urgent": 0, "hot": 0, "num_failed_logins": 0, "logged_in": 1,
    "num_compromised": 0, "root_shell": 0, "su_attempted": 0, "num_root": 0,
    "num_file_creations": 0, "num_shells": 0, "num_access_files": 0,
    "num_outbound_cmds": 0, "is_host_login": 0, "is_guest_login": 0,
    "count": 8, "srv_count": 8, "serror_rate": 0, "srv_serror_rate": 0,
    "rerror_rate": 0, "srv_rerror_rate": 0, "same_srv_rate": 1,
    "diff_srv_rate": 0, "srv_diff_host_rate": 0, "dst_host_count": 9,
    "dst_host_srv_count": 9, "dst_host_same_srv_rate": 1,
    "dst_host_diff_srv_rate": 0, "dst_host_same_src_port_rate": 0.11,
    "dst_host_srv_diff_host_rate": 0, "dst_host_serror_rate": 0,
    "dst_host_srv_serror_rate": 0, "dst_host_rerror_rate": 0,
    "dst_host_srv_rerror_rate": 0
}


def randomize(sample, numeric_jitter=0.15):
    new_sample = sample.copy()
    for key, value in new_sample.items():
        if isinstance(value, (int, float)) and key not in ("land", "logged_in",
                "root_shell", "su_attempted", "is_host_login", "is_guest_login"):
            jitter = 1 + random.uniform(-numeric_jitter, numeric_jitter)
            new_sample[key] = round(value * jitter, 4) if isinstance(value, float) else int(value * jitter)
    return new_sample


if __name__ == "__main__":
    n_requests = 20
    for i in range(n_requests):
        payload = randomize(normal_sample)
        resp = requests.post(PREDICT_URL, json=payload)
        print(f"[{i+1}/{n_requests}] status={resp.status_code} -> {resp.json()}")