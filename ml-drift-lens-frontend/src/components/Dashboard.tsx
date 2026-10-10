import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiClient } from '../services/apiClient';
import type {
  AlertRecord,
  DriftScore,
  ModelVersionRecord,
  MonitoringMetrics,
  PredictionHistoryItem,
  RetrainingJobRecord,
} from '../services/apiClient';
import {
  formatNumber,
  formatPercentage,
  formatTimestamp,
  normalizeStatus,
  SAFE_FALLBACK,
  safeValue,
} from '../utils/formatters';

export { formatNumber, formatPercentage as formatPercent, formatTimestamp } from '../utils/formatters';

interface MetricCardProps {
  label: string;
  value: string;
  note: string;
  tone?: 'neutral' | 'positive' | 'warning';
}

interface StatusBadgeProps {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}

interface TableColumn<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
}

type DashboardSection = 'metrics' | 'drift' | 'alerts' | 'models' | 'retraining' | 'predictions';
type SectionErrors = Partial<Record<DashboardSection, string>>;

const EMPTY_VALUE = SAFE_FALLBACK;
const READ_LIMIT = 10;
export const DEFAULT_DASHBOARD_REFRESH_INTERVAL_MS = 30_000;
export const MIN_DASHBOARD_REFRESH_INTERVAL_MS = 5_000;

export function getDashboardRefreshIntervalMs(rawValue?: string) {
  const configuredValue = rawValue ?? import.meta.env.VITE_DASHBOARD_REFRESH_INTERVAL_MS;
  const parsedValue = Number(configuredValue);
  if (!Number.isFinite(parsedValue) || parsedValue < MIN_DASHBOARD_REFRESH_INTERVAL_MS) {
    return DEFAULT_DASHBOARD_REFRESH_INTERVAL_MS;
  }
  return Math.floor(parsedValue);
}

function alertStatusTone(status: string | null | undefined): StatusBadgeProps['tone'] {
  const normalized = status?.toLowerCase();
  return normalized === 'resolved' || normalized === 'closed' ? 'success' : normalized === 'open' || normalized === 'active' ? 'warning' : 'neutral';
}

function retrainingStatus(row: RetrainingJobRecord) {
  if (row.promoted === true) return 'Promoted';
  if (row.promoted === false) return 'Not promoted';
  return EMPTY_VALUE;
}

function driftStatusTone(status: string | null | undefined, isAboveThreshold: boolean): StatusBadgeProps['tone'] {
  const normalized = status?.toLowerCase();
  if (normalized === 'insufficient_data') return 'neutral';
  if (normalized === 'drift' || normalized === 'drifting' || isAboveThreshold) return 'danger';
  if (normalized === 'warning') return 'warning';
  return 'success';
}

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') {
    const envelope = value as { data?: unknown; items?: unknown; results?: unknown };
    if (Array.isArray(envelope.data)) return envelope.data as T[];
    if (Array.isArray(envelope.items)) return envelope.items as T[];
    if (Array.isArray(envelope.results)) return envelope.results as T[];
  }
  return [];
}

function asMetrics(value: unknown): MonitoringMetrics | null {
  if (!value || typeof value !== 'object') return null;
  const envelope = value as { data?: unknown; metrics?: unknown };
  const candidate = envelope.data || envelope.metrics || value;
  return candidate && typeof candidate === 'object' ? candidate as MonitoringMetrics : null;
}

function getErrorMessage(error: unknown, section: string) {
  return error instanceof Error && error.message ? error.message : `Unable to load ${section}.`;
}

function getValidDriftPoints(history: DriftScore[]) {
  return history
    .map((item) => ({
      ...item,
      timestampValue: new Date(item.timestamp).getTime(),
      scoreValue: Number(item.score),
      thresholdValue: Number(item.threshold),
    }))
    .filter((item) => Number.isFinite(item.timestampValue) && Number.isFinite(item.scoreValue) && Number.isFinite(item.thresholdValue))
    .sort((left, right) => left.timestampValue - right.timestampValue);
}

function MetricCard({ label, value, note, tone = 'neutral' }: MetricCardProps) {
  return (
    <article className={`dashboard-metric-card metric-${tone}`}>
      <div className="dashboard-card-kicker">{label}</div>
      <strong className="dashboard-metric-value">{value}</strong>
      <span className="dashboard-card-note">{note}</span>
    </article>
  );
}

