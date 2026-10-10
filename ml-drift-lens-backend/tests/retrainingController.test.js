const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { afterEach, test } = require("node:test");

const pool = require("../db");
const retrainingController = require("../controllers/retrainingController");
const modelsController = require("../controllers/modelsController");
const candidateRetrainingService = require("../services/candidateRetrainingService");
const artifactPromotionService = require("../services/artifactPromotionService");
const mlServiceClient = require("../services/mlServiceClient");

const originalQuery = pool.query;
const originalConnect = pool.connect;
const originalRun = candidateRetrainingService.runCandidateRetraining;
const originalPromoteCandidate = artifactPromotionService.promoteCandidate;
const originalRollback = artifactPromotionService.rollback;
const originalFinalize = artifactPromotionService.finalize;
const originalGetModelInfo = mlServiceClient.getModelInfo;
const originalReloadModel = mlServiceClient.reloadModel;
const originalReadFileSync = fs.readFileSync;
const projectRoot = candidateRetrainingService.projectRoot;
const productionMetadataPath = path.join(projectRoot, "ml", "artifacts", "metadata.json");
const candidateFiles = new Set();

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

function createCandidate(version, f1, { modelId = "nsl-kdd-baseline", promoted = false } = {}) {
  const directory = path.join(projectRoot, "ml", "artifacts", "candidates");
  fs.mkdirSync(directory, { recursive: true });
  const artifactPath = path.join(directory, `${version}.joblib`);
  const metadataPath = path.join(directory, `${version}.json`);
  const metadata = {
    model_id: modelId,
    candidate_version: version,
    mlflow_run_id: "unit-test-run",
    preprocessing_version: "preprocessing-v1",
    metrics: { accuracy: 0.8, precision: 0.7, recall: f1, f1 },
    promoted,
  };
  fs.writeFileSync(artifactPath, "test-only candidate fixture");
  fs.writeFileSync(metadataPath, JSON.stringify(metadata));
  candidateFiles.add(artifactPath);
  candidateFiles.add(metadataPath);
  return metadata;
}

function createConnection({ job, active, previous = null, recoveryActive = active } = {}) {
  const queries = [];
  const connection = {
    queries,
    release() {},
    async query(text, values = []) {
      queries.push({ text, values });
      if (/^BEGIN$/i.test(text) || /^COMMIT$/i.test(text) || /^ROLLBACK$/i.test(text)) return { rows: [] };
      if (/SELECT \* FROM retraining_jobs WHERE id = \$1 FOR UPDATE/i.test(text)) return { rows: [job] };
      if (/SELECT \* FROM model_versions WHERE model_id = \$1 AND is_active = true FOR UPDATE/i.test(text)) return { rows: [active] };
      if (/SELECT \* FROM model_versions WHERE model_id = \$1 AND model_version = \$2 LIMIT 1/i.test(text)) {
        return { rows: previous && previous.model_version === values[1] ? [previous] : [] };
      }
      if (/SELECT id FROM model_versions WHERE model_id = \$1 AND model_version = \$2 FOR UPDATE/i.test(text)) return { rows: [] };
      if (/INSERT INTO model_versions/i.test(text)) {
        return { rows: [{ id: 99, model_id: values[0], model_version: values[1], f1_score: values[6], is_active: true }] };
      }
      if (/UPDATE model_versions SET is_active = false WHERE model_id/i.test(text)) return { rows: [] };
      if (/UPDATE retraining_jobs SET promoted = true/i.test(text)) return { rows: [{ ...job, promoted: true }] };
      if (/UPDATE retraining_jobs SET promoted = false/i.test(text)) return { rows: [{ ...job, promoted: false }] };
      if (/RETURNING \*/i.test(text)) return { rows: [{ ...active, is_active: true }] };
      return { rows: [] };
    },
  };
  return connection;
}

function configurePromotionMocks(connection, { reloadFails = false } = {}) {
  const order = [];
  let currentVersion = "0.1.0";
  fs.readFileSync = (filePath, ...args) => {
    if (path.resolve(filePath) === path.resolve(productionMetadataPath)) {
      return JSON.stringify({ model_id: "nsl-kdd-baseline", model_version: "0.1.0" });
    }
    return originalReadFileSync(filePath, ...args);
  };
  pool.connect = async () => connection;
  mlServiceClient.getModelInfo = async () => ({ model_name: "nsl-kdd-baseline", model_version: currentVersion });
  artifactPromotionService.promoteCandidate = async (modelId, version) => {
    order.push("artifact");
    assert.equal(modelId, "nsl-kdd-baseline");
    return { backup_token: "a".repeat(32), model_version: version };
  };
  artifactPromotionService.rollback = async () => { order.push("rollback"); };
  artifactPromotionService.finalize = async () => { order.push("finalize"); };
  mlServiceClient.reloadModel = async ({ model_id, model_version }) => {
    order.push("reload");
    if (reloadFails) throw new Error("inference reload failed");
    currentVersion = model_version;
    return { status: "success", model_id, active_model_version: model_version };
  };
  return order;
}

