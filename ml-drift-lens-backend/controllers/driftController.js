const pool = require("../db");
const { body, validationResult } = require("express-validator");
const { publishDriftEvent } = require("../services/redisStreamPublisher");
const { parsePagination } = require("../utils/pagination");

exports.validateDriftScore = [
  body("model_id").notEmpty().withMessage("model_id is required"),
  body("metric_type").notEmpty().withMessage("metric_type is required"),
  body("score").isFloat().withMessage("score must be a number"),
  body("threshold").isFloat().withMessage("threshold must be a number"),
  body("status").notEmpty().withMessage("status is required"),
];

exports.getAllDriftScores = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, model_id, metric_type, score, threshold, status, timestamp
       FROM drift_scores ORDER BY timestamp DESC LIMIT 1`,
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to retrieve latest drift status" });
  }
};

exports.getDriftHistory = async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query || {});
    const result = await pool.query(
      `SELECT id, model_id, metric_type, score, threshold, status, timestamp
       FROM drift_scores ORDER BY timestamp DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    res.json(result.rows);
  } catch (err) {
    if (err.message.includes("limit must") || err.message.includes("offset must")) {
      return res.status(400).json({ success: false, error: err.message });
    }
    res.status(500).json({ success: false, error: "Failed to retrieve drift history" });
  }
};

exports.createDriftScore = async (req, res) => {
  const errors = validationResult(req);
  const hasMiddlewareErrors = !errors.isEmpty();

  const { model_id, metric_type, score, threshold, status } = req.body || {};
  const directValidationErrors = [];

  if (!model_id || String(model_id).trim() === "") {
    directValidationErrors.push({ path: "model_id", msg: "model_id is required" });
  }
  if (!metric_type || String(metric_type).trim() === "") {
    directValidationErrors.push({ path: "metric_type", msg: "metric_type is required" });
  }
  if (score === undefined || score === null || Number.isNaN(Number(score)) || Number(score) < 0) {
    directValidationErrors.push({ path: "score", msg: "score must be a number" });
  }
  if (threshold === undefined || threshold === null || Number.isNaN(Number(threshold)) || Number(threshold) < 0) {
    directValidationErrors.push({ path: "threshold", msg: "threshold must be a number" });
  }
  if (!status || String(status).trim() === "") {
    directValidationErrors.push({ path: "status", msg: "status is required" });
  }

  if (hasMiddlewareErrors || directValidationErrors.length > 0) {
    const allErrors = hasMiddlewareErrors ? errors.array() : [];
    return res.status(400).json({
      success: false,
      errors: [...allErrors, ...directValidationErrors],
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO drift_scores (model_id, metric_type, score, threshold, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [model_id, metric_type, Number(score), Number(threshold), status],
    );

    const persistedRow = result.rows[0];
    try {
      const publishResult = await publishDriftEvent(persistedRow);
      if (publishResult.published) {
        console.log(
          `Redis drift event published: ${publishResult.stream_name}/${publishResult.event_type}`,
        );
      }
    } catch (eventError) {
      console.warn("Redis drift event publish failed:", eventError.message);
    }

    res.status(201).json(persistedRow);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.updateDriftScore = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const result = await pool.query(
      `UPDATE drift_scores SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Drift score not found" });
    }
    const updatedRow = result.rows[0];
    try {
      const publishResult = await publishDriftEvent(updatedRow);
      if (publishResult.published) {
        console.log(
          `Redis drift event published: ${publishResult.stream_name}/${publishResult.event_type}`,
        );
      }
    } catch (eventError) {
      console.warn("Redis drift event publish failed:", eventError.message);
    }

    res.json(updatedRow);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.deleteDriftScore = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "DELETE FROM drift_scores WHERE id = $1 RETURNING *",
      [id],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Drift score not found" });
    }
    res.json({ success: true, deleted: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
