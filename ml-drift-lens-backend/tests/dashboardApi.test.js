const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");

const pool = require("../db");
const metricsController = require("../controllers/metricsController");
const driftController = require("../controllers/driftController");
const alertsController = require("../controllers/alertsController");
const modelsController = require("../controllers/modelsController");
const retrainingController = require("../controllers/retrainingController");
const healthController = require("../controllers/healthController");
const mlServiceClient = require("../services/mlServiceClient");

const originalQuery = pool.query;
const originalCheckHealth = mlServiceClient.checkHealth;

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

afterEach(() => {
  pool.query = originalQuery;
  mlServiceClient.checkHealth = originalCheckHealth;
});

test("reports database and inference health accurately", async () => {
  pool.query = async (query) => {
    assert.equal(query, "SELECT 1");
    return { rows: [{ "?column?": 1 }] };
  };
  mlServiceClient.checkHealth = async () => ({ healthy: true, message: "healthy" });

  const response = responseRecorder();
  await healthController.health({}, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.database_connected, true);
  assert.equal(response.body.ml_service_healthy, true);
});

test("reports an unavailable database as unhealthy", async () => {
  pool.query = async () => { throw new Error("database unavailable"); };
  mlServiceClient.checkHealth = async () => ({ healthy: true, message: "healthy" });

  const response = responseRecorder();
  await healthController.health({}, response);

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.database_connected, false);
  assert.equal(response.body.ml_service_healthy, true);
});

test("returns calculated monitoring metrics and current model metadata", async () => {
  pool.query = async (query) => {
    assert.match(query, /predictions\.model_id = current_model\.model_id/);
    assert.match(query, /predictions\.model_version = current_model\.model_version/);
    assert.match(query, /predictions\.actual_label IS NOT NULL THEN 1 ELSE 0 END\)::float8 AS predicted_positives/);
    return { rows: [{
      total_prediction_count: 10,
      labeled_prediction_count: 8,
      accuracy: 0.75,
      true_positives: 3,
      predicted_positives: 4,
      actual_positives: 6,
      model_id: "detector",
      model_version: "2.0.0",
      latest_prediction_timestamp: "2026-09-07T00:00:00Z",
    }] };
  };

  const response = responseRecorder();
  await metricsController.getMetrics({}, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.total_prediction_count, 10);
  assert.equal(response.body.labeled_prediction_count, 8);
  assert.equal(response.body.accuracy, 0.75);
  assert.equal(response.body.precision, 0.75);
  assert.equal(response.body.recall, 0.5);
  assert.equal(response.body.f1, 0.6);
  assert.equal(response.body.model_version, "2.0.0");
});

test("returns explicit insufficient-data metrics for an empty database", async () => {
  pool.query = async () => ({ rows: [{
    total_prediction_count: 0,
    labeled_prediction_count: 0,
    accuracy: null,
    true_positives: 0,
    predicted_positives: 0,
    actual_positives: 0,
  }] });

  const response = responseRecorder();
  await metricsController.getMetrics({}, response);

  assert.equal(response.body.metrics_status, "insufficient_data");
  assert.equal(response.body.accuracy, null);
  assert.equal(response.body.f1, null);
  assert.equal(response.body.model_id, null);
});

test("returns drift history with validated pagination", async () => {
  let values;
  pool.query = async (text, queryValues) => {
    values = queryValues;
    return { rows: [{ id: 4, model_id: "detector", metric_type: "PSI", score: 0.3, threshold: 0.2, status: "drift", timestamp: "2026-09-07T00:00:00Z" }] };
  };

  const response = responseRecorder();
  await driftController.getDriftHistory({ query: { limit: "20", offset: "10" } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body[0].metric_type, "PSI");
  assert.deepEqual(values, [20, 10]);
});

test("returns alert, model, and retraining dashboard records", async () => {
  const responses = [
    [{ id: 1, model_id: "detector", message: "Drift", status: "open", timestamp: "now", drift_score_id: 4 }],
    [{ id: 2, model_id: "detector", model_version: "2.0.0", mlflow_run_id: null, timestamp: "now", accuracy: 0.9, precision: 0.9, recall: 0.9, f1: 0.9, is_active: true }],
    [{ id: 3, model_id: "detector", triggered_by: "manual", start_time: "start", end_time: "end", old_model_version: "1.0.0", new_model_version: "2.0.0", promoted: true, reload_status: null }],
  ];
  pool.query = async () => ({ rows: responses.shift() });

  const alertResponse = responseRecorder();
  await alertsController.getAllAlerts({ query: {} }, alertResponse);
  const modelResponse = responseRecorder();
  await modelsController.getAllModels({}, modelResponse);
  const retrainingResponse = responseRecorder();
  await retrainingController.getAllRetrainingJobs({}, retrainingResponse);

  assert.equal(alertResponse.body[0].drift_score_id, 4);
  assert.equal(modelResponse.body[0].is_active, true);
  assert.equal(retrainingResponse.body[0].promoted, true);
  assert.equal(retrainingResponse.body[0].reload_status, null);
});

test("rejects invalid pagination and hides database errors", async () => {
  let response = responseRecorder();
  await alertsController.getAllAlerts({ query: { limit: "0" } }, response);
  assert.equal(response.statusCode, 400);

  pool.query = async () => { throw new Error("password=hidden"); };
  response = responseRecorder();
  await driftController.getDriftHistory({ query: {} }, response);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { success: false, error: "Failed to retrieve drift history" });
  assert.doesNotMatch(JSON.stringify(response.body), /password/);
});
