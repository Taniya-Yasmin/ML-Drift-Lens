import { describe, expect, it } from 'vitest';
import {
  formatNumber,
  formatPercentage,
  formatTimestamp,
  normalizeStatus,
  safeValue,
} from './formatters';

describe('dashboard formatters', () => {
  it('formats numbers and percentages while rejecting invalid values', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(null)).toBe('N/A');
    expect(formatNumber(Number.NaN)).toBe('N/A');
    expect(formatPercentage(0.875)).toBe('87.5%');
    expect(formatPercentage('invalid')).toBe('N/A');
    expect(formatPercentage(1.1)).toBe('N/A');
    expect(formatPercentage(-0.1)).toBe('N/A');
  });

  it('formats timestamps and safe fallback values', () => {
    expect(formatTimestamp('invalid timestamp')).toBe('N/A');
    expect(formatTimestamp(null)).toBe('N/A');
    expect(safeValue('  ')).toBe('N/A');
    expect(safeValue(undefined)).toBe('N/A');
  });

  it('normalizes status labels for readable badges', () => {
    expect(normalizeStatus('insufficient_data')).toBe('Insufficient data');
    expect(normalizeStatus('drift')).toBe('Drift detected');
    expect(normalizeStatus(null)).toBe('N/A');
  });
});