import pandas as pd
import os

# NSL-KDD has no header row in the raw files, so we define the 41 feature
# names + label + difficulty_level ourselves
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

# Load train and test sets
train_df = pd.read_csv("data/KDDTrain+.txt", names=column_names)
test_df = pd.read_csv("data/KDDTest+.txt", names=column_names)

# Sanity checks
print("Train shape:", train_df.shape)
print("Test shape:", test_df.shape)
print(train_df.head())
print(train_df["label"].value_counts())

# Drop difficulty_level, since it's a scoring metadata column, not a feature
train_df = train_df.drop("difficulty_level", axis=1)
test_df = test_df.drop("difficulty_level", axis=1)

# ---- Encode categorical columns ----
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
import joblib

os.makedirs("models", exist_ok=True)

cat_cols = ["protocol_type", "service", "flag"]
encoders = {}

for c in cat_cols:
    le = LabelEncoder()
    # Fit on train+test combined — NSL-KDD's test set has some `service`
    # values that never appear in train, so fitting on train alone would
    # crash the encoder later when the model sees them at inference time.
    combined = pd.concat([train_df[c], test_df[c]], axis=0)
    le.fit(combined)
    train_df[c] = le.transform(train_df[c])
    test_df[c] = le.transform(test_df[c])
    encoders[c] = le

joblib.dump(encoders, "models/encoders.pkl")

# ---- Binary label: 0 = normal, 1 = attack ----
train_df["binary_label"] = (train_df["label"] != "normal").astype(int)
test_df["binary_label"] = (test_df["label"] != "normal").astype(int)

# ---- Split features/labels ----
drop_cols = ["label", "binary_label"]
X_train_full = train_df.drop(columns=drop_cols)
y_train_full = train_df["binary_label"]

X_test = test_df.drop(columns=drop_cols)
y_test = test_df["binary_label"]

# ---- Carve out a permanent baseline/reference set (15% of train) ----
X_fit, X_baseline, y_fit, y_baseline = train_test_split(
    X_train_full, y_train_full,
    test_size=0.15, random_state=42, stratify=y_train_full
)

baseline_df = X_baseline.copy()
baseline_df["binary_label"] = y_baseline
baseline_df.to_csv("data/baseline.csv", index=False)

print(f"\nFit set: {X_fit.shape}, Baseline set: {X_baseline.shape}, Test set: {X_test.shape}")

# Save the exact feature column order/names — you'll need this in the
# FastAPI /predict endpoint to build the input DataFrame identically
print("\nFeature columns (save this order):")
print(list(X_fit.columns))

# ---- Train model + log to MLflow ----
import mlflow
import xgboost as xgb
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score

mlflow.set_experiment("intrusion-detection")

with mlflow.start_run():
    model = xgb.XGBClassifier(n_estimators=100, max_depth=6, eval_metric="logloss")
    model.fit(X_fit, y_fit)

    preds = model.predict(X_test)
    acc = accuracy_score(y_test, preds)
    prec = precision_score(y_test, preds)
    rec = recall_score(y_test, preds)
    f1 = f1_score(y_test, preds)

    mlflow.log_params({"n_estimators": 100, "max_depth": 6})
    mlflow.log_metric("accuracy", acc)
    mlflow.log_metric("precision", prec)
    mlflow.log_metric("recall", rec)
    mlflow.log_metric("f1", f1)
    mlflow.xgboost.log_model(model, "model")

    joblib.dump(model, "models/model_v1.pkl")

print(f"\nacc={acc:.3f} prec={prec:.3f} rec={rec:.3f} f1={f1:.3f}")

# ---- Per-attack-type recall breakdown ----
# We need the ORIGINAL multi-class labels for the test set (not binary),
# so we can see which specific attack types are being missed.

test_labels_original = test_df["label"]  # e.g. "normal", "neptune", "smurf", etc.

results_df = pd.DataFrame({
    "true_label": test_labels_original,
    "true_binary": y_test,
    "predicted_binary": preds
})

print("\n--- Recall by attack type ---")
for label in results_df["true_label"].unique():
    subset = results_df[results_df["true_label"] == label]
    total = len(subset)
    if label == "normal":
        # for "normal", "correct" means predicted 0 (not flagged as attack)
        correct = (subset["predicted_binary"] == 0).sum()
    else:
        # for attack types, "correct" means predicted 1 (flagged as attack)
        correct = (subset["predicted_binary"] == 1).sum()
    recall = correct / total
    print(f"{label:20s}  total={total:5d}  caught={correct:5d}  recall={recall:.3f}")