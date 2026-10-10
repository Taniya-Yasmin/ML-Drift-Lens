/**
 * API Client for Network Intrusion Detection Backend
 * Communicates with Node.js backend at /api/*
 * 
 * In development, Vite proxy forwards /api to http://localhost:3000
 * In production, /api resolves to the same origin or configured backend URL
 */

// Use relative paths in development (benefits from Vite proxy)
// Use absolute URL only if explicitly configured
const API_BASE = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

interface PredictionRequest {
  model_id: string;
  model_version: string;
  preprocessing_version: string;
  input_features: Record<string, number | string>;
  request_id?: string;
}

interface PredictionResponse {
  success: boolean;
  prediction: string;
  prediction_class: number;
  confidence: number;
  inference_latency_ms: number;
  model_id: string;
  model_version: string;
  preprocessing_version: string;
  request_id: string;
  stored_id: number;
}

interface ModelInfo {
  model_id?: string;
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

interface HealthStatus {
  status?: string;
  message?: string;
  healthy?: boolean;
  database_connected?: boolean;
  ml_service_healthy?: boolean;
}

interface ReadinessStatus {
  ready: boolean;
  model_loaded: boolean;
  message: string;
}

export interface PredictionHistoryItem {
  id: number;
  model_id: string;
  model_version: string;
  preprocessing_version: string;
  input_features: string;
  prediction: string;
  prediction_class: number;
  confidence: number;
  inference_latency_ms?: number | null;
  request_id: string;
  timestamp: string;
  actual_label?: string;
}

export interface MonitoringMetrics {
  total_prediction_count: number;
  labeled_prediction_count: number;
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  metrics_status: string;
  model_id: string | null;
  model_version: string | null;
  latest_prediction_timestamp: string | null;
}

export interface DriftScore {
  id: number;
  model_id: string;
  metric_type: string;
  score: number;
  threshold: number;
  status: string;
  timestamp: string;
}

export interface AlertRecord {
  id: number;
  model_id: string;
  message: string;
  status: string;
  timestamp: string;
  drift_score_id: number;
}

export interface ModelVersionRecord {
  id: number;
  model_id: string;
  model_version: string;
  mlflow_run_id: string | null;
  timestamp: string;
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  is_active: boolean;
}

export interface RetrainingJobRecord {
  id: number;
  model_id: string;
  triggered_by: string;
  start_time: string;
  end_time: string | null;
  old_model_version: string | null;
  new_model_version: string | null;
  promoted: boolean;
  reload_status: string | null;
  candidate_f1?: number | null;
  incumbent_f1?: number | null;
  promotion_reason?: string | null;
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: ${response.statusText}`);
  }
  return response.json();
}

export const apiClient = {
  /**
   * Get model information
   */
  async getModelInfo(): Promise<ModelInfo> {
    const response = await fetch(`${API_BASE}/model-info`);
    if (!response.ok) {
      throw new Error(`Failed to fetch model info: ${response.statusText}`);
    }
    const data = await response.json();
    // Extract model from response wrapper
    return data.model || data;
  },

  /**
   * Check health status
   */
  async getHealth(): Promise<HealthStatus> {
    const response = await fetch(`${API_BASE}/health`);
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Check readiness status
   */
  async getReadiness(): Promise<ReadinessStatus> {
    const response = await fetch(`${API_BASE}/ready`);
    if (!response.ok) {
      throw new Error(`Readiness check failed: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Submit a prediction request
   */
  async predict(request: PredictionRequest): Promise<PredictionResponse> {
    const response = await fetch(`${API_BASE}/predictions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData.error || `Prediction failed: ${response.statusText}`;
      throw new Error(errorData.details ? `${errorMessage}: ${errorData.details}` : errorMessage);
    }

    return response.json();
  },

  /**
   * Get prediction history
   */
  async getPredictionHistory(options: PaginationOptions = {}): Promise<PredictionHistoryItem[]> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));
    const query = params.toString();
    return getJson<PredictionHistoryItem[]>(`/predictions${query ? `?${query}` : ''}`);
  },

  async getMetrics(): Promise<MonitoringMetrics> {
    return getJson<MonitoringMetrics>('/metrics');
  },

  async getLatestDrift(): Promise<DriftScore | null> {
    return getJson<DriftScore | null>('/drift');
  },

  async getDriftHistory(options: PaginationOptions = {}): Promise<DriftScore[]> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));
    const query = params.toString();
    return getJson<DriftScore[]>(`/drift/history${query ? `?${query}` : ''}`);
  },

  async getAlerts(options: PaginationOptions = {}): Promise<AlertRecord[]> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));
    const query = params.toString();
    return getJson<AlertRecord[]>(`/alerts${query ? `?${query}` : ''}`);
  },

  async getModels(): Promise<ModelVersionRecord[]> {
    return getJson<ModelVersionRecord[]>('/models');
  },

  async getRetrainingJobs(): Promise<RetrainingJobRecord[]> {
    return getJson<RetrainingJobRecord[]>('/retraining');
  },
};
