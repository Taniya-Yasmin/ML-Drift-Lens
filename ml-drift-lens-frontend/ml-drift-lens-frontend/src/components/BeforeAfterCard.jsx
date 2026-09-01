import { formatDateTime, formatPercent } from "../utils/format";

const METRICS = [
  { key: "accuracy", label: "Accuracy" },
  { key: "precision_score", label: "Precision" },
  { key: "recall", label: "Recall" },
  { key: "f1_score", label: "F1" },
];

function Delta({ before, after }) {
  if (before === null || before === undefined || after === null || after === undefined) return null;
  const diff = Number(after) - Number(before);
  if (Number.isNaN(diff) || Math.abs(diff) < 0.0005) return <span className="text-faint mono">±0.0%</span>;
  const tone = diff > 0 ? "good" : "critical";
  const sign = diff > 0 ? "+" : "";
  return <span className={`stat-trend ${tone} mono`}>{sign}{(diff * 100).toFixed(1)}%</span>;
}

/**
 * One retraining job's old vs new model metrics, side by side.
 * `oldModel` / `newModel` are rows from /api/models (or null if no
 * match was found — see findModelVersionMatch in utils/stats.js).
 * We never invent numbers for a version we couldn't find.
 */
export default function BeforeAfterCard({ job, oldModel, newModel }) {
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <p className="card-title">
            {job.model_id}: {job.old_model_version || "?"} → {job.new_model_version || "?"}
          </p>
          <p className="card-title-sub">
            Triggered {job.triggered_by} · {formatDateTime(job.start_time)}
          </p>
        </div>
        <span className={`badge ${job.promoted ? "good" : "neutral"}`}>
          <span className="pulse-dot" />
          {job.promoted ? "promoted" : "not promoted"}
        </span>
      </div>

      {!oldModel && !newModel && (
        <p className="text-faint" style={{ fontSize: 12.5 }}>
          Couldn't find recorded metrics for either version in /api/models — nothing to compare yet.
        </p>
      )}

      {(oldModel || newModel) && (
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              <th>Before ({job.old_model_version || "—"})</th>
              <th>After ({job.new_model_version || "—"})</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {METRICS.map((m) => (
              <tr key={m.key}>
                <td>{m.label}</td>
                <td className="mono">{oldModel ? formatPercent(oldModel[m.key]) : "not found"}</td>
                <td className="mono">{newModel ? formatPercent(newModel[m.key]) : "not found"}</td>
                <td>
                  <Delta before={oldModel?.[m.key]} after={newModel?.[m.key]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
