const pool = require("../db");
const { body, validationResult } = require("express-validator");

exports.validateRetrainingJob = [
  body("model_id").notEmpty().withMessage("model_id is required"),
  body("triggered_by")
    .isIn(["auto", "manual"])
    .withMessage('triggered_by must be "auto" or "manual"'),
];

exports.getAllRetrainingJobs = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM retraining_jobs ORDER BY start_time DESC",
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.createRetrainingJob = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  const {
    model_id,
    triggered_by,
    start_time,
    end_time,
    old_model_version,
    new_model_version,
    promoted,
  } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO retraining_jobs (model_id, triggered_by, start_time, end_time, old_model_version, new_model_version, promoted)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        model_id,
        triggered_by,
        start_time,
        end_time,
        old_model_version,
        new_model_version,
        promoted || false,
      ],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.updateRetrainingJob = async (req, res) => {
  const { id } = req.params;
  const { promoted, end_time } = req.body;
  try {
    const result = await pool.query(
      `UPDATE retraining_jobs SET promoted = $1, end_time = $2 WHERE id = $3 RETURNING *`,
      [promoted, end_time, id],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Retraining job not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.deleteRetrainingJob = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "DELETE FROM retraining_jobs WHERE id = $1 RETURNING *",
      [id],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Retraining job not found" });
    }
    res.json({ success: true, deleted: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
