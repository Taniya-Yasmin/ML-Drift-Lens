# ModelWatch ML Contract

This directory defines the Phase 1 data contract for the base network intrusion detection model. It does not train, serve, monitor, or retrain a model.

## Dataset

The canonical training and test inputs are the complete NSL-KDD files stored locally at `ml/data/raw/nsl-kdd-upstream/KDDTrain+.txt` and `ml/data/raw/nsl-kdd-upstream/KDDTest+.txt`. Their source, immutable mirror commit, reproducible acquisition commands, SHA-256 checksums, and citation are recorded in [NSL_KDD_DATA_PROVENANCE.md](NSL_KDD_DATA_PROVENANCE.md). The original dataset is not committed; `ml/data/raw/` is ignored by Git.

The older `ml/data/raw/KDDTrain+.txt` and `KDDTest+.txt` paths may contain generated development fixtures. They are not genuine NSL-KDD and must not be used as canonical training, test, replay, or drift-reference data. The fixture generator writes only under `ml/data/raw/synthetic/`.

NSL-KDD records contain 41 model features, a `label` target, and a `difficulty_level` metadata field. `difficulty_level` must not be used as an input feature.

## Task and labels

ModelWatch will initially monitor a binary intrusion classifier:

- `normal` maps to class `0` (`normal`)
- every other normalized label maps to class `1` (`attack`)

Label normalization trims whitespace, lowercases the value, and removes one trailing period. The multiclass attack taxonomy is intentionally outside Phase 1.

## Contract files

- `contracts/nsl_kdd_data_contract.json` is the source of truth for dataset locations, feature order, types, labels, preprocessing policy, split policy, leakage controls, and versioning.
- `contracts/prediction_request.schema.json` defines the future inference input envelope.
- `contracts/prediction_response.schema.json` defines the future inference output envelope.

The checked-in application uses a trained model artifact for inference. Training and monitoring use the raw source files described in [NSL_KDD_DATA_PROVENANCE.md](NSL_KDD_DATA_PROVENANCE.md), not generated fixtures.

## Preprocessing policy

Unexpected missing values are rejected in this phase. Categorical encoding and any numerical scaling must be fitted on the training split only and versioned with the model. The contract does not force scaling because the future model family has not yet been selected.

## Split and leakage policy

Use a stratified validation split from `KDDTrain+.txt`; keep `KDDTest+.txt` untouched for final evaluation. The validation fraction and seed are configuration values in the JSON contract, not scattered implementation constants.

---

# Phase 3: Baseline Model Training & Evaluation

## Overview

Phase 3 implements the baseline network intrusion classifier that ModelWatch will later monitor. This phase trains a **Logistic Regression** model on the NSL-KDD dataset, validates it on a held-out validation set, and performs final evaluation on the untouched test set.

**Key principle:** The network intrusion classifier is the BASE ML MODEL. ModelWatch is the platform that will later monitor this model for prediction quality, data drift, performance degradation, alerts, automatic retraining, model versioning, and deployment.

## Model Selection: Logistic Regression

**Why Logistic Regression?**

1. **Simplicity and interpretability**: Linear coefficients clearly show feature importance for intrusion detection.
2. **Efficiency**: Fast training and inference, suitable for network traffic analysis.
3. **Transparency**: A strong baseline that future models (Random Forest, XGBoost) will be compared against.
4. **Probabilistic output**: Provides confidence/probability predictions essential for ModelWatch drift detection.
5. **Well-suited for tabular network traffic**: NSL-KDD contains 41 structured numerical and categorical features.
6. **Reproducibility**: Deterministic with fixed random seed, enabling production use and monitoring.

**Why not XGBoost or Random Forest for Phase 3?**

While more complex models may achieve higher accuracy, the goal of Phase 3 is to establish a **trustworthy, reproducible baseline**. Phase 3 is not about maximum accuracy; it's about understanding the data, establishing a baseline, and building a foundation for ModelWatch monitoring. Future phases will compare multiple models.

## Training Pipeline

