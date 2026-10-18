-- ============================================================
-- ML Drift Lens — one-shot schema initialisation
-- Mounted at /docker-entrypoint-initdb.d/01_init.sql
-- Runs automatically on a fresh postgres volume.
-- Idempotent: all statements use IF NOT EXISTS.
-- ============================================================

-- model_versions must exist before tables that FK into it.
CREATE TABLE IF NOT EXISTS model_versions (
    id              SERIAL          PRIMARY KEY,
    model_id        TEXT            NOT NULL,
    mlflow_run_id   TEXT,
    accuracy        NUMERIC(8,4),
    precision_score NUMERIC(8,4),
    recall          NUMERIC(8,4),
    f1_score        NUMERIC(8,4),
    is_active       BOOLEAN         NOT NULL DEFAULT FALSE,
    timestamp       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS predictions (
    id              SERIAL          PRIMARY KEY,
    model_id        TEXT            NOT NULL,
    input_features  JSONB           NOT NULL,
    prediction      TEXT            NOT NULL,
    confidence      NUMERIC(6,4)    NOT NULL,
    actual_label    TEXT,
    timestamp       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS drift_scores (
    id              SERIAL          PRIMARY KEY,
    model_id        TEXT            NOT NULL,
    metric_type     TEXT            NOT NULL,
    score           NUMERIC(12,6)   NOT NULL,
    threshold       NUMERIC(12,6)   NOT NULL,
    status          TEXT            NOT NULL,
    timestamp       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- alerts FK -> drift_scores; ON DELETE SET NULL so deleting a score
-- does not cascade-delete the alert (preserves history).
CREATE TABLE IF NOT EXISTS alerts (
    id              SERIAL          PRIMARY KEY,
    drift_score_id  INTEGER         REFERENCES drift_scores(id) ON DELETE SET NULL,
    model_id        TEXT            NOT NULL,
    message         TEXT            NOT NULL,
    status          TEXT            NOT NULL,
    timestamp       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- retraining_jobs FKs -> model_versions; ON DELETE SET NULL for same reason.
CREATE TABLE IF NOT EXISTS retraining_jobs (
    id                  SERIAL      PRIMARY KEY,
    model_id            TEXT        NOT NULL,
    triggered_by        TEXT        NOT NULL
                            CHECK (triggered_by IN ('auto', 'manual')),
    start_time          TIMESTAMPTZ,
    end_time            TIMESTAMPTZ,
    old_model_version   INTEGER     REFERENCES model_versions(id) ON DELETE SET NULL,
    new_model_version   INTEGER     REFERENCES model_versions(id) ON DELETE SET NULL,
    promoted            BOOLEAN     NOT NULL DEFAULT FALSE
);