afterEach(() => {
  pool.query = originalQuery;
  pool.connect = originalConnect;
  candidateRetrainingService.runCandidateRetraining = originalRun;
  artifactPromotionService.promoteCandidate = originalPromoteCandidate;
  artifactPromotionService.rollback = originalRollback;
  artifactPromotionService.finalize = originalFinalize;
  mlServiceClient.getModelInfo = originalGetModelInfo;
  mlServiceClient.reloadModel = originalReloadModel;
  fs.readFileSync = originalReadFileSync;
  for (const file of candidateFiles) fs.rmSync(file, { force: true });
  candidateFiles.clear();
});

test("executes candidate retraining from labeled predictions and stores an unpromoted job", async () => {
  const labeledRows = [{ id: 1, model_id: "nsl-kdd-baseline", input_features: { duration: 1 }, actual_label: "normal" }];
  const candidate = {
    status: "completed",
    candidate_version: "candidate-unit-create",
    sample_count: 30,
    promoted: false,
    metrics: { accuracy: 0.8, precision: 0.7, recall: 0.6, f1: 0.65 },
  };
  let insertValues;
  pool.query = async (query, values) => {
    if (/SELECT id, model_id, input_features/i.test(query)) return { rows: labeledRows };
    insertValues = values;
    return { rows: [{ id: 11, model_id: values[0], promoted: values[6], new_model_version: values[5] }] };
  };
  candidateRetrainingService.runCandidateRetraining = async (rows, options) => {
    assert.deepEqual(rows, labeledRows);
    assert.equal(options.modelId, "nsl-kdd-baseline");
    return candidate;
  };

  const response = responseRecorder();
  await retrainingController.createRetrainingJob(
    { body: { model_id: "nsl-kdd-baseline", triggered_by: "manual" } },
    response,
  );

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.candidate, candidate);
  assert.equal(response.body.job.promoted, false);
  assert.equal(insertValues[5], candidate.candidate_version);
  assert.equal(insertValues[6], false);
});

