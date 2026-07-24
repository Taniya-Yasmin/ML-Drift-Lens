const pool = require("../db");
const { body, validationResult } = require("express-validator");

exports.validateModel = [
  body("model_id").notEmpty().withMessage("model_id is required"),
  body("accuracy")
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage("accuracy must be between 0 and 1"),
  body("precision_score")
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage("precision_score must be between 0 and 1"),
  body("recall")
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage("recall must be between 0 and 1"),
  body("f1_score")
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage("f1_score must be between 0 and 1"),
];

exports.getAllModels = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM model_versions ORDER BY timestamp DESC",
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.createModel = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  const {
    model_id,
    mlflow_run_id,
    accuracy,
    precision_score,
    recall,
    f1_score,
    is_active,
  } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO model_versions (model_id, mlflow_run_id, accuracy, precision_score, recall, f1_score, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        model_id,
        mlflow_run_id,
        accuracy,
        precision_score,
        recall,
        f1_score,
        is_active || false,
      ],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.updateModel = async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;
  try {
    const result = await pool.query(
      `UPDATE model_versions SET is_active = $1 WHERE id = $2 RETURNING *`,
      [is_active, id],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Model version not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.deleteModel = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "DELETE FROM model_versions WHERE id = $1 RETURNING *",
      [id],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Model version not found" });
    }
    res.json({ success: true, deleted: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
