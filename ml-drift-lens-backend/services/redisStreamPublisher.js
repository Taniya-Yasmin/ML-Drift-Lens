const { createClient } = require("redis");

const STREAM_NAME = "modelwatch:drift";
const EVENT_TYPE = "drift_detected";

function buildDriftEventPayload(driftRecord) {
  const { id, model_id, model_version, metric_type, score, threshold, status } = driftRecord || {};

  return {
    stream_name: STREAM_NAME,
    event_type: EVENT_TYPE,
    drift_score_id: id,
    model_id,
    model_version,
    metric_type,
    score,
    threshold,
    status,
    timestamp: new Date().toISOString(),
  };
}

function isSignificantDrift(driftRecord) {
  return String(driftRecord?.status || "").trim() === "significant_drift";
}

async function getRedisClient() {
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

  const client = createClient({ url: redisUrl });
  client.on("error", (err) => {
    console.warn("Redis stream publisher error:", err.message);
  });

  try {
    await client.connect();
  } catch (error) {
    return { client: null, error };
  }

  return { client, error: null };
}

async function publishDriftEvent(driftRecord, clientOverride = null) {
  if (!isSignificantDrift(driftRecord)) {
    return { published: false, reason: "not_significant_drift" };
  }

  const payload = buildDriftEventPayload(driftRecord);
  const client = clientOverride || (await getRedisClient()).client;
  const ownsClient = !clientOverride;

  if (!client) {
    return { published: false, reason: "Redis unavailable" };
  }

  try {
    const eventId = await client.xAdd(payload.stream_name, "*", {
      event_type: payload.event_type,
      drift_score_id: String(payload.drift_score_id ?? ""),
      model_id: String(payload.model_id || ""),
      model_version: String(payload.model_version || ""),
      metric_type: String(payload.metric_type || ""),
      score: String(payload.score ?? ""),
      threshold: String(payload.threshold ?? ""),
      status: String(payload.status || ""),
      timestamp: payload.timestamp,
    });

    return {
      published: true,
      event_id: eventId,
      stream_name: payload.stream_name,
      event_type: payload.event_type,
    };
  } catch (error) {
    return { published: false, reason: error.message };
  } finally {
    if (ownsClient && client?.isOpen && typeof client.quit === "function") {
      await client.quit().catch(() => {});
    }
  }
}

async function readRecentDriftEvents(count = 10, clientOverride = null) {
  const client = clientOverride || (await getRedisClient()).client;
  const ownsClient = !clientOverride;

  if (!client) {
    return [];
  }

  try {
    const entries = await client.xRange(STREAM_NAME, "-", "+", { COUNT: Number(count) || 10 });
    return entries.map(([id, fields]) => {
      if (fields && typeof fields === "object" && !Array.isArray(fields)) {
        return { id, ...fields };
      }

      const record = {};
      if (Array.isArray(fields)) {
        for (let i = 0; i < fields.length; i += 2) {
          record[fields[i]] = fields[i + 1];
        }
      }
      return { id, ...record };
    });
  } catch (error) {
    return [];
  } finally {
    if (ownsClient && client?.isOpen && typeof client.quit === "function") {
      await client.quit().catch(() => {});
    }
  }
}

module.exports = {
  STREAM_NAME,
  EVENT_TYPE,
  buildDriftEventPayload,
  isSignificantDrift,
  getRedisClient,
  publishDriftEvent,
  readRecentDriftEvents,
};