const pool = require("../db");

exports.getMetrics = async (req, res) => {
  try {
    const result = await pool.query(`
      WITH current_model AS (
        SELECT model_id, model_version
        FROM model_versions
        WHERE is_active = true
        ORDER BY timestamp DESC
        LIMIT 1
      ), prediction_metrics AS (
        SELECT
          COUNT(predictions.id)::integer AS total_prediction_count,
          COUNT(predictions.actual_label)::integer AS labeled_prediction_count,
          AVG(CASE WHEN predictions.actual_label IS NOT NULL
            THEN CASE WHEN LOWER(predictions.prediction) = LOWER(predictions.actual_label) THEN 1.0 ELSE 0.0 END END) AS accuracy,
          SUM(CASE WHEN LOWER(predictions.prediction) = 'attack' AND LOWER(predictions.actual_label) = 'attack' THEN 1 ELSE 0 END)::float8 AS true_positives,
          SUM(CASE WHEN LOWER(predictions.prediction) = 'attack' AND predictions.actual_label IS NOT NULL THEN 1 ELSE 0 END)::float8 AS predicted_positives,
          SUM(CASE WHEN LOWER(predictions.actual_label) = 'attack' THEN 1 ELSE 0 END)::float8 AS actual_positives,
          MAX(predictions.timestamp) AS latest_prediction_timestamp
        FROM current_model
        LEFT JOIN predictions
          ON predictions.model_id = current_model.model_id
         AND predictions.model_version = current_model.model_version
      )
      SELECT
        prediction_metrics.*,
        current_model.model_id,
        current_model.model_version
      FROM prediction_metrics
      LEFT JOIN current_model ON true
    `);

    const row = result.rows[0] || {};
    const precision = row.predicted_positives ? row.true_positives / row.predicted_positives : null;
    const recall = row.actual_positives ? row.true_positives / row.actual_positives : null;
    const f1 = precision !== null && recall !== null && precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : null;

    res.json({
      total_prediction_count: Number(row.total_prediction_count || 0),
      labeled_prediction_count: Number(row.labeled_prediction_count || 0),
      accuracy: row.accuracy === null || row.accuracy === undefined ? null : Number(row.accuracy),
      precision,
      recall,
      f1,
      metrics_status: Number(row.labeled_prediction_count || 0) > 0 ? "available" : "insufficient_data",
      model_id: row.model_id || null,
      model_version: row.model_version || null,
      latest_prediction_timestamp: row.latest_prediction_timestamp || null,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to retrieve monitoring metrics" });
  }
};