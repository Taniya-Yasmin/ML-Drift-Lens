import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/apiClient';

interface PredictionResult {
  prediction: string;
  prediction_class: number;
  confidence: number;
  inference_latency_ms: number;
  model_version: string;
  request_id: string;
}

interface PredictionFormProps {
  modelId?: string;
  modelVersion?: string;
  preprocessingVersion?: string;
}

export const PredictionForm: React.FC<PredictionFormProps> = ({
  modelId,
  modelVersion,
  preprocessingVersion,
}) => {
  const [resolvedModel, setResolvedModel] = useState({ modelId, modelVersion, preprocessingVersion });
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (modelId && modelVersion && preprocessingVersion) return undefined;

    apiClient.getModelInfo()
      .then((info) => {
        if (cancelled) return;
        setResolvedModel({
          modelId: modelId || info.model_id || info.model_name,
          modelVersion: modelVersion || info.model_version,
          preprocessingVersion: preprocessingVersion || info.preprocessing_version,
        });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load active model metadata');
      });

    return () => { cancelled = true; };
  }, [modelId, modelVersion, preprocessingVersion]);

  const activeModelId = modelId || resolvedModel.modelId;
  const activeModelVersion = modelVersion || resolvedModel.modelVersion;
  const activePreprocessingVersion = preprocessingVersion || resolvedModel.preprocessingVersion;
  const canPredict = Boolean(activeModelId && activeModelVersion && activePreprocessingVersion);

  // Real KDDTest+ source row 6, with the ground-truth label excluded.
  const features = {
    duration: 0,
    protocol_type: 'tcp',
    service: 'http',
    flag: 'SF',
    src_bytes: 267,
    dst_bytes: 14515,
    land: 0,
    wrong_fragment: 0,
    urgent: 0,
    hot: 0,
    num_failed_logins: 0,
    logged_in: 1,
    num_compromised: 0,
    root_shell: 0,
    su_attempted: 0,
    num_root: 0,
    num_file_creations: 0,
    num_shells: 0,
    num_access_files: 0,
    num_outbound_cmds: 0,
    is_host_login: 0,
    is_guest_login: 0,
    count: 4,
    srv_count: 4,
    serror_rate: 0,
    srv_serror_rate: 0,
    rerror_rate: 0,
    srv_rerror_rate: 0,
    same_srv_rate: 1,
    diff_srv_rate: 0,
    srv_diff_host_rate: 0,
    dst_host_count: 155,
    dst_host_srv_count: 255,
    dst_host_same_srv_rate: 1,
    dst_host_diff_srv_rate: 0,
    dst_host_same_src_port_rate: 0.01,
    dst_host_srv_diff_host_rate: 0.03,
    dst_host_serror_rate: 0.01,
    dst_host_srv_serror_rate: 0,
    dst_host_rerror_rate: 0,
    dst_host_srv_rerror_rate: 0,
  };

  const handlePredict = async () => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      if (!activeModelId || !activeModelVersion || !activePreprocessingVersion) {
        setError('Active model metadata is not available');
        return;
      }

      const response = await apiClient.predict({
        model_id: activeModelId,
        model_version: activeModelVersion,
        preprocessing_version: activePreprocessingVersion,
        input_features: features,
      });

      setResult({
        prediction: response.prediction,
        prediction_class: response.prediction_class,
        confidence: response.confidence,
        inference_latency_ms: response.inference_latency_ms,
        model_version: response.model_version,
        request_id: response.request_id,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prediction failed');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h2>Network Intrusion Prediction</h2>

      <div className="prediction-section">
        <p className="description">
          Click "Predict" to submit a sample network connection record for analysis.
        </p>

        <button
          onClick={handlePredict}
          disabled={loading || !canPredict}
          className="btn btn-primary"
        >
          {loading ? 'Predicting...' : canPredict ? 'Predict' : 'Loading model...'}
        </button>

        {error && (
          <div className="error-box">
            <strong>Error:</strong> {error}
          </div>
        )}

        {result && (
          <div className="result-box">
            <div className="result-item">
              <label>Prediction</label>
              <span className={`prediction-badge prediction-${result.prediction.toLowerCase()}`}>
                {result.prediction.toUpperCase()}
              </span>
            </div>
            <div className="result-item">
              <label>Confidence</label>
              <span className="confidence-value">
                {(result.confidence * 100).toFixed(1)}%
              </span>
            </div>
            <div className="result-item">
              <label>Inference Latency</label>
              <span>{result.inference_latency_ms.toFixed(2)} ms</span>
            </div>
            <div className="result-item">
              <label>Model Version</label>
              <span>{result.model_version}</span>
            </div>
            <div className="result-item">
              <label>Request ID</label>
              <span className="request-id">{result.request_id}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