test("promotes only a candidate whose F1 is strictly greater and commits after reload", async () => {
  const version = "candidate-unit-better";
  createCandidate(version, 0.5);
  const job = { id: 42, model_id: "nsl-kdd-baseline", old_model_version: "0.1.0", new_model_version: version, promoted: false };
  const active = { id: 1, model_id: "nsl-kdd-baseline", model_version: "0.1.0", f1_score: 0.0851063829787234, is_active: true };
  const connection = createConnection({ job, active });
  const order = configurePromotionMocks(connection);

  const response = responseRecorder();
  await retrainingController.promoteRetrainingJob({ params: { id: "42" } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "promoted");
  assert.equal(response.body.candidate_promoted, true);
  assert.equal(response.body.active_model_version, version);
  assert.ok(order.indexOf("artifact") < order.indexOf("reload"));
  assert.ok(order.indexOf("reload") < connection.queries.findIndex(({ text }) => /^COMMIT$/i.test(text)));
  const modelInsert = connection.queries.find(({ text }) => /INSERT INTO model_versions/i.test(text));
  assert.ok(modelInsert);
  assert.equal(modelInsert.values[2], "unit-test-run");
});

for (const [label, f1] of [["equal", 0.0851063829787234], ["lower", 0.08]]) {
  test(`rejects candidate with ${label} F1 without artifact promotion`, async () => {
    const version = `candidate-unit-${label}`;
    createCandidate(version, f1);
    const job = { id: 43, model_id: "nsl-kdd-baseline", old_model_version: "0.1.0", new_model_version: version, promoted: false };
    const active = { id: 1, model_id: "nsl-kdd-baseline", model_version: "0.1.0", f1_score: 0.0851063829787234, is_active: true };
    const connection = createConnection({ job, active });
    let artifactPromotionCalled = false;
    pool.connect = async () => connection;
    artifactPromotionService.promoteCandidate = async () => { artifactPromotionCalled = true; };

    const response = responseRecorder();
    await retrainingController.promoteRetrainingJob({ params: { id: "43" } }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, "not_promoted");
    assert.equal(response.body.candidate_promoted, false);
    assert.equal(artifactPromotionCalled, false);
    assert.equal(connection.queries.some(({ text }) => /INSERT INTO model_versions/i.test(text)), false);
  });
}

test("failed artifact preparation leaves the incumbent DB row active", async () => {
  const version = "candidate-unit-artifact-failure";
  createCandidate(version, 0.5);
  const job = { id: 44, model_id: "nsl-kdd-baseline", old_model_version: "0.1.0", new_model_version: version, promoted: false };
  const active = { id: 1, model_id: "nsl-kdd-baseline", model_version: "0.1.0", f1_score: 0.085, is_active: true };
  const connection = createConnection({ job, active });
  configurePromotionMocks(connection);
  artifactPromotionService.promoteCandidate = async () => { throw new Error("artifact load failed"); };

  const response = responseRecorder();
  await retrainingController.promoteRetrainingJob({ params: { id: "44" } }, response);

  assert.equal(response.statusCode, 502);
  assert.equal(response.body.candidate_promoted, false);
  assert.ok(connection.queries.some(({ text }) => /^ROLLBACK$/i.test(text)));
  assert.equal(connection.queries.some(({ text }) => /UPDATE model_versions|INSERT INTO model_versions/i.test(text)), false);
});

test("reload failure rolls back artifacts and never activates the candidate in PostgreSQL", async () => {
  const version = "candidate-unit-reload-failure";
  createCandidate(version, 0.5);
  const job = { id: 45, model_id: "nsl-kdd-baseline", old_model_version: "0.1.0", new_model_version: version, promoted: false };
  const active = { id: 1, model_id: "nsl-kdd-baseline", model_version: "0.1.0", f1_score: 0.085, is_active: true };
  const connection = createConnection({ job, active });
  const order = configurePromotionMocks(connection, { reloadFails: true });

  const response = responseRecorder();
  await retrainingController.promoteRetrainingJob({ params: { id: "45" } }, response);

  assert.equal(response.statusCode, 502);
  assert.equal(response.body.candidate_promoted, false);
  assert.ok(order.includes("rollback"));
  assert.equal(connection.queries.some(({ text }) => /UPDATE model_versions|INSERT INTO model_versions/i.test(text)), false);
});

for (const jobPromoted of [true, false]) {
test(`reconciles an already-active candidate with promoted job status ${jobPromoted}`, async () => {
  const version = "candidate-unit-reconcile";
  createCandidate(version, 0.5);
  const job = { id: 3, model_id: "nsl-kdd-baseline", old_model_version: "0.1.0", new_model_version: version, promoted: jobPromoted };
  const active = { id: 2, model_id: "nsl-kdd-baseline", model_version: version, f1_score: 0.5, is_active: true };
  const previous = { id: 1, model_id: "nsl-kdd-baseline", model_version: "0.1.0", f1_score: 0.0851063829787234, is_active: false };
  const connection = createConnection({ job, active, previous });
  const order = configurePromotionMocks(connection);

  const response = responseRecorder();
  await retrainingController.promoteRetrainingJob({ params: { id: "3" } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "reconciled");
  assert.equal(response.body.incumbent.f1, previous.f1_score);
  assert.equal(response.body.candidate.f1, active.f1_score);
  assert.equal(order.includes("reload"), true);
  assert.equal(connection.queries.some(({ text }) => /INSERT INTO model_versions/i.test(text)), false);
});
}

test("database migration enforces one active model row per model identity", () => {
  const migrationPath = path.join(__dirname, "..", "migrations", "008_one_active_model_per_identity.sql");
  const migration = fs.readFileSync(migrationPath, "utf8");
  assert.match(migration, /CREATE UNIQUE INDEX[\s\S]*ON public\.model_versions \(model_id\)[\s\S]*WHERE is_active = true/i);
});

test("model CRUD cannot bypass promotion to set or remove the active model", async () => {
  let queryCount = 0;
  pool.query = async () => {
    queryCount += 1;
    return { rows: queryCount === 1 ? [] : [{ is_active: true }] };
  };
  const createResponse = responseRecorder();
  await modelsController.createModel(
    { body: { model_id: "nsl-kdd-baseline", model_version: "manual", is_active: true } },
    createResponse,
  );
  const updateResponse = responseRecorder();
  await modelsController.updateModel({ params: { id: "2" }, body: { is_active: false } }, updateResponse);
  const deleteResponse = responseRecorder();
  await modelsController.deleteModel({ params: { id: "2" } }, deleteResponse);

  assert.equal(createResponse.statusCode, 409);
  assert.equal(updateResponse.statusCode, 409);
  assert.equal(deleteResponse.statusCode, 409);
  assert.equal(queryCount, 2);
});

test("retraining job API cannot set promoted outside promotion workflow", async () => {
  let queryCalled = false;
  pool.query = async () => { queryCalled = true; return { rows: [] }; };
  const response = responseRecorder();

  await retrainingController.updateRetrainingJob(
    { params: { id: "3" }, body: { promoted: true, end_time: "2026-09-26T00:00:00Z" } },
    response,
  );

  assert.equal(response.statusCode, 409);
  assert.equal(queryCalled, false);
});