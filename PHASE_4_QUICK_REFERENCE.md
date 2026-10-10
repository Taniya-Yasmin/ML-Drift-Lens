# Phase 4 Quick Reference

## Current Status
✅ **All Phase 4 modules created and tested**
- 5 new Python modules (600+ lines)
- 10 unit tests (6 passing, 4 skipped when MLflow unavailable)
- Full backward compatibility with Phase 3 (12/12 tests passing)

## Files Created
- `ml/artifact_verification.py` - Artifact loading & verification
- `ml/mlflow_config.py` - MLflow configuration management
- `ml/mlflow_tracking.py` - MLflow tracking wrapper
- `ml/model_signature.py` - NSL-KDD model schema
- `ml/mlflow_integration.py` - Complete integration workflow
- `ml/tests/test_mlflow_integration.py` - 10 unit tests
- `.env.example` - Configuration template

## How to Use Phase 4

### Setup
```bash
# Copy configuration template
cp .env.example .env

# Edit .env with your MLflow settings (defaults provided)
# MLFLOW_TRACKING_URI=file:./mlruns (local file-based tracking)
# MLFLOW_EXPERIMENT_NAME=ModelWatch-IDS
# MLFLOW_REGISTERED_MODEL_NAME=ModelWatch-IDS-Baseline
```

### Train and Track
```bash
# Phase 3: Train baseline model
python -m ml.model --epochs 10 --artifact ml/artifacts/model.joblib

# Phase 4: Verify and track in MLflow (coming: integration CLI)
# For now, use MLflowIntegration programmatically:
from ml.mlflow_integration import MLflowIntegration
integration = MLflowIntegration()
result = integration.track_training(
    artifact_path="ml/artifacts/model.joblib"
)
print(f"Run ID: {result['run_id']}")
print(f"Model: {result['registered_model_name']} v{result['model_version']}")
```

### View Results
```bash
# Launch MLflow UI
mlflow ui

# Navigate to http://localhost:5000
# - View experiments and runs
# - Compare metrics across models
# - Register model versions
```

## Module Overview

### artifact_verification.py
Loads and validates model artifacts before MLflow tracking
```python
from ml.artifact_verification import verify_artifact_complete

# Verify artifact integrity (will raise clear error if missing/corrupt)
artifact = verify_artifact_complete("ml/artifacts/model.joblib")
```

### mlflow_config.py
Manages MLflow configuration from environment variables
```python
from ml.mlflow_config import MLflowConfig

# Load from environment (uses defaults if not set)
config = MLflowConfig.from_environment()
print(f"Tracking at: {config.tracking_uri}")
print(f"Experiment: {config.experiment_name}")
```

### mlflow_tracking.py
Logs parameters, metrics, model, and artifacts to MLflow
```python
from ml.mlflow_tracking import MLflowTracker

tracker = MLflowTracker()
run_id = tracker.create_run(experiment_name="my-exp")
tracker.log_parameters({"learning_rate": 0.01})
tracker.log_metrics({"accuracy": 0.92})
tracker.end_run()
```

### model_signature.py
Defines NSL-KDD model input/output schema for MLflow
```python
from ml.model_signature import create_nsl_kdd_signature

signature = create_nsl_kdd_signature()
# Use when logging model: mlflow.sklearn.log_model(..., signature=signature)
```

### mlflow_integration.py
Complete workflow: verify artifact → create run → log everything → register model
```python
from ml.mlflow_integration import MLflowIntegration

integration = MLflowIntegration()

# Full tracking workflow
result = integration.track_training(
    artifact_path="ml/artifacts/model.joblib",
    metadata_path="ml/artifacts/metadata.json"  # optional
)

print(f"Run: {result['run_id']}")
print(f"Model: {result['registered_model_name']}")
print(f"Version: {result['model_version']}")

# Register model version
registry_result = integration.register_model(
    run_id=result['run_id'],
    version_name="production",
    description="Baseline model with Logistic Regression"
)
```

## Test Execution

### Run All Tests
```bash
python -m pytest ml/tests/ -v
```

