import { normalize } from "./format";

/** Splits drift_scores rows by metric_type into PSI vs Z-score vs other buckets. */
export function splitDriftByMetric(driftRows = []) {
  const psi = [];
  const zscore = [];
  const other = [];
  for (const row of driftRows) {
    const m = normalize(row.metric_type);
    if (m.includes("psi")) psi.push(row);
    else if (m.includes("z") ) zscore.push(row);
    else other.push(row);
  }
  return { psi, zscore, other };
}

/** Latest row per model_id, given rows sorted DESC by timestamp (as the API returns). */
export function latestPerModel(rows = [], modelKey = "model_id") {
  const seen = new Map();
  for (const row of rows) {
    if (!seen.has(row[modelKey])) seen.set(row[modelKey], row);
  }
  return Array.from(seen.values());
}

export function countByStatus(rows = [], statusKey = "status") {
  const counts = {};
  for (const row of rows) {
    const key = normalize(row[statusKey]) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

export function average(nums = []) {
  const clean = nums.filter((n) => n !== null && n !== undefined && !Number.isNaN(Number(n)));
  if (!clean.length) return null;
  return clean.reduce((a, b) => a + Number(b), 0) / clean.length;
}

/** Builds ascending-time sparkline points from DESC-sorted API rows. */
export function toSparkline(rows = [], valueKey = "score", limit = 20) {
  return rows
    .slice(0, limit)
    .slice()
    .reverse()
    .map((row, i) => ({ i, value: Number(row[valueKey]) }));
}

/**
 * Matches a retraining job's old/new model_version strings against rows
 * from /api/models to find their recorded metrics, for a
 * before-vs-after comparison.
 *
 * IMPORTANT CAVEAT (be ready to explain this in viva): model_versions
 * has no version-label column — only model_id + mlflow_run_id. There's
 * no documented, guaranteed way to match retraining_jobs.old_model_version
 * / new_model_version against a specific model_versions row. This function
 * tries mlflow_run_id first (most likely intended match), then falls back
 * to model_id, and returns null for a field if nothing matches — it never
 * fabricates a metric.
 */
export function findModelVersionMatch(models = [], modelId, versionLabel) {
  if (!versionLabel) return null;
  const byRunId = models.find((m) => m.mlflow_run_id === versionLabel);
  if (byRunId) return byRunId;
  // Fallback: same model_id, closest is ambiguous without a version
  // column, so this only fires if model_id itself equals the label
  // (covers setups where old/new_model_version literally stores model_id).
  const byModelId = models.find((m) => m.model_id === versionLabel);
  if (byModelId) return byModelId;
  return null;
}
