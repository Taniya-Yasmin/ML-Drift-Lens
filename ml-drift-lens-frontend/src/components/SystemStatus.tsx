import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/apiClient';

interface SystemStatusData {
  healthStatus?: {
    status?: string;
    healthy?: boolean;
    message?: string;
    database_connected?: boolean;
  } | null;
  readinessStatus?: {
    ready?: boolean;
    model_loaded?: boolean;
    message?: string;
  } | null;
  modelInfo?: {
    model_version?: string;
    model_type?: string;
  } | null;
  error?: string;
}

export const SystemStatus: React.FC = () => {
  const [status, setStatus] = useState<SystemStatusData>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const [healthResult, readinessResult, modelInfo] = await Promise.all([
          apiClient.getHealth().catch(() => null),
          apiClient.getReadiness().catch(() => null),
          apiClient.getModelInfo().catch(() => null),
        ]);

        setStatus({ healthStatus: healthResult, readinessStatus: readinessResult, modelInfo });
      } catch (err) {
        setStatus({ error: err instanceof Error ? err.message : 'Failed to fetch status' });
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const isHealthy = status.healthStatus?.status === 'healthy' || status.healthStatus?.healthy === true;
  const databaseConnected = status.healthStatus?.database_connected;
  const isReady = status.readinessStatus?.ready ?? false;
  const modelLoaded = status.readinessStatus?.model_loaded ?? false;
  const lastCheck = new Date().toLocaleString();

  if (loading) {
    return <div className="loading-block">Checking system status...</div>;
  }

  return (
    <div className="panel-section">
      <div className="status-list compact">
        <div className="status-row"><span>Backend API</span><strong className={isHealthy ? 'status-success' : 'status-danger'}>{isHealthy ? 'Healthy' : 'Unavailable'}</strong></div>
        <div className="status-row"><span>FastAPI ML Service</span><strong className={isReady ? 'status-success' : 'status-danger'}>{isReady ? 'Ready' : 'Unavailable'}</strong></div>
        <div className="status-row"><span>XGBoost Model</span><strong className={modelLoaded ? 'status-success' : 'status-danger'}>{modelLoaded ? 'Loaded' : 'Unavailable'}</strong></div>
        <div className="status-row"><span>Database</span><strong className={databaseConnected ? 'status-success' : 'status-danger'}>{databaseConnected ? 'Connected' : 'Unavailable'}</strong></div>
      </div>

      <div className="detail-grid compact-grid">
        <div className="detail-item"><span>Inference routing</span><strong>Managed by backend</strong></div>
        <div className="detail-item"><span>Model Version</span><strong>{status.modelInfo?.model_version || 'N/A'}</strong></div>
        <div className="detail-item"><span>Model Algorithm</span><strong>{status.modelInfo?.model_type ? status.modelInfo.model_type.toUpperCase() : 'N/A'}</strong></div>
        <div className="detail-item"><span>Last health check</span><strong>{lastCheck}</strong></div>
      </div>

      {(status.healthStatus?.message || status.readinessStatus?.message || status.error) && (
        <div className="info-panel">
          {status.healthStatus?.message && <div>{status.healthStatus.message}</div>}
          {status.readinessStatus?.message && <div>{status.readinessStatus.message}</div>}
          {status.error && <div>{status.error}</div>}
        </div>
      )}
    </div>
  );
};