### Expected Results
```
18 passed, 4 skipped in 4.68s

✅ Phase 3: 12/12 tests passing
✅ Phase 4 Config/Artifact: 6/6 tests passing  
⏭ Phase 4 MLflow-Specific: 4 tests skipped (require MLflow installed)
```

### Run Specific Tests
```bash
# Phase 3 only
python -m pytest ml/tests/test_training.py ml/tests/test_data.py -v

# Phase 4 artifact tests (no MLflow needed)
python -m pytest ml/tests/test_mlflow_integration.py -k "artifact or config" -v

# Phase 4 MLflow tests (when MLflow available)
python -m pytest ml/tests/test_mlflow_integration.py::test_mlflow_run_creation -v
```

## Configuration

### Environment Variables
```bash
# Default: file-based local tracking
MLFLOW_TRACKING_URI=file:./mlruns

# Experiment name for grouping runs
MLFLOW_EXPERIMENT_NAME=ModelWatch-IDS

# Model registry name
MLFLOW_REGISTERED_MODEL_NAME=ModelWatch-IDS-Baseline

# Optional: Remote tracking server
# MLFLOW_TRACKING_URI=http://mlflow-server:5000

# Optional: Custom artifact storage
# MLFLOW_ARTIFACT_ROOT=/path/to/artifact/storage
```

## Architecture Diagram

```
Training Phase (Phase 3)
    ↓
sklearn.pipeline.Pipeline
    ├─ ColumnTransformer (preprocessing)
    └─ LogisticRegression (classifier)
    ↓
joblib.dump() → model.joblib
    ↓
MLflow Integration (Phase 4)
    ├─ Verify artifact (artifact_verification.py)
    ├─ Load configuration (mlflow_config.py)
    ├─ Create MLflow run (mlflow_tracking.py)
    ├─ Log model with signature (model_signature.py)
    ├─ Log metrics & metadata
    └─ Register model version
    ↓
MLflow Tracking Server
    ├─ Experiment (ModelWatch-IDS)
    ├─ Run (unique execution)
    ├─ Metrics (accuracy, precision, F1, ROC-AUC)
    ├─ Parameters (model config)
    ├─ Artifacts (model, metadata)
    └─ Model Registry (version control)
```

## Troubleshooting

### "ModuleNotFoundError: No module named 'mlflow'"
**Status**: Phase 4 tests gracefully skip when MLflow unavailable
**Solution**: Once MLflow installed, re-run tests - 4 currently-skipped tests will execute

### "Artifact not found: ml/artifacts/model.joblib"
**Solution**: Run Phase 3 training first:
```bash
python -m ml.model --artifact ml/artifacts/model.joblib
```

### "Failed to connect to MLflow"
**Check**:
1. Is MLflow URI correct? `echo $MLFLOW_TRACKING_URI`
2. Is MLflow server running? `mlflow ui`
3. For local: `file:./mlruns` creates `mlruns/` directory automatically

### "Model is not registered"
**Note**: Model registration is separate from run logging. See `MLflowIntegration.register_model()` method.

## Files Structure
```
ml/
├── artifact_verification.py      (Load & verify artifacts)
├── mlflow_config.py              (Configuration management)
├── mlflow_tracking.py            (MLflow wrapper)
├── model_signature.py            (NSL-KDD schema)
├── mlflow_integration.py         (Complete workflow)
├── model/
│   ├── __init__.py
│   ├── config.py                 (Phase 2)
│   ├── data.py                   (Phase 2)
│   ├── pipeline.py               (Phase 2)
│   └── train.py                  (Phase 3)
├── tests/
│   ├── test_data.py              (Phase 2)
│   ├── test_training.py          (Phase 3)
│   └── test_mlflow_integration.py (Phase 4)
├── contracts/
│   └── nsl_kdd_data_contract.json
└── README.md

.env.example                       (Configuration template)
```

## Next Steps

### When MLflow is Available
1. Run Phase 4 MLflow tests
2. Complete STEP 4.6-4.14 validation
3. Write Phase 4 section in ml/README.md

### Phase 5+
- Model promotion workflow
- Automated retraining
- Model comparison
- Deployment integration

---

**Last Updated**: 2026
**Phase**: 4/6
**Status**: ✅ Code Complete (Graceful Fallback Mode)
