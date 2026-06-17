import type { CandleBar } from "./types";

export type ChartInterval = "15m" | "1h" | "4h" | "1d";

export const CHART_INTERVALS: ChartInterval[] = ["15m", "1h", "4h", "1d"];

const BUCKET_SECONDS: Record<Exclude<ChartInterval, "1d">, number> = {
  "15m": 15 * 60,
  "1h": 60 * 60,
  "4h": 4 * 60 * 60,
};

/**
 * Frontend-only aggregation of 15m candles into coarser display intervals.
 * Detection always runs on 15m signals; this affects the chart display only.
 *
 * open = first open, high = max high, low = min low, close = last close,
 * volume = sum. 1h/4h bucket by fixed epoch windows; 1d groups by UTC day.
 */
export function aggregateCandles(
  base: CandleBar[],
  interval: ChartInterval,
): CandleBar[] {
  if (interval === "15m" || base.length === 0) return base;

  const bucketOf =
    interval === "1d"
      ? (timeSec: number) => {
          // UTC midnight epoch (seconds) for the candle's day.
          const d = new Date(timeSec * 1000);
          return Math.floor(
            Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) /
              1000,
          );
        }
      : (timeSec: number) => {
          const size = BUCKET_SECONDS[interval];
          return Math.floor(timeSec / size) * size;
        };

  const out: CandleBar[] = [];
  let current: CandleBar | null = null;
  let currentBucket: number | null = null;

  for (const c of base) {
    const bucket = bucketOf(c.time);
    if (current === null || bucket !== currentBucket) {
      if (current) out.push(current);
      current = {
        time: bucket,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      };
      currentBucket = bucket;
    } else {
      current.high = Math.max(current.high, c.high);
      current.low = Math.min(current.low, c.low);
      current.close = c.close;
      current.volume += c.volume;
    }
  }
  if (current) out.push(current);

  return out;
}
