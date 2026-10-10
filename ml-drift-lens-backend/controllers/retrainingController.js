const pool = require("../db");
const { body, validationResult } = require("express-validator");
const fs = require("fs");
const path = require("path");
const candidateRetrainingService = require("../services/candidateRetrainingService");
const artifactPromotionService = require("../services/artifactPromotionService");
const mlServiceClient = require("../services/mlServiceClient");

function toNumber(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function normalizeCandidateMetrics(rawMetrics = {}) {
  return {
    accuracy: toNumber(rawMetrics.accuracy ?? rawMetrics.accuracy_score, 0),
    precision: toNumber(rawMetrics.precision ?? rawMetrics.precision_score, 0),
    recall: toNumber(rawMetrics.recall, 0),
    f1: toNumber(rawMetrics.f1 ?? rawMetrics.f1_score, 0),
  };
}

function candidateArtifactPaths(candidateVersion) {
  if (
    !candidateVersion ||
    path.basename(candidateVersion) !== candidateVersion ||
    candidateVersion.includes("..")
  ) {
    throw new Error("Candidate model version is invalid");
  }
  const candidateDir = path.join(candidateRetrainingService.projectRoot, "ml", "artifacts", "candidates");
  return {
    artifactPath: path.resolve(candidateDir, `${candidateVersion}.joblib`),
    metadataPath: path.resolve(candidateDir, `${candidateVersion}.json`),
  };
}

function resolveCandidateMetadata(job) {
  if (!job?.new_model_version) return null;
  const paths = candidateArtifactPaths(job.new_model_version);
  if (!fs.existsSync(paths.artifactPath) || !fs.existsSync(paths.metadataPath)) return null;
  const metadata = JSON.parse(fs.readFileSync(paths.metadataPath, "utf8"));
  if (metadata.model_id !== job.model_id || metadata.candidate_version !== job.new_model_version) return null;
  return {
    model_id: metadata.model_id,
    candidate_version: metadata.candidate_version,
    mlflow_run_id: metadata.mlflow_run_id || null,
    promoted: metadata.promoted === true,
    metrics: normalizeCandidateMetrics(metadata.metrics || metadata),
    ...paths,
  };
}

function readProductionMetadata() {
  const metadataPath = path.join(candidateRetrainingService.projectRoot, "ml", "artifacts", "metadata.json");
  return JSON.parse(fs.readFileSync(metadataPath, "utf8"));
}

async function restoreActiveDatabaseVersion(modelId, candidateVersion, previousVersion) {
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    const active = await connection.query(
      "SELECT model_version FROM model_versions WHERE model_id = $1 AND is_active = true FOR UPDATE",
      [modelId],
    );
    if (active.rows.length === 1 && active.rows[0].model_version === candidateVersion) {
      await connection.query(
        "UPDATE model_versions SET is_active = false WHERE model_id = $1 AND model_version = $2 AND is_active = true",
        [modelId, candidateVersion],
      );
      const previous = await connection.query(
        "UPDATE model_versions SET is_active = true WHERE model_id = $1 AND model_version = $2 RETURNING id",
        [modelId, previousVersion],
      );
      if (previous.rows.length !== 1) throw new Error("Previously active model version is missing");
    }
    await connection.query("COMMIT");
  } catch (error) {
    await connection.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

exports.validateRetrainingJob = [
  body("model_id").notEmpty().withMessage("model_id is required"),
  body("triggered_by")
    .isIn(["auto", "manual"])
    .withMessage('triggered_by must be "auto" or "manual"'),
  body("min_samples")
    .optional()
    .isInt({ min: 1 })
    .withMessage("min_samples must be a positive integer"),
];

exports.getAllRetrainingJobs = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, model_id, triggered_by, start_time, end_time,
              old_model_version, new_model_version, promoted,
              NULL::varchar AS reload_status
       FROM retraining_jobs ORDER BY start_time DESC`,
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to retrieve retraining jobs" });
  }
};

exports.createRetrainingJob = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const { model_id, triggered_by, min_samples = 30 } = req.body;
  const startTime = new Date();
  try {
    const predictionResult = await pool.query(
      `SELECT id, model_id, input_features, actual_label
       FROM predictions
       WHERE model_id = $1 AND actual_label IS NOT NULL
       ORDER BY timestamp DESC`,
      [model_id],
    );
    let oldModelVersion;
    try {
      oldModelVersion = readProductionMetadata().model_version;
    } catch (error) {
      oldModelVersion = null;
    }

    const candidate = await candidateRetrainingService.runCandidateRetraining(
      predictionResult.rows,
      { modelId: model_id, minSamples: Number(min_samples), oldModelVersion },
    );
    const result = await pool.query(
      `INSERT INTO retraining_jobs (model_id, triggered_by, start_time, end_time, old_model_version, new_model_version, promoted)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [model_id, triggered_by, startTime, new Date(), oldModelVersion, candidate.candidate_version, false],
    );
    res.status(201).json({ status: candidate.status, candidate, job: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.enqueueRetrainingJob = async ({ modelId, modelVersion, driftScoreId, minSamples = 30 }) => {
  const startTime = new Date();
  const predictionResult = await pool.query(
    `SELECT id, model_id, input_features, actual_label
     FROM predictions
     WHERE model_id = $1 AND actual_label IS NOT NULL
     ORDER BY timestamp DESC`,
    [modelId],
  );
  let oldModelVersion;
  try {
    oldModelVersion = readProductionMetadata().model_version;
  } catch (error) {
    oldModelVersion = null;
  }
  const candidate = await candidateRetrainingService.runCandidateRetraining(
    predictionResult.rows,
    { modelId, minSamples: Number(minSamples), oldModelVersion },
  );
  const result = await pool.query(
    `INSERT INTO retraining_jobs (model_id, triggered_by, start_time, end_time, old_model_version, new_model_version, drift_score_id, promoted)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [modelId, "auto", startTime, new Date(), oldModelVersion, candidate.candidate_version, driftScoreId || null, false],
  );
  return { status: candidate.status, candidate, job: result.rows[0], modelVersion };
};

exports.promoteRetrainingJob = async (req, res) => {
  let connection;
  let transactionOpen = false;
  let backupToken = null;
  let job;
  let candidate;
  let modelId;
  let previousVersion;
  let recoveringExistingPromotion = false;

  try {
    connection = await pool.connect();
    await connection.query("BEGIN");
    transactionOpen = true;
    const jobResult = await connection.query(
      "SELECT * FROM retraining_jobs WHERE id = $1 FOR UPDATE",
      [req.params.id],
    );
    if (!jobResult.rows.length) {
      await connection.query("ROLLBACK");
      transactionOpen = false;
      return res.status(404).json({ success: false, error: "Retraining job not found" });
    }
    job = jobResult.rows[0];
    modelId = job.model_id;
    candidate = resolveCandidateMetadata(job);
    if (!candidate || !Number.isFinite(candidate.metrics.f1)) {
      throw Object.assign(new Error("Candidate metadata or metrics are not available"), { statusCode: 400 });
    }

    const activeResult = await connection.query(
      "SELECT * FROM model_versions WHERE model_id = $1 AND is_active = true FOR UPDATE",
      [modelId],
    );
    if (activeResult.rows.length !== 1) {
      throw Object.assign(new Error("Exactly one active incumbent is required"), { statusCode: 409 });
    }
    const activeModel = activeResult.rows[0];
    recoveringExistingPromotion = activeModel.model_version === candidate.candidate_version;

    let comparisonModel = activeModel;
    if (recoveringExistingPromotion) {
      const previousResult = await connection.query(
        "SELECT * FROM model_versions WHERE model_id = $1 AND model_version = $2 LIMIT 1",
        [modelId, job.old_model_version],
      );
      comparisonModel = previousResult.rows[0];
      if (!comparisonModel) {
        throw Object.assign(new Error("Previously approved incumbent record is missing"), { statusCode: 409 });
      }
      previousVersion = comparisonModel.model_version;
    } else {
      if (job.promoted === true) {
        throw Object.assign(new Error("Retraining job is already promoted to a different version"), { statusCode: 409 });
      }
      previousVersion = activeModel.model_version;
    }

    const incumbentF1 = toNumber(comparisonModel.f1_score, 0);
    const comparison = {
      incumbent: { model_id: comparisonModel.model_id, model_version: comparisonModel.model_version, f1: incumbentF1 },
      candidate: { ...candidate.metrics, model_id: modelId, model_version: candidate.candidate_version },
    };
    if (!(candidate.metrics.f1 > incumbentF1)) {
      if (recoveringExistingPromotion) {
        throw Object.assign(new Error("Recorded promotion does not satisfy the strict F1 rule"), { statusCode: 409 });
      }
      await connection.query(
        "UPDATE retraining_jobs SET promoted = false, end_time = CURRENT_TIMESTAMP WHERE id = $1",
        [job.id],
      );
      await connection.query("COMMIT");
      transactionOpen = false;
      return res.status(200).json({
        status: "not_promoted",
        primary_metric: "f1",
        reason: "candidate_f1_not_better",
        ...comparison,
        candidate_promoted: false,
      });
    }

    const expectedServingVersion = recoveringExistingPromotion ? previousVersion : activeModel.model_version;
    const servingInfo = await mlServiceClient.getModelInfo();
    const productionMetadata = readProductionMetadata();
    const productionVersion = productionMetadata.model_version || productionMetadata.candidate_version;
    if (
      servingInfo.model_name !== modelId ||
      productionMetadata.model_id !== modelId ||
      servingInfo.model_version !== expectedServingVersion ||
      productionVersion !== expectedServingVersion
    ) {
      throw Object.assign(new Error("Serving model, production artifact, and incumbent DB version do not agree"), { statusCode: 409 });
    }

    const staged = await artifactPromotionService.promoteCandidate(modelId, candidate.candidate_version);
    backupToken = staged.backup_token;
    await mlServiceClient.reloadModel({ model_id: modelId, model_version: candidate.candidate_version });

    let promotedModel = activeModel;
    if (!recoveringExistingPromotion) {
      await connection.query(
        "UPDATE model_versions SET is_active = false WHERE model_id = $1 AND is_active = true",
        [modelId],
      );
      const existingVersion = await connection.query(
        "SELECT id FROM model_versions WHERE model_id = $1 AND model_version = $2 FOR UPDATE",
        [modelId, candidate.candidate_version],
      );
      if (existingVersion.rows.length) {
        const updated = await connection.query(
          `UPDATE model_versions
           SET mlflow_run_id = $1, accuracy = $2, precision_score = $3,
               recall = $4, f1_score = $5, is_active = true
           WHERE id = $6 RETURNING *`,
          [candidate.mlflow_run_id, candidate.metrics.accuracy, candidate.metrics.precision, candidate.metrics.recall, candidate.metrics.f1, existingVersion.rows[0].id],
        );
        promotedModel = updated.rows[0];
      } else {
        const inserted = await connection.query(
          `INSERT INTO model_versions (model_id, model_version, mlflow_run_id, accuracy, precision_score, recall, f1_score, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true) RETURNING *`,
          [modelId, candidate.candidate_version, candidate.mlflow_run_id, candidate.metrics.accuracy, candidate.metrics.precision, candidate.metrics.recall, candidate.metrics.f1],
        );
        promotedModel = inserted.rows[0];
      }
    }

    await connection.query(
      "UPDATE retraining_jobs SET promoted = true, end_time = CURRENT_TIMESTAMP WHERE id = $1",
      [job.id],
    );
    await connection.query("COMMIT");
    transactionOpen = false;
    await artifactPromotionService.finalize(backupToken).catch(() => {});
    return res.status(200).json({
      status: recoveringExistingPromotion ? "reconciled" : "promoted",
      primary_metric: "f1",
      reason: recoveringExistingPromotion ? "recorded_promotion_reconciled" : "candidate_f1_better",
      ...comparison,
      candidate_promoted: true,
      model_version: promotedModel,
      reload_status: "success",
      active_model_version: candidate.candidate_version,
    });
  } catch (err) {
    if (transactionOpen && connection) {
      await connection.query("ROLLBACK").catch(() => {});
      transactionOpen = false;
    }

    let restoredPrevious = false;
    try {
      if (backupToken) await artifactPromotionService.rollback(backupToken);
      if (modelId && previousVersion) {
        const productionMetadata = readProductionMetadata();
        const servingInfo = await mlServiceClient.getModelInfo();
        const productionVersion = productionMetadata.model_version || productionMetadata.candidate_version;
        if (productionVersion === previousVersion && servingInfo.model_version !== previousVersion) {
          await mlServiceClient.reloadModel({ model_id: modelId, model_version: previousVersion });
        }
        const verifiedServingInfo = await mlServiceClient.getModelInfo();
        restoredPrevious = productionVersion === previousVersion && verifiedServingInfo.model_version === previousVersion;
      }
    } catch (rollbackError) {
      restoredPrevious = false;
    }

    if (recoveringExistingPromotion && modelId && previousVersion && restoredPrevious) {
      await restoreActiveDatabaseVersion(modelId, candidate.candidate_version, previousVersion).catch(() => {});
    }
    return res.status(err.statusCode || 502).json({
      status: "promotion_failed",
      success: false,
      error: err.message || "Model promotion failed",
      candidate_promoted: false,
      reload_status: restoredPrevious ? "rolled_back" : "unchanged",
    });
  } finally {
    connection?.release();
  }
};

exports.updateRetrainingJob = async (req, res) => {
  const { id } = req.params;
  if (Object.prototype.hasOwnProperty.call(req.body || {}, "promoted")) {
    return res.status(409).json({
      success: false,
      error: "Promotion status can only be changed by the promotion workflow",
    });
  }
  const { end_time } = req.body || {};
  try {
    const result = await pool.query(
      `UPDATE retraining_jobs SET end_time = $1 WHERE id = $2 RETURNING *`,
      [end_time, id],
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: "Retraining job not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.deleteRetrainingJob = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("DELETE FROM retraining_jobs WHERE id = $1 RETURNING *", [id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: "Retraining job not found" });
    res.json({ success: true, deleted: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};