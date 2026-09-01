import usePolling from "../hooks/usePolling";
import { predictionsApi } from "../api/client";
import { Loading, EmptyState, ErrorBanner } from "../components/StateBlock";
import { formatDateTime, formatPercent } from "../utils/format";

export default function Predictions() {
  const { data: predictions, error, loading } = usePolling(() => predictionsApi.list(), 15000);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Predictions</h1>
          <p className="page-sub">Raw inference log feeding the drift and performance calculations.</p>
        </div>
      </div>

      <ErrorBanner message={error} />
      {loading && !predictions && <Loading label="Loading predictions" />}

      {predictions && (
        <div className="card">
          <div className="card-head">
            <p className="card-title">{predictions.length} prediction(s) (last 50)</p>
          </div>
          {predictions.length ? (
            <table>
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Prediction</th>
                  <th>Confidence</th>
                  <th>Actual Label</th>
                  <th>Logged</th>
                </tr>
              </thead>
              <tbody>
                {predictions.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{p.model_id}</td>
                    <td className="mono">{String(p.prediction)}</td>
                    <td className="mono">{formatPercent(p.confidence)}</td>
                    <td className="mono text-muted">
                      {p.actual_label !== null && p.actual_label !== undefined ? String(p.actual_label) : "—"}
                    </td>
                    <td className="text-faint">{formatDateTime(p.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title="No predictions logged yet" />
          )}
        </div>
      )}
    </div>
  );
}
