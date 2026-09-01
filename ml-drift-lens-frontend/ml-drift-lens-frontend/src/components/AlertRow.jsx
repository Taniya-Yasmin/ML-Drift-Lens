import Badge from "./Badge";
import { statusTone, timeAgo } from "../utils/format";

export default function AlertRow({ alert }) {
  const tone = statusTone(alert.status);
  const iconBg = { critical: "var(--critical-dim)", warn: "var(--warn-dim)", good: "var(--good-dim)", neutral: "rgba(124,139,156,0.14)" }[tone];
  const iconColor = { critical: "var(--critical)", warn: "var(--warn)", good: "var(--good)", neutral: "var(--text-muted)" }[tone];

  return (
    <div className="list-row">
      <div className="list-row-icon" style={{ background: iconBg, color: iconColor }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2a6 6 0 00-6 6v3.5c0 .8-.3 1.6-.9 2.2L4 15h16l-1.1-1.3a3 3 0 01-.9-2.2V8a6 6 0 00-6-6z" />
        </svg>
      </div>
      <div className="list-row-body">
        <p className="list-row-title">{alert.message}</p>
        <div className="list-row-meta">
          {alert.model_id} · {timeAgo(alert.timestamp)}
        </div>
      </div>
      <Badge status={alert.status} />
    </div>
  );
}
