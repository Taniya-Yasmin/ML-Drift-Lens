const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");

const pool = require("../db");
const driftController = require("../controllers/driftController");

const originalQuery = pool.query;

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

afterEach(() => {
  pool.query = originalQuery;
});

test("creates a valid drift score row in PostgreSQL", async () => {
  const row = {
    id: 5,
    timestamp: new Date("2026-09-06T00:00:00Z"),
    model_id: "nsl-kdd-baseline",
    metric_type: "PSI",
    score: 0.18,
    threshold: 0.2,
    status: "moderate_drift",
  };

  let queryText;
  let queryValues;
  pool.query = async (text, values) => {
    queryText = text;
    queryValues = values;
    return { rows: [row] };
  };

  const response = responseRecorder();
  await driftController.createDriftScore(
    {
      body: {
        model_id: "nsl-kdd-baseline",
        metric_type: "PSI",
        score: 0.18,
        threshold: 0.2,
        status: "moderate_drift",
      },
    },
    response,
  );

  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.body, row);
  assert.match(queryText, /INSERT INTO drift_scores/i);
  assert.deepEqual(queryValues, [
    "nsl-kdd-baseline",
    "PSI",
    0.18,
    0.2,
    "moderate_drift",
  ]);
});

test("rejects invalid drift score payloads", async () => {
  const response = responseRecorder();
  await driftController.createDriftScore(
    {
      body: {
        metric_type: "PSI",
        score: "bad",
        threshold: 0.2,
        status: "moderate_drift",
      },
    },
    response,
  );

  assert.equal(response.statusCode, 400);
  assert.ok(response.body.errors);
  assert.ok(response.body.errors.some((err) => err.path === "model_id"));
  assert.ok(response.body.errors.some((err) => err.path === "score"));
});

test("retrieves recent drift score rows from PostgreSQL", async () => {
  const rows = { id: 1, model_id: "nsl-kdd-baseline", metric_type: "PSI", status: "stable" };
  let queryText;
  pool.query = async (text) => {
    queryText = text;
    return { rows: [rows] };
  };

  const response = responseRecorder();
  await driftController.getAllDriftScores({}, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, rows);
  assert.match(queryText, /SELECT id, model_id, metric_type/i);
});
