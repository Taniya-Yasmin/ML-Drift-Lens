import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PredictionForm } from './PredictionForm';
import { apiClient } from '../services/apiClient';

vi.mock('../services/apiClient', () => ({
  apiClient: {
    getModelInfo: vi.fn(),
    predict: vi.fn(),
  },
}));

describe('PredictionForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows backend validation details when a category is rejected', async () => {
    vi.mocked(apiClient.predict).mockRejectedValueOnce(
      new Error("Invalid prediction request: Prediction failed: Unknown category for feature 'service': private"),
    );

    render(
      <PredictionForm
        modelId="nsl-kdd-baseline"
        modelVersion="candidate-1"
        preprocessingVersion="preprocessing-v1"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Predict' }));

    await waitFor(() => {
      expect(screen.getByText(/Unknown category for feature 'service': private/)).toBeTruthy();
    });
    expect(screen.queryByText('Attack')).toBeNull();
  });
});