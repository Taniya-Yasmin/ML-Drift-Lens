import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/apiClient';

interface ModelInfo {
  model_name?: string;
  model_version: string;
  preprocessing_version: string;
  model_type: string;
  dataset?: string;
  feature_count?: number;
  num_features: number;
  training_timestamp: string;
  validation_metrics?: Record<string, number | number[] | Record<string, number>>;
  test_metrics?: Record<string, number | number[] | Record<string, number>>;
  metrics?: Record<string, number | number[] | Record<string, number>>;
}

export const ModelInformation: React.FC = () => {
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchModelInfo = async () => {
      try {
        setLoading(true);
        const info = await apiClient.getModelInfo();
        setModelInfo(info);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load model info');
        setModelInfo(null);
      } finally {
        setLoading(false);
      }
    };

    fetchModelInfo();
  }, []);

  if (loading) {
    return <div className="loading-block">Loading model information...</div>;
  }

  if (error) {
    return (
      <div className="error-panel">
        <strong>Unable to load model information.</strong>
        <span>Please verify that the backend service is running.</span>
        <small>{error}</small>
      </div>
    );
  }

  if (!modelInfo) {
    return <div className="empty-panel"><strong>No model information available.</strong></div>;
  }

  const metricSource = modelInfo.metrics || modelInfo.test_metrics || modelInfo.validation_metrics || {};
  const confusionMatrix = Array.isArray(metricSource.confusion_matrix) &&
    metricSource.confusion_matrix.every((row) => Array.isArray(row))
    ? metricSource.confusion_matrix as number[][]
    : null;

  return (
    <div className="panel-section">
      <div className="detail-grid">
        <div className="detail-item"><span>Model Name</span><strong>{modelInfo.model_name || 'NID-XGBoost'}</strong></div>
        <div className="detail-item"><span>Algorithm</span><strong>{modelInfo.model_type ? modelInfo.model_type.toUpperCase() : 'N/A'}</strong></div>
        <div className="detail-item"><span>Model Version</span><strong>{modelInfo.model_version || 'N/A'}</strong></div>
        <div className="detail-item"><span>Dataset</span><strong>{modelInfo.dataset || 'NSL-KDD'}</strong></div>
        <div className="detail-item"><span>Feature Count</span><strong>{modelInfo.feature_count ?? modelInfo.num_features ?? 'N/A'}</strong></div>
        <div className="detail-item"><span>Model Status</span><strong>Loaded</strong></div>
        <div className="detail-item"><span>Artifact Status</span><strong>Available</strong></div>
        <div className="detail-item"><span>MLflow</span><strong>{modelInfo.model_version ? 'Tracked' : 'N/A'}</strong></div>
      </div>

      {Object.keys(metricSource).length > 0 && (
        <div className="chart-list metrics-list">
          {Object.entries(metricSource).map(([key, value]) => {
            if (key === 'confusion_matrix') return null;

            const numericValue = typeof value === 'number' ? value : Number(value ?? 0);
            const displayValue = typeof value === 'number'
              ? `${(value * 100).toFixed(1)}%`
              : (key === 'roc_auc' ? `${(numericValue * 100).toFixed(1)}%` : String(value));

            return (
              <div key={key} className="chart-row">
                <div className="chart-row-label">
                  <span>{key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())}</span>
                  <strong>{displayValue}</strong>
                </div>
                <div className="chart-track"><span style={{ width: `${Math.min(100, (numericValue || 0) * 100)}%` }} /></div>
              </div>
            );
          })}
        </div>
      )}

      {confusionMatrix && (
        <div className="chart-list metrics-list">
          <div className="chart-row">
            <div className="chart-row-label">
              <span>Confusion Matrix</span>
              <strong>{confusionMatrix.flat().join(', ')}</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
