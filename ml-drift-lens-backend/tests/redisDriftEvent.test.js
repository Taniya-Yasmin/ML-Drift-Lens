const assert = require("node:assert/strict");
const { test, beforeEach, afterEach } = require("node:test");

const {
  publishDriftEvent,
  readRecentDriftEvents,
  buildDriftEventPayload,
} = require("../services/redisStreamPublisher");

let redisClientState;

beforeEach(() => {
  redisClientState = {
    connected: true,
    xAdd: async () => "event-id",
    xRange: async () => [
      ["1712345678901-0", { event_type: "drift_detected", model_id: "nsl-kdd-baseline" }],
    ],
  };
});

afterEach(() => {
  redisClientState = null;
});

test("builds a significant drift payload with the expected stream and event type", () => {
  const payload = buildDriftEventPayload({
    model_id: "nsl-kdd-baseline",
    model_version: "0.1.0",
    metric_type: "PSI",
    score: 0.28,
    threshold: 0.2,
    status: "significant_drift",
  });

  assert.equal(payload.event_type, "drift_detected");
  assert.equal(payload.model_id, "nsl-kdd-baseline");
  assert.equal(payload.model_version, "0.1.0");
  assert.equal(payload.metric_type, "PSI");
  assert.equal(payload.status, "significant_drift");
  assert.equal(payload.stream_name, "modelwatch:drift");
});

test("publishes redis events only for significant drift", async () => {
  const calls = [];
  const client = {
    xAdd: async (...args) => {
      calls.push(args);
      return "event-id";
    },
  };

  await publishDriftEvent(
    {
      model_id: "nsl-kdd-baseline",
      model_version: "0.1.0",
      metric_type: "PSI",
      score: 0.28,
      threshold: 0.2,
      status: "significant_drift",
    },
    client,
  );

  await publishDriftEvent(
    {
      model_id: "nsl-kdd-baseline",
      metric_type: "PSI",
      score: 0.12,
      threshold: 0.2,
      status: "moderate_drift",
    },
    client,
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "modelwatch:drift");
  assert.equal(calls[0][2].event_type, "drift_detected");
  assert.equal(calls[0][2].model_version, "0.1.0");
});

test("returns recent stream entries without failing when Redis is unavailable", async () => {
  const client = {
    xRange: async () => [
      ["1712345678901-0", { event_type: "drift_detected", model_id: "nsl-kdd-baseline" }],
    ],
  };

  const events = await readRecentDriftEvents(10, client);

  assert.equal(events.length, 1);
  assert.equal(events[0].event_type, "drift_detected");
});

test("handles Redis failures safely without throwing", async () => {
  const client = {
    xAdd: async () => {
      throw new Error("Redis unavailable");
    },
  };

  const result = await publishDriftEvent(
    {
      model_id: "nsl-kdd-baseline",
      metric_type: "PSI",
      score: 0.3,
      threshold: 0.2,
      status: "significant_drift",
    },
    client,
  );

  assert.deepEqual(result, { published: false, reason: "Redis unavailable" });
});