```
NSL-KDD (ml/data/raw/nsl-kdd-upstream/KDDTrain+.txt + KDDTest+.txt)
    ↓
Phase 2 Data Loader (load_dataset)
    ↓
Phase 2 Validation (validate_frame)
    ↓
Stratified Train/Validation Split (80/20)
    ↓
Phase 2 Preprocessing Pipeline
    ├─ Numerical features: imputation (median) + standardization
    ├─ Categorical features: imputation (most frequent) + one-hot encoding
    └─ Fitted ONLY on training split
    ↓
Logistic Regression Classifier
    └─ max_iter=1000, random_state=42
    ↓
Training on training split only
    ↓
Validation Evaluation (on held-out validation data)
    ↓
Final Test Evaluation (on untouched KDDTest+)
    ↓
Model Artifact (joblib) + Metadata (JSON)
```

## Preprocessing & Model Pipeline

The training module uses a **single sklearn Pipeline** that combines preprocessing and classification:

```python
Pipeline([
    ("preprocessing", ColumnTransformer([
        ("numerical", Pipeline([imputation, scaling]), numerical_features),
        ("categorical", Pipeline([imputation, one-hot encoding]), categorical_features),
    ])),
    ("classifier", LogisticRegression(...))
])
```

**Why a single Pipeline?**

1. **Training/serving consistency**: Guarantees that training and future inference use identical transformations.
2. **Avoids skew**: Prevents manual preprocessing variations between training and production.
3. **Versioning**: The entire trained pipeline is a single artifact, versioned together.
4. **Serialization**: joblib persists the entire fitted pipeline deterministically.

**Preprocessing details:**

- **Numerical features** (31): Median imputation → Standard scaling
- **Categorical features** (10): Most-frequent imputation → One-hot encoding (sparse_output=False)
- **Categorical unknown handling**: OneHotEncoder with handle_unknown='error' rejects unknown categories in production, preventing silent failures.

## Data Splits

### Dataset Structure

| Set | Size | Label Distribution |
|-----|------|-------------------|
| KDDTrain+ (full) | ~25,000 rows | ~80% normal, ~20% attack |
| Train split (80%) | ~20,000 rows | Stratified 80:20 split |
| Validation split (20%) | ~5,000 rows | Held-out for model selection |
| KDDTest+ (untouched) | ~11,000 rows | Kept for final evaluation |

### Class Imbalance

The NSL-KDD dataset shows **mild class imbalance** (~80% normal, ~20% attack). This is realistic for intrusion detection where attacks are rarer than normal traffic. No SMOTE or undersampling is applied because:

1. The imbalance is moderate, not severe.
2. Standard Logistic Regression handles this via regularization.
3. Evaluation metrics (precision, recall, F1, ROC-AUC) account for imbalance.

**Key principle:** Imbalance is measured and reported, not hidden.

## Evaluation Metrics

The model is evaluated using **multiple metrics**, not accuracy alone:

### Validation Metrics
Calculated on the held-out validation set after model selection.

### Final Test Metrics
Calculated on the untouched KDDTest+.txt after training completes.

**Metrics calculated:**

| Metric | Definition | Why it matters |
|--------|-----------|-----------------|
| **Accuracy** | (TP + TN) / Total | Overall correctness; less informative with class imbalance |
| **Precision** | TP / (TP + FP) | Of predicted attacks, how many are true? (avoids false alarms) |
| **Recall** | TP / (TP + FN) | Of actual attacks, how many do we catch? (intrusion detection priority) |
| **F1 Score** | 2 × (Precision × Recall) / (Precision + Recall) | Harmonic mean; balances precision and recall |
| **ROC-AUC** | Area under ROC curve | Threshold-agnostic ranking quality; useful for confidence calibration |
| **Confusion Matrix** | [TN, FP; FN, TP] | Raw classification breakdown; enables manual interpretation |
| **True Positives (TP)** | Correctly detected attacks | |
| **True Negatives (TN)** | Correctly identified normal traffic | |
| **False Positives (FP)** | Normal traffic misclassified as attack | Production cost: alerts on benign traffic |
| **False Negatives (FN)** | Attacks missed | Security risk: undetected intrusions |

