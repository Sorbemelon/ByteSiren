export function roundNumber(value: number, digits = 4): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(value.toFixed(digits));
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}

export function median(values: number[]): number | null {
  const finite = values
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (finite.length === 0) {
    return null;
  }

  const middle = Math.floor(finite.length / 2);

  if (finite.length % 2 === 1) {
    return finite[middle];
  }

  return (finite[middle - 1] + finite[middle]) / 2;
}

export function medianAbsoluteDeviation(values: number[]): number | null {
  const center = median(values);

  if (center === null) {
    return null;
  }

  return median(values.map((value) => Math.abs(value - center)));
}

export function robustZScore(value: number, baseline: number[]): number {
  const center = median(baseline);
  const mad = medianAbsoluteDeviation(baseline);

  if (center === null || mad === null || mad === 0 || !Number.isFinite(mad)) {
    return 0;
  }

  return 0.6745 * ((value - center) / mad);
}

export function average(values: number[]): number | null {
  const finite = values.filter((value) => Number.isFinite(value));

  if (finite.length === 0) {
    return null;
  }

  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}
