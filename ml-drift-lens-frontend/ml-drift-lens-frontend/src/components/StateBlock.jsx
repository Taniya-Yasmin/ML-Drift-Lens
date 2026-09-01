export function Loading({ label = "Loading data" }) {
  return (
    <div className="state-block">
      <strong>{label}…</strong>
      Pulling the latest rows from the API.
    </div>
  );
}

export function EmptyState({ title = "No data yet", detail }) {
  return (
    <div className="state-block">
      <strong>{title}</strong>
      {detail || "Nothing has been recorded for this yet."}
    </div>
  );
}

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="error-banner">
      Couldn't reach the API — {message}. Is the backend running on port 3000?
    </div>
  );
}
