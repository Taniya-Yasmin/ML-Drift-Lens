import { useMemo, useState } from "react";
import usePolling from "../hooks/usePolling";
import { modelsApi } from "../api/client";
import ModelCard from "../components/ModelCard";
import PerformanceChart from "../components/charts/PerformanceChart";
import { Loading, EmptyState, ErrorBanner } from "../components/StateBlock";

export default function Models() {
  const { data: models, error, loading } = usePolling(() => modelsApi.list(), 20000);
  const [modelFilter, setModelFilter] = useState("all");

  const modelIds = useMemo(
    () => Array.from(new Set((models || []).map((m) => m.model_id))),
    [models],
  );

  // Time-series trend: pick one model (defaults to the first one seen),
  // then sort ITS rows ascending by timestamp so the line chart reads
  // left-to-right as "oldest version -> newest version".
  const trendModelId = modelFilter === "all" ? modelIds[0] : modelFilter;
  const trendSeries = useMemo(() => {
    if (!models || !trendModelId) return [];
    return models
      .filter((m) => m.model_id === trendModelId)
      .slice()
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }, [models, trendModelId]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Models</h1>
          <p className="page-sub">Registered model versions and their evaluation metrics.</p>
        </div>
        {modelIds.length > 1 && (
          <select className="select" value={modelFilter} onChange={(e) => setModelFilter(e.target.value)}>
            <option value="all">{modelIds[0]} (default)</option>
            {modelIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        )}
      </div>

      <ErrorBanner message={error} />
      {loading && !models && <Loading label="Loading models" />}

      {models && (
        <>
          <div className="card">
            <div className="card-head">
              <div>
                <p className="card-title">Accuracy / F1 trend{trendModelId ? ` — ${trendModelId}` : ""}</p>
                <p className="card-title-sub">Every recorded version over time, oldest to newest</p>
              </div>
            </div>
            {trendSeries.length ? (
              <PerformanceChart data={trendSeries} />
            ) : (
              <EmptyState title="No models registered" detail="POST to /api/models to register a version." />
            )}
          </div>

          <div className="signal-divider" />

          {models.length ? (
            <div className="models-grid">
              {models.map((m) => (
                <ModelCard key={m.id} model={m} />
              ))}
            </div>
          ) : (
            <EmptyState title="No model versions yet" />
          )}
        </>
      )}
    </div>
  );
}
