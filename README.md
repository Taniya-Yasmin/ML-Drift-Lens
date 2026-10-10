# ML-Drift-Lens

ML-Drift-Lens monitors an NSL-KDD network-intrusion classifier, detects distribution drift, creates alerts, retrains versioned candidates, and safely promotes a better model.

## Architecture

React dashboard -> Node/Express backend -> FastAPI inference -> XGBoost model

PostgreSQL is the authoritative store for predictions (including measured backend-to-FastAPI latency), drift scores, alerts, retraining jobs, and model versions. Redis Streams carries significant-drift events to the alert/retraining consumer. MLflow stores candidate runs and artifacts but does not decide lifecycle state. The Compose stack has a separate database, Redis instance, artifact volume, and MLflow store; it does not connect to the native services.

## Dataset and ML pipeline

The contract in [ml/contracts/nsl_kdd_data_contract.json](ml/contracts/nsl_kdd_data_contract.json) defines 41 NSL-KDD features, excludes `difficulty_level`, and normalizes `normal` to class `0` while mapping other labels to attack class `1`. The full upstream train/test files are stored locally under `ml/data/raw/nsl-kdd-upstream/` and are not committed. Their pinned source, citation, exact acquisition commands, integrity checks, and hashes are documented in [ml/NSL_KDD_DATA_PROVENANCE.md](ml/NSL_KDD_DATA_PROVENANCE.md). Old 500/200-row files at the former canonical paths are synthetic development fixtures, not NSL-KDD. The active candidate metadata records validation F1 `0.5`; the previous `0.1.0` model's database F1 is `0.0851`.

Training uses contract-ordered features, fits preprocessing on training data, evaluates validation and untouched test data, and writes a joblib artifact plus metadata. Candidate retraining uses `input_features` with `actual_label`, requires minimum samples, and writes separately from the active artifact. The current native active model is `nsl-kdd-baseline / candidate-20260929T051314Z-1b4fff0f` (validation F1 `0.7143`); its prior incumbent F1 was `0.5`. Compose bootstraps the same approved artifact as its initial model record, then keeps candidate/production artifacts in its own named volume.

```powershell
python -m ml.model --contract ml/contracts/nsl_kdd_data_contract.json --train ml/data/raw/nsl-kdd-upstream/KDDTrain+.txt --test ml/data/raw/nsl-kdd-upstream/KDDTest+.txt --artifact ml/artifacts/validation/nsl-kdd/model.joblib --metadata ml/artifacts/validation/nsl-kdd/metadata.json
```

Promotion requires `candidate_f1 > incumbent_f1`; equal or lower scores are rejected. The workflow stages the candidate artifact, asks FastAPI to load it before PostgreSQL commits lifecycle state, and rolls back on failure. Reload accepts only model identity/version and resolves the trusted production path. Native development uses PostgreSQL `localhost:5432` and project Redis `127.0.0.1:26379`; Docker Compose uses separate services and data volumes. PostgreSQL remains lifecycle authority; MLflow is tracking only.

## Services and APIs

FastAPI provides `/health`, `/ready`, `/model/info`, `/predict`, and safe `/reload`. The backend provides `/api/metrics`, `/api/predictions`, `/api/drift/history`, `/api/alerts`, `/api/models`, `/api/retraining`, `/api/health`, `/api/ready`, and `/api/model-info`.

PSI monitoring uses the NSL-KDD training distribution as a baseline and remains in `insufficient_data` until its minimum window is available. Significant drift is persisted, published to Redis stream `modelwatch:drift`, consumed idempotently, and associated with alerts and candidate retraining.

The React dashboard reads live APIs for metrics, predictions, drift, alerts, retraining, model versions, health, readiness, and active model metadata. It has loading, error, retry, and empty states and filters model-dependent records to the active model. It contains no hardcoded active model version or demo monitoring data.

## MLflow

