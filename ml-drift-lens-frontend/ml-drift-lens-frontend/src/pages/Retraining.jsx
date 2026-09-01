import { useMemo } from "react";
import usePolling from "../hooks/usePolling";
import { modelsApi, retrainingApi } from "../api/client";
import RetrainingRow from "../components/RetrainingRow";
import BeforeAfterCard from "../components/BeforeAfterCard";
import { Loading, EmptyState, ErrorBanner } from "../components/StateBlock";
import { findModelVersionMatch } from "../utils/stats";

async function fetchAll() {
  const [jobs, models] = await Promise.all([retrainingApi.list(), modelsApi.list()]);
  return { jobs, models };
}

export default function Retraining() {
  const { data, error, loading } = usePolling(fetchAll, 15000);
  const jobs = data?.jobs;
  const models = data?.models || [];
  const running = (jobs || []).filter((j) => j.start_time && !j.end_time);
  const promoted = (jobs || []).filter((j) => j.promoted);

  // Only jobs that recorded both a before and after version label are
  // worth attempting a comparison for.
  const comparableJobs = useMemo(
    () => (jobs || []).filter((j) => j.old_model_version && j.new_model_version),
    [jobs],
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Retraining</h1>
          <p className="page-sub">History of automatic and manual retraining jobs.</p>
        </div>
      </div>

      <ErrorBanner message={error} />
      {loading && !jobs && <Loading label="Loading retraining history" />}

      {jobs && (
        <>
          <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            <div className="stat-card">
              <div className="stat-label">Total Jobs</div>
              <div className="stat-value-row">
                <span className="stat-value">{jobs.length}</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Running Now</div>
              <div className="stat-value-row">
                <span className="stat-value">{running.length}</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Promoted</div>
              <div className="stat-value-row">
                <span className="stat-value">{promoted.length}</span>
              </div>
            </div>
          </div>

          <div className="signal-divider" />

          <div className="card">
            <div className="card-head">
              <p className="card-title">Job history</p>
            </div>
            {jobs.length ? (
              jobs.map((j) => <RetrainingRow key={j.id} job={j} />)
            ) : (
              <EmptyState title="No retraining jobs" detail="Trigger one manually or wait for auto-retraining to fire." />
            )}
          </div>

          <div className="signal-divider" />

          <div className="page-head" style={{ marginBottom: 12 }}>
            <div>
              <h2 className="page-title" style={{ fontSize: 17 }}>Before vs After Retraining</h2>
              <p className="page-sub">
                Matches each job's recorded versions against /api/models by mlflow_run_id.
              </p>
            </div>
          </div>

          {comparableJobs.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {comparableJobs.map((job) => {
                const oldModel = findModelVersionMatch(models, job.model_id, job.old_model_version);
                const newModel = findModelVersionMatch(models, job.model_id, job.new_model_version);
                return <BeforeAfterCard key={job.id} job={job} oldModel={oldModel} newModel={newModel} />;
              })}
            </div>
          ) : (
            <EmptyState
              title="No comparable jobs yet"
              detail="A job needs both old_model_version and new_model_version recorded to compare."
            />
          )}
        </>
      )}
    </div>
  );
}
