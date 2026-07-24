const pool = require("../db");
const { body, validationResult } = require("express-validator");

exports.validatePrediction = [
  body("model_id").notEmpty().withMessage("model_id is required"),
  body("input_features")
    .isObject()
    .withMessage("input_features must be an object"),
  body("prediction").notEmpty().withMessage("prediction is required"),
  body("confidence")
    .isFloat({ min: 0, max: 1 })
    .withMessage("confidence must be a number between 0 and 1"),
];

exports.getAllPredictions = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM predictions ORDER BY timestamp DESC LIMIT 50",
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.createPrediction = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  const { model_id, input_features, prediction, confidence } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO predictions (model_id, input_features, prediction, confidence)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [model_id, input_features, prediction, confidence],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.updatePrediction = async (req, res) => {
  const { id } = req.params;
  const { actual_label } = req.body;
  try {
    const result = await pool.query(
      `UPDATE predictions SET actual_label = $1 WHERE id = $2 RETURNING *`,
      [actual_label, id],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Prediction not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.deletePrediction = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "DELETE FROM predictions WHERE id = $1 RETURNING *",
      [id],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Prediction not found" });
    }
    res.json({ success: true, deleted: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
