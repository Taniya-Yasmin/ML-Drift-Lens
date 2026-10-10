import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/apiClient';
import type { PredictionHistoryItem } from '../services/apiClient';

const PAGE_SIZE = 10;

export const PredictionHistory: React.FC = () => {
  const [predictions, setPredictions] = useState<PredictionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);

  const fetchPredictions = async () => {
    try {
      setLoading(true);
      const history = await apiClient.getPredictionHistory({
        limit: PAGE_SIZE + 1,
        offset: page * PAGE_SIZE,
      });
      setPredictions(history.slice(0, PAGE_SIZE));
      setHasNextPage(history.length > PAGE_SIZE);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load prediction history');
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPredictions();
  }, [page]);

  const refresh = () => {
    setPage(0);
  };

  return (
    <div className="panel-section">
      <div className="section-head action-head">
        <h3>Recent Predictions</h3>
        <button className="btn btn-secondary" onClick={refresh} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {loading && <div className="loading-block">Loading prediction history...</div>}

      {!loading && error && (
        <div className="error-panel">
          <strong>Unable to load prediction history.</strong>
          <span>Please verify that the backend service is running.</span>
          <small>{error}</small>
        </div>
      )}

      {!loading && !error && predictions.length === 0 && (
        <div className="empty-panel">
          <div className="empty-icon">◌</div>
          <strong>No predictions yet.</strong>
          <span>Run a prediction to see results here.</span>
        </div>
      )}

      {!loading && !error && predictions.length > 0 && (
        <>
          <div className="table-wrap">
            <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Prediction</th>
                <th>Confidence</th>
                <th>Inference Latency</th>
                <th>Model Version</th>
                <th>Request ID</th>
              </tr>
            </thead>
            <tbody>
              {predictions.map((pred) => (
                <tr key={pred.id}>
                  <td>{new Date(pred.timestamp).toLocaleString()}</td>
                  <td>
                    <span className={`status-badge ${pred.prediction.toLowerCase()}`}>
                      {pred.prediction.toUpperCase()}
                    </span>
                  </td>
                  <td>{(pred.confidence * 100).toFixed(2)}%</td>
                  <td>{pred.inference_latency_ms == null ? 'N/A' : `${pred.inference_latency_ms.toFixed(2)} ms`}</td>
                  <td>{pred.model_version || 'N/A'}</td>
                  <td className="request-id">{pred.request_id}</td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
          <div className="pagination-controls" aria-label="Prediction history pagination">
            <button className="btn btn-secondary" onClick={() => setPage((current) => current - 1)} disabled={loading || page === 0}>
              Previous
            </button>
            <span>Page {page + 1}</span>
            <button className="btn btn-secondary" onClick={() => setPage((current) => current + 1)} disabled={loading || !hasNextPage}>
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
};
