const pool = require("../db");
const { body, validationResult } = require("express-validator");

exports.validateModel = [
  body("model_id").notEmpty().withMessage("model_id is required"),
  body("model_version")
    .optional()
    .isString()
    .withMessage("model_version must be a string"),
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
      `SELECT id, model_id, model_version, mlflow_run_id, timestamp,
              accuracy, precision_score AS precision, recall, f1_score AS f1,
              CASE WHEN is_active AND active_rank = 1 THEN true ELSE false END AS is_active
       FROM (
         SELECT *, ROW_NUMBER() OVER (
           PARTITION BY model_id ORDER BY is_active DESC, timestamp DESC
         ) AS active_rank
         FROM model_versions
       ) ranked
       ORDER BY timestamp DESC`,
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to retrieve model versions" });
  }
};

exports.createModel = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  if (req.body.is_active === true || String(req.body.is_active).toLowerCase() === "true") {
    return res.status(409).json({ success: false, error: "Active versions can only be set by model promotion" });
  }
  const {
    model_id,
    model_version,
    mlflow_run_id,
    accuracy,
    precision_score,
    recall,
    f1_score,
  } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO model_versions (model_id, model_version, mlflow_run_id, accuracy, precision_score, recall, f1_score, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, false) RETURNING *`,
      [
        model_id,
        model_version,
        mlflow_run_id,
        accuracy,
        precision_score,
        recall,
        f1_score,
      ],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.updateModel = async (req, res) => {
  res.status(409).json({
    success: false,
    error: "Active versions can only be changed by model promotion",
  });
};

exports.deleteModel = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "DELETE FROM model_versions WHERE id = $1 AND is_active = false RETURNING *",
      [id],
    );
    if (result.rows.length === 0) {
      const existing = await pool.query("SELECT is_active FROM model_versions WHERE id = $1", [id]);
      if (existing.rows.length) {
        return res.status(409).json({ success: false, error: "The active model version cannot be deleted" });
      }
      return res
        .status(404)
        .json({ success: false, error: "Model version not found" });
    }
    res.json({ success: true, deleted: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
