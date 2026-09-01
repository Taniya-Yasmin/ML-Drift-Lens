import { useMemo } from "react";
import usePolling from "../hooks/usePolling";
import { alertsApi, driftApi, modelsApi, retrainingApi } from "../api/client";
import StatCard from "../components/StatCard";
import AlertRow from "../components/AlertRow";
import RetrainingRow from "../components/RetrainingRow";
import DriftTrendChart from "../components/charts/DriftTrendChart";
import { Loading, EmptyState, ErrorBanner } from "../components/StateBlock";
import { average, countByStatus, splitDriftByMetric, toSparkline } from "../utils/stats";
import { normalize } from "../utils/format";

async function fetchAll() {
  const [alerts, drift, models, retraining] = await Promise.all([
    alertsApi.list(),
    driftApi.list(),
    modelsApi.list(),
    retrainingApi.list(),
  ]);
  return { alerts, drift, models, retraining };
}

export default function Dashboard() {
  const { data, error, loading } = usePolling(fetchAll, 15000);

  const stats = useMemo(() => {
    if (!data) return null;
    const { alerts, drift, models, retraining } = data;

    const activeModels = models.filter((m) => m.is_active);
    const avgAccuracy = average(activeModels.map((m) => m.accuracy));

    const openAlerts = alerts.filter((a) => {
      const s = normalize(a.status);
      return s !== "resolved" && s !== "closed";
    });

    const { psi, zscore } = splitDriftByMetric(drift);
    const driftStatusCounts = countByStatus(drift);
    const breaching = (driftStatusCounts.breach || 0) + (driftStatusCounts.critical || 0);

    const runningJobs = retraining.filter((j) => j.start_time && !j.end_time);

    return {
      activeModelsCount: activeModels.length,
      totalModelsCount: models.length,
      avgAccuracy,
      openAlertsCount: openAlerts.length,
      totalAlertsCount: alerts.length,
      psiSpark: toSparkline(psi, "score"),
      psiLatest: psi[0],
      zscoreSpark: toSparkline(zscore, "score"),
      zscoreLatest: zscore[0],
      breachingCount: breaching,
      runningJobsCount: runningJobs.length,
      recentAlerts: alerts.slice(0, 6),
      recentJobs: retraining.slice(0, 5),
      driftChartData: drift.slice(0, 25).slice().reverse(),
    };
  }, [data]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Overview</h1>
          <p className="page-sub">Live status across every monitored model.</p>
        </div>
      </div>

      <ErrorBanner message={error} />

      {loading && !data && <Loading label="Loading dashboard" />}

      {stats && (
        <>
          <div className="kpi-grid">
            <StatCard
              label="Active Models"
              value={`${stats.activeModelsCount}/${stats.totalModelsCount}`}
              trend={stats.avgAccuracy !== null ? `${(stats.avgAccuracy * 100).toFixed(1)}% avg acc` : undefined}
              trendTone="good"
            />
            <StatCard
              label="Open Alerts"
              value={stats.openAlertsCount}
              trend={`${stats.totalAlertsCount} total (last 50)`}
              trendTone={stats.openAlertsCount > 0 ? "critical" : "good"}
            />
            <StatCard
              label="PSI (latest)"
              value={stats.psiLatest ? Number(stats.psiLatest.score).toFixed(3) : "—"}
              trend={stats.psiLatest ? stats.psiLatest.status : "no data"}
              trendTone={stats.psiLatest ? undefined : "neutral"}
              spark={stats.psiSpark}
              threshold={stats.psiLatest?.threshold ? Number(stats.psiLatest.threshold) : undefined}
              sparkColor="#5b8def"
            />
            <StatCard
              label="Z-Score (latest)"
              value={stats.zscoreLatest ? Number(stats.zscoreLatest.score).toFixed(3) : "—"}
              trend={stats.zscoreLatest ? stats.zscoreLatest.status : "no data"}
              trendTone={stats.zscoreLatest ? undefined : "neutral"}
              spark={stats.zscoreSpark}
              threshold={stats.zscoreLatest?.threshold ? Number(stats.zscoreLatest.threshold) : undefined}
              sparkColor="#4ade80"
            />
          </div>

          <div className="signal-divider" />

          <div className="content-grid">
            <div className="card">
              <div className="card-head">
                <div>
                  <p className="card-title">Drift score trend</p>
                  <p className="card-title-sub">Most recent {stats.driftChartData.length} readings, all metrics</p>
                </div>
              </div>
              {stats.driftChartData.length ? (
                <DriftTrendChart data={stats.driftChartData} />
              ) : (
                <EmptyState title="No drift scores recorded" detail="POST to /api/drift to start populating this chart." />
              )}
            </div>

            <div className="card">
              <div className="card-head">
                <p className="card-title">Recent alerts</p>
              </div>
              {stats.recentAlerts.length ? (
                stats.recentAlerts.map((a) => <AlertRow key={a.id} alert={a} />)
              ) : (
                <EmptyState title="No alerts" detail="Alerts will show up here once created." />
              )}
            </div>
          </div>

          <div className="signal-divider" />

          <div className="card">
            <div className="card-head">
              <div>
                <p className="card-title">Recent retraining activity</p>
                <p className="card-title-sub">{stats.runningJobsCount} job(s) currently running</p>
              </div>
            </div>
            {stats.recentJobs.length ? (
              stats.recentJobs.map((j) => <RetrainingRow key={j.id} job={j} />)
            ) : (
              <EmptyState title="No retraining jobs yet" detail="Jobs appear here once triggered, manually or automatically." />
            )}
          </div>
        </>
      )}
    </div>
  );
}
