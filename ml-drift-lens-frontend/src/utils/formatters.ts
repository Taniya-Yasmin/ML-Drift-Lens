export const SAFE_FALLBACK = 'N/A';

function toFiniteNumber(value: number | string | null | undefined) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }
  return null;
}

export function formatNumber(value: number | string | null | undefined) {
  const numericValue = toFiniteNumber(value);
  return numericValue === null
    ? SAFE_FALLBACK
    : numericValue.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function formatPercentage(value: number | string | null | undefined) {
  const numericValue = toFiniteNumber(value);
  return numericValue === null || numericValue < 0 || numericValue > 1
    ? SAFE_FALLBACK
    : `${(numericValue * 100).toFixed(1)}%`;
}

export function formatTimestamp(value: string | null | undefined) {
  if (!value) return SAFE_FALLBACK;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? SAFE_FALLBACK : date.toLocaleString();
}

export function safeValue(value: unknown) {
  if (typeof value === 'string') return value.trim() || SAFE_FALLBACK;
  return value === null || value === undefined ? SAFE_FALLBACK : String(value);
}

export function normalizeStatus(value: string | boolean | null | undefined) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return SAFE_FALLBACK;

  const labels: Record<string, string> = {
    active: 'Active',
    closed: 'Closed',
    drift: 'Drift detected',
    drifting: 'Drift detected',
    failed: 'Failed',
    insufficient_data: 'Insufficient data',
    normal: 'Normal',
    open: 'Open',
    pending: 'Pending',
    promoted: 'Promoted',
    resolved: 'Resolved',
    success: 'Successful',
    warning: 'Warning',
  };
  return labels[normalized] ?? normalized.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}