const pool = require("../db");
const { body, validationResult } = require("express-validator");

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
      "SELECT * FROM drift_scores ORDER BY timestamp DESC LIMIT 50",
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.createDriftScore = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  const { model_id, metric_type, score, threshold, status } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO drift_scores (model_id, metric_type, score, threshold, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [model_id, metric_type, score, threshold, status],
    );
    res.status(201).json(result.rows[0]);
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
    res.json(result.rows[0]);
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
