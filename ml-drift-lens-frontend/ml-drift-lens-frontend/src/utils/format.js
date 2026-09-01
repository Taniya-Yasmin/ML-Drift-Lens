export function formatPercent(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value)))
    return "—";
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

export function formatNumber(value, digits = 3) {
  if (value === null || value === undefined || Number.isNaN(Number(value)))
    return "—";
  return Number(value).toFixed(digits);
}

export function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(value) {
  if (!value) return "—";
  const d = new Date(value).getTime();
  if (Number.isNaN(d)) return "—";
  const diffMs = Date.now() - d;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Normalizes free-text status/metric strings for consistent grouping & badge colors. */
export function normalize(str) {
  return (str || "").toString().trim().toLowerCase();
}

export function statusTone(status) {
  const s = normalize(status);
  if (["breach", "critical", "failed", "error", "open"].includes(s))
    return "critical";
  if (["warning", "warn", "drifting", "degraded", "pending"].includes(s))
    return "warn";
  if (["ok", "stable", "healthy", "resolved", "passed", "success", "active"].includes(s))
    return "good";
  return "neutral";
}