**Interpretation for intrusion detection:**

- **Precision** is critical: false alarms waste security resources.
- **Recall** is critical: missed attacks are security failures.
- **F1** balances both: appropriate for imbalanced intrusion data.
- **ROC-AUC** measures how well the model ranks attack likelihood; useful for tuning thresholds later.

## Reproducibility

Training is fully reproducible:

- **Dataset**: NSL-KDD versions are fixed in the contract.
- **Random seed**: `random_state=42` in all sklearn components.
- **Preprocessing version**: Contract specifies `preprocessing-v1`.
- **Model version**: Explicit semver (e.g., `0.1.0`).
- **Training timestamp**: Recorded in metadata for audit trails.

Running the same training command with the same dataset produces identical model weights and metrics (modulo floating-point precision).

## Model Artifacts

After training, two artifacts are produced:

### 1. Model Artifact: `ml/artifacts/models/ids-baseline-v1.joblib`

```python
joblib.dump({
    "model": Pipeline,  # Fitted preprocessing + classifier
    "contract": dict,   # Data contract (feature order, types, etc.)
    "metadata": dict    # Training metadata
}, artifact_path)
```

The joblib file is a complete, standalone artifact that can be loaded by the future FastAPI inference service.

**Security note:** joblib uses pickle-based serialization. Only load artifacts from trusted sources.

### 2. Metadata: `ml/artifacts/models/ids-baseline-v1.metadata.json`

```json
{
  "model_id": "nsl-kdd-baseline",
  "model_version": "0.1.0",
  "model_type": "logistic_regression",
  "dataset_version": "1.0.0",
  "preprocessing_version": "preprocessing-v1",
  "random_state": 42,
  "num_features": 41,
  "training_timestamp": "2026-09-01T12:34:56.789Z",
  "class_distribution": {
    "training": {...},
    "train_split": {...},
    "validation": {...},
    "test": {...}
  },
  "validation_metrics": {...},
  "test_metrics": {...}
}
```

Metadata is human-readable and machine-readable, usable by future MLflow integration and ModelWatch.

## Data Leakage Controls

This phase enforces strict data leakage prevention:

1. **Preprocessing fit scope**: Encoders and scalers are fitted ONLY on the training split.
2. **Validation**: Used for evaluation only; never for training.
3. **Test set**: Kept completely untouched until final evaluation; never used for tuning.
4. **No threshold optimization**: Model uses default Logistic Regression threshold (0.5).
5. **Feature order preserved**: Contract locks the 41 feature order; production inference must use the same order.

## How to Run Training

### Prerequisites

```bash
# Obtain NSL-KDD dataset
# Download KDDTrain+.txt and KDDTest+.txt
# Place them in ml/data/raw/
mkdir -p ml/data/raw
# Copy KDDTrain+.txt and KDDTest+.txt to ml/data/raw/
```

### Training Command

```bash
# Option 1: Via Python module
python -m ml.model \
  --contract ml/contracts/nsl_kdd_data_contract.json \
    --train ml/data/raw/nsl-kdd-upstream/KDDTrain+.txt \
    --test ml/data/raw/nsl-kdd-upstream/KDDTest+.txt \
  --artifact ml/artifacts/models/ids-baseline-v1.joblib \
  --metadata ml/artifacts/models/ids-baseline-v1.metadata.json \
  --model-id nsl-kdd-baseline \
  --model-version 0.1.0 \
  --verbose

# Option 2: Via direct script execution
python -m ml.model.train \
  --contract ml/contracts/nsl_kdd_data_contract.json \
    --train ml/data/raw/nsl-kdd-upstream/KDDTrain+.txt \
    --test ml/data/raw/nsl-kdd-upstream/KDDTest+.txt \
  --artifact ml/artifacts/models/ids-baseline-v1.joblib \
  --metadata ml/artifacts/models/ids-baseline-v1.metadata.json
```

