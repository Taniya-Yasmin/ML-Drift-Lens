const pool = require("../db");
const { body, validationResult } = require("express-validator");
const { parsePagination } = require("../utils/pagination");

exports.validateAlert = [
  body("drift_score_id")
    .isInt()
    .withMessage("drift_score_id must be an integer"),
  body("model_id").notEmpty().withMessage("model_id is required"),
  body("message").notEmpty().withMessage("message is required"),
  body("status").notEmpty().withMessage("status is required"),
];

exports.getAllAlerts = async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query || {});
    const result = await pool.query(
      `SELECT id, model_id, message, status, timestamp, drift_score_id
       FROM alerts ORDER BY timestamp DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    res.json(result.rows);
  } catch (err) {
    if (err.message.includes("limit must") || err.message.includes("offset must")) {
      return res.status(400).json({ success: false, error: err.message });
    }
    res.status(500).json({ success: false, error: "Failed to retrieve alerts" });
  }
};

exports.createAlert = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  const { drift_score_id, model_id, message, status } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO alerts (drift_score_id, model_id, message, status)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [drift_score_id, model_id, message, status],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.updateAlert = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const result = await pool.query(
      `UPDATE alerts SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Alert not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.deleteAlert = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "DELETE FROM alerts WHERE id = $1 RETURNING *",
      [id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Alert not found" });
    }
    res.json({ success: true, deleted: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
