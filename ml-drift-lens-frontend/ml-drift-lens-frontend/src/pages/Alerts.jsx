import { useState } from "react";
import usePolling from "../hooks/usePolling";
import { alertsApi } from "../api/client";
import Badge from "../components/Badge";
import { Loading, EmptyState, ErrorBanner } from "../components/StateBlock";
import { formatDateTime, normalize } from "../utils/format";

export default function Alerts() {
  const { data: alerts, error, loading, refetch } = usePolling(() => alertsApi.list(), 12000);
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);

  async function resolve(alert) {
    setBusyId(alert.id);
    setActionError(null);
    try {
      await alertsApi.update(alert.id, { status: "resolved" });
      await refetch();
    } catch (err) {
      setActionError(err?.response?.data?.error || err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Alerts</h1>
          <p className="page-sub">Drift and performance alerts raised for your models.</p>
        </div>
      </div>

      <ErrorBanner message={error} />
      {actionError && <div className="error-banner">Couldn't update alert — {actionError}</div>}
      {loading && !alerts && <Loading label="Loading alerts" />}

      {alerts && (
        <div className="card">
          <div className="card-head">
            <p className="card-title">{alerts.length} alert(s) (last 50)</p>
          </div>
          {alerts.length ? (
            <table>
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Message</th>
                  <th>Status</th>
                  <th>Raised</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => {
                  const resolved = ["resolved", "closed"].includes(normalize(a.status));
                  return (
                    <tr key={a.id}>
                      <td className="mono">{a.model_id}</td>
                      <td>{a.message}</td>
                      <td>
                        <Badge status={a.status} />
                      </td>
                      <td className="text-faint">{formatDateTime(a.timestamp)}</td>
                      <td>
                        {!resolved && (
                          <button
                            className="select"
                            style={{ cursor: "pointer" }}
                            disabled={busyId === a.id}
                            onClick={() => resolve(a)}
                          >
                            {busyId === a.id ? "Resolving…" : "Mark resolved"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <EmptyState title="No alerts" detail="Nothing has fired yet." />
          )}
        </div>
      )}
    </div>
  );
}