## Unit Tests

Run tests with:

```bash
pytest ml/tests/ -v
pytest ml/tests/ --verbose --tb=short
```

### Test Coverage

**Data validation tests** (`test_data.py`):
- Label normalization (binary mapping, period removal)
- Schema validation (correct columns, no missing values)
- Type checking (numerical features are numeric)

**Training tests** (`test_training.py`):
1. Pipeline trains and evaluates on synthetic fixture data
2. Metrics include accuracy, precision, recall, F1, confusion matrix, TP/TN/FP/FN, ROC-AUC
3. Pipeline rejects unknown categorical values (leakage control)
4. Model generates probability predictions with shape (n_samples, 2)
5. Probabilities sum to 1.0 for each sample
6. Confusion matrix is correct (TN, FP, FN, TP)
7. ROC-AUC is present when both classes exist
8. Model can be saved and loaded via joblib
9. Loaded model generates identical predictions
10. Training does not use test data (preprocessing fit on train only)

Tests use synthetic fixture data to avoid requiring the real NSL-KDD dataset for unit testing.

## Known Limitations

1. **Baseline performance**: Logistic Regression may not achieve state-of-the-art accuracy. This is intentional; Phase 3 establishes a reproducible baseline.
2. **No hyperparameter tuning**: max_iter=1000 and random_state=42 are fixed. Tuning is deferred to Phase 4+.
3. **Binary classification only**: Multiclass attack taxonomy is outside Phase 3 scope.
4. **No feature engineering**: Features are used as-is from NSL-KDD; engineering is deferred.
5. **No threshold optimization**: Uses default 0.5 probability threshold.
6. **No class weighting**: Logistic Regression uses default class weights; no SMOTE or resampling.
7. **Prediction confidence**: Uses raw Logistic Regression probabilities; future phases may apply calibration.

## Integration with Future Phases

### Phase 4: Model Artifact Verification + MLflow Tracking

The trained model artifact can be:
- Registered with MLflow Model Registry
- Tagged with version and stage (dev, staging, prod)
- Tracked with experiment metadata

### Phase 5: Inference Service

The joblib artifact can be:
- Loaded by a FastAPI service
- Used to generate predictions on new network traffic
- Logged for monitoring

### Phase 6+: ModelWatch Monitoring

The model will be monitored for:
- **Prediction drift**: Changes in prediction distribution
- **Data drift**: Changes in input feature distribution
- **Performance degradation**: Actual attack rate vs. predicted
- **Automatic retraining**: Trigger when drift exceeds threshold

The metadata and model version enable versioned monitoring and comparison across model generations.

## Security & Trust

**Joblib artifacts security note:**

joblib uses pickle-based serialization. Joblib artifacts should only be loaded from trusted sources. In production, model loading should be restricted to trusted paths and include artifact verification (checksums, signatures).

**Model inference in this phase:**

Model loading/inference is not exposed through HTTP in Phase 3. This is deliberately deferred to Phase 5 (Inference Service).

---

## Summary

**Phase 3 implements:**
- ✅ Logistic Regression baseline trained on NSL-KDD
- ✅ Stratified train/validation/test split
- ✅ Preprocessing pipeline (numerical scaling + categorical encoding)
- ✅ Comprehensive metrics (accuracy, precision, recall, F1, ROC-AUC, confusion matrix)
- ✅ Class distribution analysis
- ✅ Data leakage controls (train-only fitting)
- ✅ Model artifact persistence (joblib)
- ✅ Metadata versioning
- ✅ Reproducible training with fixed random seed
- ✅ Unit tests
- ✅ CLI training interface

**Phase 3 does NOT implement:**
- ❌ Hyperparameter tuning
- ❌ MLflow integration (Phase 4)
- ❌ Inference service (Phase 5)
- ❌ Model monitoring/drift detection (Phase 6+)
- ❌ Automatic retraining (Phase 6+)
- ❌ Feature engineering
- ❌ Multiclass classification
- ❌ Threshold optimization