function SectionCard({ title, eyebrow, children, className = '' }: { title: string; eyebrow?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`dashboard-section-card ${className}`}>
      <div className="dashboard-section-header">
        <div>
          {eyebrow && <p className="dashboard-section-eyebrow">{eyebrow}</p>}
          <h3>{title}</h3>
        </div>
      </div>
      {children}
    </section>
  );
}

function StatusBadge({ children, tone = 'neutral' }: StatusBadgeProps) {
  return <span className={`dashboard-status-badge badge-${tone}`}>{children}</span>;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="dashboard-empty-state">
      <span className="empty-state-icon">◌</span>
      <strong>{message}</strong>
    </div>
  );
}

function DataTable<T>({ columns, rows, emptyMessage }: { columns: TableColumn<T>[]; rows: T[]; emptyMessage: string }) {
  if (rows.length === 0) return <EmptyState message={emptyMessage} />;

  return (
    <div className="dashboard-table-wrap">
      <table className="dashboard-table">
        <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index}>{columns.map((column) => <td key={column.key}>{column.render(row)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function SectionState({ loading, error, onRetry, children }: { loading: boolean; error?: string; onRetry: () => void; children: ReactNode }) {
  if (loading) return <div className="dashboard-inline-loading">Loading section...</div>;
  if (error) {
    return <div className="dashboard-section-error"><strong>Unable to load this section.</strong><span>{error}</span><button className="btn btn-secondary" type="button" onClick={onRetry}>Retry</button></div>;
  }
  return <>{children}</>;
}

function DriftPanel({ history, loading, error, onRetry }: { history: DriftScore[]; loading: boolean; error?: string; onRetry: () => void }) {
  const points = getValidDriftPoints(history);
  const latest = points[points.length - 1];
  return (
    <SectionCard title="Drift monitoring" eyebrow="Distribution health" className="drift-section">
      <SectionState loading={loading} error={error} onRetry={onRetry}>
        <div className="drift-summary-grid">
          <div><span>Latest drift score</span><strong>{latest ? formatNumber(latest.scoreValue) : EMPTY_VALUE}</strong></div>
          <div><span>Drift threshold</span><strong>{latest ? formatNumber(latest.thresholdValue) : EMPTY_VALUE}</strong></div>
          <div><span>Latest status</span><StatusBadge tone={latest ? driftStatusTone(latest.status, latest.scoreValue > latest.thresholdValue) : 'neutral'}>{latest ? normalizeStatus(latest.status) : 'Insufficient data'}</StatusBadge></div>
        </div>
        {history.length === 0 ? <EmptyState message="No drift history available" /> : points.length === 0 ? <EmptyState message="No valid drift records available" /> : (
          <div className="drift-chart" aria-label="Drift history chart showing score and configured threshold over time">
            <h4 className="sr-only">Drift score and threshold over time</h4>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={points} margin={{ top: 10, right: 18, left: 8, bottom: 8 }}>
                <CartesianGrid stroke="rgba(145, 160, 179, 0.16)" strokeDasharray="3 3" />
                <XAxis dataKey="timestamp" tickFormatter={formatTimestamp} stroke="#9aa8bb" tick={{ fontSize: 11 }} />
                <YAxis label={{ value: 'Drift score', angle: -90, position: 'insideLeft', fill: '#9aa8bb', fontSize: 11 }} stroke="#9aa8bb" tick={{ fontSize: 11 }} />
                <Tooltip labelFormatter={(label) => formatTimestamp(String(label))} contentStyle={{ background: '#111b27', border: '1px solid rgba(145, 160, 179, 0.3)', color: '#edf3ff' }} />
                <Legend />
                <Line type="monotone" dataKey="scoreValue" name="Drift score" stroke="#8b6cf6" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                <Line type="monotone" dataKey="thresholdValue" name="Threshold" stroke="#f5b942" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
            <p className="chart-accessible-summary">{points.length} valid drift readings from {formatTimestamp(points[0].timestamp)} to {formatTimestamp(points[points.length - 1].timestamp)}. Drift score is shown against the configured threshold.</p>
          </div>
        )}
        <p className="chart-caption">Drift history</p>
      </SectionState>
    </SectionCard>
  );
}

function AlertsPanel({ rows, loading, error, onRetry }: { rows: AlertRecord[]; loading: boolean; error?: string; onRetry: () => void }) {
  return (
    <SectionCard title="Alerts" eyebrow="Operational signals">
      <SectionState loading={loading} error={error} onRetry={onRetry}>
        <DataTable columns={[
          { key: 'message', label: 'Alert message', render: (row) => safeValue(row.message) },
          { key: 'model', label: 'Model ID', render: (row) => safeValue(row.model_id) },
          { key: 'status', label: 'Status', render: (row) => <StatusBadge tone={alertStatusTone(row.status)}>{normalizeStatus(row.status)}</StatusBadge> },
          { key: 'timestamp', label: 'Timestamp', render: (row) => formatTimestamp(row.timestamp) },
        ]} rows={rows} emptyMessage="No alerts available" />
      </SectionState>
    </SectionCard>
  );
}

function ModelsPanel({ rows, activeModel, loading, error, onRetry }: { rows: ModelVersionRecord[]; activeModel?: ModelVersionRecord; loading: boolean; error?: string; onRetry: () => void }) {
  return (
    <SectionCard title="Model versions" eyebrow="Registry history">
      <SectionState loading={loading} error={error} onRetry={onRetry}>
        <DataTable columns={[
          { key: 'model', label: 'Model ID', render: (row) => safeValue(row.model_id) },
          { key: 'version', label: 'Model version', render: (row) => safeValue(row.model_version) },
          { key: 'f1', label: 'F1 score', render: (row) => formatPercentage(row.f1) },
          { key: 'accuracy', label: 'Accuracy', render: (row) => formatPercentage(row.accuracy) },
          { key: 'active', label: 'Active status', render: (row) => <StatusBadge tone={activeModel?.id === row.id ? 'success' : 'neutral'}>{activeModel?.id === row.id ? 'Active model' : 'Inactive'}</StatusBadge> },
          { key: 'timestamp', label: 'Timestamp', render: (row) => formatTimestamp(row.timestamp) },
        ]} rows={rows} emptyMessage="No model versions available" />
      </SectionState>
    </SectionCard>
  );
}

function RetrainingPanel({ rows, loading, error, onRetry }: { rows: RetrainingJobRecord[]; loading: boolean; error?: string; onRetry: () => void }) {
  return (
    <SectionCard title="Retraining" eyebrow="Candidate lifecycle">
      <SectionState loading={loading} error={error} onRetry={onRetry}>
        <DataTable columns={[
          { key: 'job', label: 'Job ID', render: (row) => formatNumber(row.id) },
          { key: 'model', label: 'Model ID', render: (row) => safeValue(row.model_id) },
          { key: 'old', label: 'Old version', render: (row) => safeValue(row.old_model_version) },
          { key: 'new', label: 'New version', render: (row) => safeValue(row.new_model_version) },
          { key: 'triggered', label: 'Triggered by', render: (row) => normalizeStatus(row.triggered_by) },
          { key: 'started', label: 'Started', render: (row) => formatTimestamp(row.start_time) },
          { key: 'ended', label: 'Ended', render: (row) => formatTimestamp(row.end_time) },
          { key: 'promoted', label: 'Promotion status', render: (row) => <StatusBadge tone={row.promoted ? 'success' : 'neutral'}>{retrainingStatus(row)}</StatusBadge> },
          { key: 'candidate-f1', label: 'Candidate F1', render: (row) => formatPercentage(row.candidate_f1) },
          { key: 'incumbent-f1', label: 'Incumbent F1', render: (row) => formatPercentage(row.incumbent_f1) },
          { key: 'reason', label: 'Promotion detail', render: (row) => normalizeStatus(row.promotion_reason) },
          { key: 'reload', label: 'Reload status', render: (row) => <StatusBadge>{row.reload_status ? normalizeStatus(row.reload_status) : 'Not available'}</StatusBadge> },
        ]} rows={rows} emptyMessage="No retraining jobs available" />
      </SectionState>
      <p className="dashboard-table-note">Rejected and pending states are not persisted by the current backend response; unavailable values remain N/A.</p>
    </SectionCard>
  );
}

function PredictionsPanel({ rows, loading, error, onRetry }: { rows: PredictionHistoryItem[]; loading: boolean; error?: string; onRetry: () => void }) {
  return (
    <SectionCard title="Recent predictions" eyebrow="Inference activity">
      <SectionState loading={loading} error={error} onRetry={onRetry}>
        <DataTable columns={[
          { key: 'id', label: 'Prediction ID', render: (row) => formatNumber(row.id) },
          { key: 'request', label: 'Request ID', render: (row) => safeValue(row.request_id) },
          { key: 'version', label: 'Model version', render: (row) => safeValue(row.model_version) },
          { key: 'predicted', label: 'Predicted label', render: (row) => safeValue(row.prediction) },
          { key: 'class', label: 'Prediction class', render: (row) => formatNumber(row.prediction_class) },
          { key: 'confidence', label: 'Confidence', render: (row) => formatPercentage(row.confidence) },
          { key: 'latency', label: 'Inference latency (ms)', render: (row) => formatNumber(row.inference_latency_ms) },
          { key: 'actual', label: 'Actual label', render: (row) => safeValue(row.actual_label) },
          { key: 'timestamp', label: 'Timestamp', render: (row) => formatTimestamp(row.timestamp) },
        ]} rows={rows} emptyMessage="No predictions available" />
      </SectionState>
    </SectionCard>
  );
}

export function Dashboard() {
  const [metrics, setMetrics] = useState<MonitoringMetrics | null>(null);
  const [driftHistory, setDriftHistory] = useState<DriftScore[]>([]);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [models, setModels] = useState<ModelVersionRecord[]>([]);
  const [retrainingJobs, setRetrainingJobs] = useState<RetrainingJobRecord[]>([]);
  const [predictions, setPredictions] = useState<PredictionHistoryItem[]>([]);
  const [loading, setLoading] = useState<Record<DashboardSection, boolean>>({ metrics: true, drift: true, alerts: true, models: true, retraining: true, predictions: true });
  const [errors, setErrors] = useState<SectionErrors>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSuccessfulRefresh, setLastSuccessfulRefresh] = useState<string | null>(null);
  const refreshInFlight = useRef(false);
  const mounted = useRef(false);

  const refreshIntervalMs = getDashboardRefreshIntervalMs();
  const loadDashboard = useCallback(async (initialLoad = false) => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    if (initialLoad) {
      setLoading({ metrics: true, drift: true, alerts: true, models: true, retraining: true, predictions: true });
    } else {
      setIsRefreshing(true);
    }

    try {
      const results = await Promise.allSettled([
        apiClient.getMetrics(),
        apiClient.getDriftHistory({ limit: READ_LIMIT }),
        apiClient.getAlerts({ limit: READ_LIMIT }),
        apiClient.getModels(),
        apiClient.getRetrainingJobs(),
        apiClient.getPredictionHistory({ limit: READ_LIMIT }),
      ]);
      if (!mounted.current) return;

      const sections: DashboardSection[] = ['metrics', 'drift', 'alerts', 'models', 'retraining', 'predictions'];
      const nextErrors: SectionErrors = {};
      const nextLoading = { metrics: false, drift: false, alerts: false, models: false, retraining: false, predictions: false };
      results.forEach((result, index) => {
        if (result.status === 'rejected') nextErrors[sections[index]] = getErrorMessage(result.reason, sections[index]);
      });
      if (results[0].status === 'fulfilled') setMetrics(asMetrics(results[0].value));
      if (results[1].status === 'fulfilled') setDriftHistory(asArray<DriftScore>(results[1].value));
      if (results[2].status === 'fulfilled') setAlerts(asArray<AlertRecord>(results[2].value));
      if (results[3].status === 'fulfilled') setModels(asArray<ModelVersionRecord>(results[3].value));
      if (results[4].status === 'fulfilled') setRetrainingJobs(asArray<RetrainingJobRecord>(results[4].value));
      if (results[5].status === 'fulfilled') setPredictions(asArray<PredictionHistoryItem>(results[5].value));
      setErrors(nextErrors);
      setLoading(nextLoading);
      if (results.every((result) => result.status === 'fulfilled')) {
        setLastSuccessfulRefresh(new Date().toISOString());
      }
    } finally {
      refreshInFlight.current = false;
      if (mounted.current) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void loadDashboard(true);
    const interval = window.setInterval(() => {
      void loadDashboard(false);
    }, refreshIntervalMs);
    return () => {
      mounted.current = false;
      window.clearInterval(interval);
    };
  }, [loadDashboard, refreshIntervalMs]);

  const retry = () => { void loadDashboard(false); };
  const metricCards: MetricCardProps[] = [
    { label: 'Total Predictions', value: formatNumber(metrics?.total_prediction_count), note: 'Recorded predictions' },
    { label: 'Labeled Predictions', value: formatNumber(metrics?.labeled_prediction_count), note: 'Available for evaluation' },
    { label: 'Accuracy', value: formatPercentage(metrics?.accuracy), note: normalizeStatus(metrics?.metrics_status), tone: 'positive' },
    { label: 'Precision', value: formatPercentage(metrics?.precision), note: 'Attack classification', tone: 'positive' },
    { label: 'Recall', value: formatPercentage(metrics?.recall), note: 'Attack classification', tone: 'warning' },
    { label: 'F1 Score', value: formatPercentage(metrics?.f1), note: 'Balanced classification' },
  ];
  const activeModel = models.find((model) => model.is_active);
  const activeModelId = activeModel?.model_id || metrics?.model_id || null;
  const visibleDriftHistory = activeModelId ? driftHistory.filter((row) => row.model_id === activeModelId) : driftHistory;
  const visibleAlerts = activeModelId ? alerts.filter((row) => row.model_id === activeModelId) : alerts;
  const visiblePredictions = activeModelId ? predictions.filter((row) => row.model_id === activeModelId) : predictions;

  return (
    <div className="dashboard-page">
      <div className="dashboard-page-heading">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>ML Model Performance Monitoring Platform</h1>
          <p className="dashboard-intro">A focused view of model quality, drift, alerts, and operational history.</p>
        </div>
        <div className="dashboard-refresh-controls">
          <button className="btn btn-secondary dashboard-refresh" type="button" onClick={retry} disabled={Object.values(loading).some(Boolean) || isRefreshing}>
            {isRefreshing || Object.values(loading).some(Boolean) ? 'Refreshing...' : 'Refresh dashboard'}
          </button>
          <div className="dashboard-refresh-status" aria-live="polite">
            <span>Automatic refresh <strong>On · every {Math.round(refreshIntervalMs / 1000)}s</strong></span>
            <span>Last successful refresh <strong>{formatTimestamp(lastSuccessfulRefresh)}</strong></span>
          </div>
        </div>
      </div>

      {loading.metrics ? <div className="dashboard-loading-bar">Loading monitoring metrics...</div> : errors.metrics ? <div className="dashboard-section-error"><strong>Metrics unavailable.</strong><span>{errors.metrics}</span><button className="btn btn-secondary" type="button" onClick={retry}>Retry</button></div> : (
        <section className="dashboard-metrics-grid" aria-label="Model performance metrics">
          {metricCards.map((metric) => <MetricCard key={metric.label} {...metric} />)}
        </section>
      )}

      <div className="dashboard-primary-grid">
        <DriftPanel history={visibleDriftHistory} loading={loading.drift} error={errors.drift} onRetry={retry} />
        <SectionCard title="Current model" eyebrow="Serving metadata" className="model-summary-section">
          <SectionState loading={loading.models} error={errors.models} onRetry={retry}>
            <div className="model-summary-list">
              <div><span>Model ID</span><strong>{activeModel?.model_id || metrics?.model_id || EMPTY_VALUE}</strong></div>
              <div><span>Model version</span><strong>{activeModel?.model_version || metrics?.model_version || EMPTY_VALUE}</strong></div>
              <div><span>Service status</span><StatusBadge tone={activeModel ? 'success' : 'neutral'}>{activeModel ? 'Active' : EMPTY_VALUE}</StatusBadge></div>
            </div>
          </SectionState>
        </SectionCard>
      </div>

      <div className="dashboard-section-stack">
        <AlertsPanel rows={visibleAlerts} loading={loading.alerts} error={errors.alerts} onRetry={retry} />
        <ModelsPanel rows={models} activeModel={activeModel} loading={loading.models} error={errors.models} onRetry={retry} />
        <RetrainingPanel rows={retrainingJobs} loading={loading.retraining} error={errors.retraining} onRetry={retry} />
        <PredictionsPanel rows={visiblePredictions} loading={loading.predictions} error={errors.predictions} onRetry={retry} />
      </div>
    </div>
  );
}
