import { useMemo, useState } from "react";
import usePolling from "../hooks/usePolling";
import { driftApi } from "../api/client";
import DriftTrendChart from "../components/charts/DriftTrendChart";
import Badge from "../components/Badge";
import { Loading, EmptyState, ErrorBanner } from "../components/StateBlock";
import { splitDriftByMetric } from "../utils/stats";
import { formatDateTime, formatNumber } from "../utils/format";

export default function DriftMonitoring() {
  const { data: drift, error, loading } = usePolling(() => driftApi.list(), 15000);
  const [modelFilter, setModelFilter] = useState("all");
  const [tab, setTab] = useState("psi");

  const modelIds = useMemo(
    () => Array.from(new Set((drift || []).map((d) => d.model_id))),
    [drift],
  );

  const filtered = useMemo(() => {
    if (!drift) return [];
    return modelFilter === "all" ? drift : drift.filter((d) => d.model_id === modelFilter);
  }, [drift, modelFilter]);

  const { psi, zscore, other } = useMemo(() => splitDriftByMetric(filtered), [filtered]);
  const active = tab === "psi" ? psi : tab === "zscore" ? zscore : other;
  const chartData = active.slice(0, 30).slice().reverse();

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Data Drift Monitoring</h1>
          <p className="page-sub">PSI and Z-score readings against configured thresholds.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <select className="select" value={modelFilter} onChange={(e) => setModelFilter(e.target.value)}>
            <option value="all">All models</option>
            {modelIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          <div className="pill-toggle">
            <button className={tab === "psi" ? "active" : ""} onClick={() => setTab("psi")}>
              PSI ({psi.length})
            </button>
            <button className={tab === "zscore" ? "active" : ""} onClick={() => setTab("zscore")}>
              Z-Score ({zscore.length})
            </button>
            {other.length > 0 && (
              <button className={tab === "other" ? "active" : ""} onClick={() => setTab("other")}>
                Other ({other.length})
              </button>
            )}
          </div>
        </div>
      </div>

      <ErrorBanner message={error} />
      {loading && !drift && <Loading label="Loading drift scores" />}

      {drift && (
        <>
          <div className="card">
            <div className="card-head">
              <div>
                <p className="card-title">{tab === "psi" ? "PSI" : tab === "zscore" ? "Z-score" : "Metric"} trend</p>
                <p className="card-title-sub">Dashed line marks the recorded threshold</p>
              </div>
            </div>
            {chartData.length ? (
              <DriftTrendChart data={chartData} />
            ) : (
              <EmptyState
                title="No readings for this filter"
                detail="Try switching the metric tab or model filter."
              />
            )}
          </div>

          <div className="signal-divider" />

          <div className="card">
            <div className="card-head">
              <p className="card-title">All readings</p>
            </div>
            {active.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Metric</th>
                    <th>Score</th>
                    <th>Threshold</th>
                    <th>Status</th>
                    <th>Recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {active.map((row) => (
                    <tr key={row.id}>
                      <td className="mono">{row.model_id}</td>
                      <td>{row.metric_type}</td>
                      <td className="mono">{formatNumber(row.score)}</td>
                      <td className="mono text-muted">{formatNumber(row.threshold)}</td>
                      <td>
                        <Badge status={row.status} />
                      </td>
                      <td className="text-faint">{formatDateTime(row.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState title="Nothing to show" />
            )}
          </div>
        </>
      )}
    </div>
  );
}
