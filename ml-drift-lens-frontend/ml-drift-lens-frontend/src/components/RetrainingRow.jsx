import { formatDateTime, timeAgo } from "../utils/format";

export default function RetrainingRow({ job }) {
  const running = job.start_time && !job.end_time;
  const tone = running ? "warn" : job.promoted ? "good" : "neutral";
  const label = running ? "running" : job.promoted ? "promoted" : "not promoted";

  return (
    <div className="list-row">
      <div
        className="list-row-icon"
        style={{
          background: tone === "good" ? "var(--good-dim)" : tone === "warn" ? "var(--warn-dim)" : "rgba(124,139,156,0.14)",
          color: tone === "good" ? "var(--good)" : tone === "warn" ? "var(--warn)" : "var(--text-muted)",
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 11-3-6.7" strokeLinecap="round" />
          <path d="M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="list-row-body">
        <p className="list-row-title">
          {job.model_id}
          {job.old_model_version && job.new_model_version
            ? ` · ${job.old_model_version} → ${job.new_model_version}`
            : ""}
        </p>
        <div className="list-row-meta">
          triggered {job.triggered_by} · {formatDateTime(job.start_time)}
          {job.end_time ? ` → ${formatDateTime(job.end_time)}` : ` · ${timeAgo(job.start_time)}`}
        </div>
      </div>
      <span className={`badge ${tone}`}>
        <span className="pulse-dot" />
        {label}
      </span>
    </div>
  );
}
