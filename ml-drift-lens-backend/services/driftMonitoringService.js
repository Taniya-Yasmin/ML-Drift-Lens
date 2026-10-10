const { spawn } = require("node:child_process");
const path = require("node:path");
const pool = require("../db");
const { publishDriftEvent } = require("./redisStreamPublisher");

const DEFAULT_THRESHOLD = 0.20;
const DEFAULT_MIN_SAMPLES = 100;
const WINDOW_SIZE = 100;
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const monitoringLocks = new Map();

function runDetector(rows, spawnProcess = spawn) {
  return new Promise((resolve, reject) => {
    const executable = process.env.PYTHON_EXECUTABLE || "python";
    const child = spawnProcess(executable, ["-m", "ml.drift"], {
      cwd: PROJECT_ROOT,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Drift detector timed out"));
    }, Number(process.env.DRIFT_DETECTOR_TIMEOUT_MS || 30000));

    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timeout); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) return reject(new Error(`Drift detector failed with exit code ${code}`));
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Invalid drift detector response${stderr ? `: ${stderr.trim()}` : ""}`));
      }
    });
    child.stdin.end(JSON.stringify(rows));
  });
}

async function persistDriftResult(query, modelId, result) {
  const existing = await query(
    `SELECT id, score, threshold, status
     FROM drift_scores WHERE model_id = $1 ORDER BY timestamp DESC LIMIT 1`,
    [modelId],
  );
  const latest = existing.rows[0];
  if (latest && latest.status === result.status && Number(latest.score) === Number(result.overall_score)) {
    return { ...latest, unchanged: true };
  }
  const inserted = await query(
    `INSERT INTO drift_scores (model_id, metric_type, score, threshold, status)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, model_id, metric_type, score, threshold, status, timestamp`,
    [modelId, "PSI", Number(result.overall_score), DEFAULT_THRESHOLD, result.status],
  );
  return inserted.rows[0];
}

async function processPrediction({ modelId, modelVersion }, dependencies = {}) {
  const previous = monitoringLocks.get(modelId) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  monitoringLocks.set(modelId, current);
  await previous;

  try {
  const query = dependencies.query || ((text, values) => pool.query(text, values));
  const detector = dependencies.runDetector || runDetector;
  const publishEvent = dependencies.publishDriftEvent || publishDriftEvent;
  const result = await query(
    `SELECT model_id, model_version, input_features
     FROM predictions
     WHERE model_id = $1 AND model_version = $2
     ORDER BY timestamp DESC LIMIT $3`,
    [modelId, modelVersion, WINDOW_SIZE],
  );
  const rows = result.rows;
  if (rows.length === 0) return { status: "insufficient_data", persisted: false };

  const detectorResult = rows.length < DEFAULT_MIN_SAMPLES
    ? { metric_type: "PSI", overall_score: 0, threshold: DEFAULT_THRESHOLD, status: "insufficient_data", number_of_rows: rows.length }
    : await detector(rows.map((row) => row.input_features));
  const driftRecord = await persistDriftResult(query, modelId, detectorResult);

  if (detectorResult.status === "significant_drift") {
    const eventRecord = { ...driftRecord, model_version: modelVersion };
    const redisEvent = driftRecord.unchanged
      ? { published: false, reason: "unchanged_drift" }
      : await publishEvent(eventRecord);
    return { status: detectorResult.status, persisted: true, alertCreated: false, driftRecord, redisEvent };
  }
  return { status: detectorResult.status, persisted: true, alertCreated: false, driftRecord };
  } finally {
    release();
    if (monitoringLocks.get(modelId) === current) monitoringLocks.delete(modelId);
  }
}

module.exports = {
  DEFAULT_THRESHOLD,
  DEFAULT_MIN_SAMPLES,
  WINDOW_SIZE,
  runDetector,
  processPrediction,
};