Native MLflow tracking uses the local `mlruns/` store. Docker Compose runs a separate MLflow server with persistent `mlflow_data`; Docker candidate runs use the `ModelWatch-IDS-Docker` experiment and server-side proxied artifacts. A live Docker retraining run recorded parameters, validation metrics, model, joblib, and metadata artifacts. PostgreSQL remains authoritative for model versions and promotion. MLflow tracking is best-effort and is not a promotion safety gate; registered-model workflows and external production MLflow are not configured.

## Native setup

For a native run, PostgreSQL and Redis must be available, migrations in `ml-drift-lens-backend/migrations/` must be applied, and `ml-drift-lens-backend/.env` must contain local DB/Redis settings and an explicit `CORS_ORIGINS` allowlist. The backend binds to `127.0.0.1` by default; do not override `HOST` on an unauthenticated native instance. Start FastAPI and the backend in separate shells, then start the frontend:

```powershell
python -m ml.inference.main --host 127.0.0.1 --port 8000
Set-Location ml-drift-lens-backend; npm ci; node server.js
Set-Location ../ml-drift-lens-frontend; npm ci; npx vite --host=127.0.0.1
```

## Docker Compose

Compose runs as the separate project `ml-drift-lens-compose`; its PostgreSQL database is isolated from native PostgreSQL 17 on port `5432`. It uses service-name networking, health checks, and persistent volumes for PostgreSQL, Redis, MLflow, and Docker-only model artifacts. The Docker backend and inference containers share only the Compose `model_artifacts` volume, so Docker promotion does not mutate `ml/artifacts/` on the host. An empty Compose database registers the actual production artifact as its initial active model; it does not import or fabricate native lifecycle history. MLflow candidate artifacts are proxied to the persistent MLflow artifact volume. Existing Compose volumes are persistent; migrations are applied only if the PostgreSQL volume is new, so apply any newly added idempotent migration explicitly to an existing volume before startup.

On a fresh checkout, provide the approved production artifact and matching metadata at `ml/artifacts/model.joblib` and `ml/artifacts/metadata.json` before the first Compose build; these ignored files are copied into the initial `model_artifacts` volume. Do not substitute generated fixtures. The backend also mounts `ml/data/raw/` read-only for PSI baseline calculations; provide the genuine NSL-KDD files there for drift detection.

Published ports bind to `127.0.0.1` by default: PostgreSQL `25432`, Redis `26380`, MLflow `25000`, inference `28000`, backend `23000`, and frontend `25173`. The API has no user authentication. Keep the loopback-only binding; this Compose setup is for local acceptance/demo use, not internet-facing production. Do not expose these ports on a LAN/WAN or deploy behind a public ingress without authentication, TLS, and a security review.

```powershell
Copy-Item docker.env.example docker.env
# Set POSTGRES_PASSWORD to the password for this isolated Compose database.
$env:POSTGRES_PASSWORD = (Select-String '^POSTGRES_PASSWORD=' docker.env).Line.Split('=', 2)[1]
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

`docker.env` is local-only and ignored by Git. The Compose PostgreSQL and Redis volumes are separate from native services. Compose does not import native prediction, drift, alert, or retraining history; do not fabricate historical rows. The password must also be present in the invoking process environment for Compose interpolation; do not print it in logs or commit `docker.env`.

## Testing

```powershell
Set-Location ml-drift-lens-backend; npm test
Set-Location ..; $env:PYTHONPATH='.'; .\.venv-1\Scripts\python.exe -m pytest -q ml/tests
Set-Location ml-drift-lens-frontend; npx vitest run; npm run build
Set-Location ..; git diff --check; docker compose config --quiet
```

Latest verified regression results in this workspace: backend `53 passed`, Python `78 passed`, frontend `24 passed`, and a successful production build. Third-party deprecation and bundle-size warnings remain non-blocking; rerun the commands above after changes.

## Scope

Kubernetes, cloud deployment, CI/CD, external production MLflow, Slack/email/webhooks, and multi-model platform expansion are not implemented. They are optional production enhancements, not required for the core local college demonstration.
