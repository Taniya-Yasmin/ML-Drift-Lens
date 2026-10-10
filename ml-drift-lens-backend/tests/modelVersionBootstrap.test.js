const assert = require("node:assert/strict");
const { test } = require("node:test");

const { ensureActiveModelVersion } = require("../services/modelVersionBootstrap");

function createPool(registeredRows = []) {
  const queries = [];
  const connection = {
    async query(text, values = []) {
      queries.push({ text, values });
      if (/SELECT model_version, is_active/i.test(text)) return { rows: registeredRows };
      return { rows: [] };
    },
    release() {},
  };
  return { queries, connect: async () => connection };
}

const metadata = {
  model_id: "nsl-kdd-baseline",
  model_version: "candidate-1",
  mlflow_run_id: "run-1",
  metrics: { accuracy: 0.9, precision: 0.8, recall: 0.7, f1: 0.75 },
};

test("registers the real production artifact only when its model has no history", async () => {
  const pool = createPool();
  const result = await ensureActiveModelVersion({ poolOverride: pool, metadata });
  const insert = pool.queries.find(({ text }) => /INSERT INTO model_versions/i.test(text));

  assert.deepEqual(result, { status: "registered", model_id: "nsl-kdd-baseline", model_version: "candidate-1" });
  assert.deepEqual(insert.values, ["nsl-kdd-baseline", "candidate-1", "run-1", 0.9, 0.8, 0.7, 0.75]);
  assert.ok(pool.queries.some(({ text }) => /LOCK TABLE public\.model_versions/i.test(text)));
  assert.ok(pool.queries.some(({ text }) => /^COMMIT$/i.test(text)));
});

test("does not rewrite an already registered active production version", async () => {
  const pool = createPool([{ model_version: "candidate-1", is_active: true }]);
  const result = await ensureActiveModelVersion({ poolOverride: pool, metadata });

  assert.equal(result.status, "already_registered");
  assert.equal(pool.queries.some(({ text }) => /INSERT INTO model_versions/i.test(text)), false);
});

test("fails closed when existing model history has no matching active artifact", async () => {
  const pool = createPool([{ model_version: "old-version", is_active: true }]);

  await assert.rejects(
    ensureActiveModelVersion({ poolOverride: pool, metadata }),
    /does not match the active production artifact/,
  );
  assert.ok(pool.queries.some(({ text }) => /^ROLLBACK$/i.test(text)));
  assert.equal(pool.queries.some(({ text }) => /INSERT INTO model_versions/i.test(text)), false);
});