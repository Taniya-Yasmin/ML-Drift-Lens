import pandas as pd
import requests
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PREDICT_URL = os.getenv("PREDICT_URL", "http://127.0.0.1:8000/predict")

column_names = [
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
    "dst_host_rerror_rate", "dst_host_srv_rerror_rate",
    "label", "difficulty_level"
]

test_df = pd.read_csv(os.path.join(BASE_DIR, "data", "KDDTest+.txt"), names=column_names)
normal_rows = test_df[test_df["label"] == "normal"].drop(columns=["label", "difficulty_level"])

sample = normal_rows.sample(n=200, random_state=7)

for i, (_, row) in enumerate(sample.iterrows()):
    payload = row.to_dict()
    resp = requests.post(PREDICT_URL, json=payload)
    print(f"[{i+1}/20] status={resp.status_code} -> {resp.json()}")