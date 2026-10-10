import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '../services/apiClient';

// Mock fetch
global.fetch = vi.fn();

describe('API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch model info successfully', async () => {
    const mockData = {
      model_version: '0.1.0',
      preprocessing_version: '0.1.0',
      model_type: 'xgboost',
      num_features: 41,
      training_timestamp: '2025-01-01T00:00:00Z',
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });

    const result = await apiClient.getModelInfo();
    expect(result).toEqual(mockData);
  });

  it('should fetch health status', async () => {
    const mockData = {
      status: 'healthy',
      message: 'Service is running',
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });

    const result = await apiClient.getHealth();
    expect(result).toEqual(mockData);
  });

  it('should fetch readiness status', async () => {
    const mockData = {
      ready: true,
      model_loaded: true,
      message: 'Service is ready',
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });

    const result = await apiClient.getReadiness();
    expect(result).toEqual(mockData);
  });

  it('should make a prediction', async () => {
    const mockData = {
      success: true,
      prediction: 'normal',
      prediction_class: 0,
      confidence: 0.87,
      model_id: 'test-model',
      model_version: '0.1.0',
      preprocessing_version: '0.1.0',
      request_id: 'req-123',
      stored_id: 1,
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });

    const result = await apiClient.predict({
      model_id: 'test-model',
      model_version: '0.1.0',
      preprocessing_version: '0.1.0',
      input_features: { duration: 100 },
    });

    expect(result).toEqual(mockData);
  });

  it('should fetch prediction history', async () => {
    const mockData = [
      {
        id: 1,
        model_id: 'test',
        model_version: '0.1.0',
        preprocessing_version: '0.1.0',
        input_features: '{}',
        prediction: 'normal',
        prediction_class: 0,
        confidence: 0.85,
        request_id: 'req-1',
        timestamp: '2025-01-01T00:00:00Z',
      },
    ];

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });

    const result = await apiClient.getPredictionHistory();
    expect(result).toEqual(mockData);
  });

  it('should handle API errors', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      statusText: 'Not Found',
    });

    await expect(apiClient.getModelInfo()).rejects.toThrow();
  });

  it('should preserve backend prediction validation details', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      statusText: 'Bad Request',
      json: async () => ({
        error: 'Invalid prediction request',
        details: "Prediction failed: Unknown category for feature 'service': private",
      }),
    });

    await expect(apiClient.predict({
      model_id: 'test-model',
      model_version: '0.1.0',
      preprocessing_version: 'preprocessing-v1',
      input_features: { service: 'private' },
    })).rejects.toThrow("Invalid prediction request: Prediction failed: Unknown category for feature 'service': private");
  });
});
