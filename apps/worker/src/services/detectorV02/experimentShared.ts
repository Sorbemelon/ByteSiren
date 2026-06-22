export const SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT"];
export const N_TRACKED = SYMBOLS.length;

export function roundNumber(value: number, digits = 4) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(value.toFixed(digits));
}

export function median(values: unknown[]) {
  const finite = values
    .filter((value): value is number => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (finite.length === 0) {
    return null;
  }

  const middle = Math.floor(finite.length / 2);
  return finite.length % 2 === 1
    ? finite[middle]
    : (finite[middle - 1] + finite[middle]) / 2;
}

export function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}

export function nearestMinutes(aIso: string, bIso: string) {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);

  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return null;
  }

  return Math.abs(a - b) / 60000;
}
