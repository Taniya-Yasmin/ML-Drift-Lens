const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");

const monitoringService = require("../services/driftMonitoringService");

const originalRetrainingFlag = process.env.DRIFT_RETRAINING_ENABLED;

afterEach(() => {
  if (originalRetrainingFlag === undefined) delete process.env.DRIFT_RETRAINING_ENABLED;
  else process.env.DRIFT_RETRAINING_ENABLED = originalRetrainingFlag;
});

function rows(count) {
  return Array.from({ length: count }, () => ({
    model_id: "nsl-kdd-baseline",
    model_version: "0.1.0",
    input_features: { duration: 1 },
  }));
}

test("persists one insufficient-data result without alerting or retraining", async () => {
  const queries = [];
  const query = async (text, values) => {
    queries.push({ text, values });
    if (/FROM predictions/i.test(text)) return { rows: rows(30) };
    if (/FROM drift_scores/i.test(text)) return { rows: [] };
    return { rows: [{ id: 10, model_id: "nsl-kdd-baseline", status: "insufficient_data", score: 0, threshold: 0.2 }] };
  };
  let publishedEvents = 0;

  const result = await monitoringService.processPrediction(
    { modelId: "nsl-kdd-baseline", modelVersion: "0.1.0" },
    {
      query,
      publishDriftEvent: async () => { publishedEvents += 1; return { published: false, reason: "test" }; },
    },
  );

  assert.equal(result.status, "insufficient_data");
  assert.equal(result.alertCreated, false);
  assert.equal(publishedEvents, 0);
  const predictionQuery = queries.find(({ text }) => /FROM predictions/i.test(text));
  assert.match(predictionQuery.text, /WHERE model_id = \$1 AND model_version = \$2/);
  assert.deepEqual(predictionQuery.values, ["nsl-kdd-baseline", "0.1.0", 100]);
  assert.equal(queries.filter(({ text }) => /INSERT INTO drift_scores/i.test(text)).length, 1);
  assert.equal(queries.filter(({ text }) => /INSERT INTO alerts/i.test(text)).length, 0);
});

test("persists significant drift and publishes one event for the consumer", async () => {
  const queries = [];
  const query = async (text) => {
    queries.push(text);
    if (/FROM predictions/i.test(text)) return { rows: rows(100) };
    if (/FROM drift_scores/i.test(text)) return { rows: [] };
    if (/INSERT INTO drift_scores/i.test(text)) return { rows: [{ id: 11, model_id: "nsl-kdd-baseline", score: 0.8, threshold: 0.2, status: "significant_drift" }] };
    return { rows: [] };
  };
  let publishedEvents = 0;

  const result = await monitoringService.processPrediction(
    { modelId: "nsl-kdd-baseline", modelVersion: "0.1.0" },
    {
      query,
      publishDriftEvent: async () => { publishedEvents += 1; return { published: false, reason: "test" }; },
      runDetector: async () => ({ metric_type: "PSI", overall_score: 0.8, threshold: 0.2, status: "significant_drift", number_of_rows: 100 }),
    },
  );

  assert.equal(result.status, "significant_drift");
  assert.equal(result.alertCreated, false);
  assert.equal(publishedEvents, 1);
  assert.equal(queries.filter((text) => /INSERT INTO drift_scores/i.test(text)).length, 1);
  assert.equal(queries.filter((text) => /INSERT INTO alerts/i.test(text)).length, 0);
});

test("detector failures reject monitoring without changing prediction response flow", async () => {
  const query = async (text) => /FROM predictions/i.test(text) ? { rows: rows(100) } : { rows: [] };
  await assert.rejects(
    monitoringService.processPrediction(
      { modelId: "nsl-kdd-baseline", modelVersion: "0.1.0" },
      { query, runDetector: async () => { throw new Error("detector unavailable"); } },
    ),
    /detector unavailable/,
  );
});

test("does not duplicate an unchanged drift result or alert", async () => {
  let driftRows = [];
  let publishedEvents = 0;
  const query = async (text) => {
    if (/FROM predictions/i.test(text)) return { rows: rows(100) };
    if (/FROM drift_scores/i.test(text)) return { rows: driftRows };
    if (/INSERT INTO drift_scores/i.test(text)) {
      driftRows = [{ id: 21, model_id: "nsl-kdd-baseline", score: 0.8, threshold: 0.2, status: "significant_drift" }];
      return { rows: driftRows };
    }
    return { rows: [] };
  };
  const dependencies = {
    query,
    publishDriftEvent: async () => { publishedEvents += 1; return { published: true }; },
    runDetector: async () => ({ metric_type: "PSI", overall_score: 0.8, threshold: 0.2, status: "significant_drift", number_of_rows: 100 }),
  };

  await monitoringService.processPrediction({ modelId: "nsl-kdd-baseline", modelVersion: "0.1.0" }, dependencies);
  await monitoringService.processPrediction({ modelId: "nsl-kdd-baseline", modelVersion: "0.1.0" }, dependencies);

  assert.equal(publishedEvents, 1);
});

test("serializes concurrent insufficient-data evaluations", async () => {
  let driftInserts = 0;
  let driftRows = [];
  const query = async (text) => {
    if (/FROM predictions/i.test(text)) return { rows: rows(30) };
    if (/FROM drift_scores/i.test(text)) return { rows: driftRows };
    if (/INSERT INTO drift_scores/i.test(text)) {
      driftInserts += 1;
      driftRows = [{ id: 31, model_id: "nsl-kdd-baseline", score: 0, threshold: 0.2, status: "insufficient_data" }];
      return { rows: driftRows };
    }
    return { rows: [] };
  };
  const dependencies = { query };
  await Promise.all([
    monitoringService.processPrediction({ modelId: "nsl-kdd-baseline", modelVersion: "0.1.0" }, dependencies),
    monitoringService.processPrediction({ modelId: "nsl-kdd-baseline", modelVersion: "0.1.0" }, dependencies),
  ]);
  assert.equal(driftInserts, 1);
});