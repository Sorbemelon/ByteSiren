import { MARKET_INTERVAL, type MarketSymbol } from "../../config.ts";
import type { MarketCandle } from "../../types/market.ts";
import {
  BASELINE_BARS,
  BASELINE_WINDOW_LABEL,
  MIN_BASELINE_BARS,
  SIGNAL_WINDOW_LABEL,
  SYMBOL_PRICE_Z_MIN,
  SYMBOL_RANGE_RATIO_MIN,
  SYMBOL_RETURN_15M_PCT_MIN,
  SYMBOL_VOLUME_RATIO_MIN,
} from "./constants.ts";
import { average, median, robustZScore, roundNumber } from "./math.ts";
import { calculateScores } from "./scoring.ts";
import type { SymbolFeature, SymbolMoveDirection } from "./types.ts";

function directionFromReturn(return15m: number | null): SymbolMoveDirection {
  if (return15m === null || return15m === 0) {
    return "flat";
  }

  return return15m > 0 ? "up" : "down";
}

function trueRangePct(candle: MarketCandle): number | null {
  if (candle.close === 0 || !Number.isFinite(candle.close)) {
    return null;
  }

  return ((candle.high - candle.low) / candle.close) * 100;
}

export function isSymbolElevated(input: {
  price_z: number | null;
  return_15m_pct: number | null;
  volume_ratio: number | null;
  volatility_ratio: number | null;
}): boolean {
  const priceZ = Math.abs(input.price_z ?? 0);
  const returnPct = Math.abs(input.return_15m_pct ?? 0);
  const volumeRatio = input.volume_ratio ?? 0;
  const rangeRatio = input.volatility_ratio ?? 0;

  return (
    priceZ >= SYMBOL_PRICE_Z_MIN &&
    returnPct >= SYMBOL_RETURN_15M_PCT_MIN &&
    (volumeRatio >= SYMBOL_VOLUME_RATIO_MIN ||
      rangeRatio >= SYMBOL_RANGE_RATIO_MIN)
  );
}

function neutralFeature(
  candle: MarketCandle,
  baselineReady = false,
): SymbolFeature {
  const scores = calculateScores({
    price_z: null,
    volume_ratio: null,
    volatility_ratio: null,
  });

  return {
    symbol: candle.symbol,
    interval: MARKET_INTERVAL,
    open_time: candle.open_time,
    close_time: candle.close_time,
    close: candle.close,
    signal_window: SIGNAL_WINDOW_LABEL,
    baseline_window: BASELINE_WINDOW_LABEL,
    baseline_ready: baselineReady,
    return_15m: null,
    return_15m_pct: null,
    true_range_pct: trueRangePct(candle),
    price_z: null,
    volume_ratio: null,
    volatility_ratio: null,
    scores,
    direction: "flat",
    is_elevated: false,
  };
}

export function calculateSymbolFeatures(
  candles: MarketCandle[],
  options: { baselineBars?: number; minBaselineBars?: number } = {},
): SymbolFeature[] {
  const baselineBars = options.baselineBars ?? BASELINE_BARS;
  const minBaselineBars = options.minBaselineBars ?? MIN_BASELINE_BARS;
  const sorted = [...candles].sort(
    (a, b) => Date.parse(a.open_time) - Date.parse(b.open_time),
  );
  const returns = sorted.map((candle, index) => {
    if (index === 0) {
      return null;
    }

    const previous = sorted[index - 1];

    if (previous.close <= 0 || candle.close <= 0) {
      return null;
    }

    return Math.log(candle.close / previous.close);
  });
  const ranges = sorted.map(trueRangePct);

  return sorted.map((candle, index) => {
    if (index === 0) {
      return neutralFeature(candle);
    }

    const return15m = returns[index];

    if (return15m === null || !Number.isFinite(return15m)) {
      return neutralFeature(candle);
    }

    const baselineStart = Math.max(0, index - baselineBars);
    const baselineCandles = sorted.slice(baselineStart, index);

    if (baselineCandles.length < minBaselineBars) {
      return neutralFeature(candle, false);
    }

    const returnBaseline = returns
      .slice(baselineStart, index)
      .filter(
        (value): value is number => value !== null && Number.isFinite(value),
      );
    const volumeBaseline = baselineCandles
      .map((baselineCandle) => baselineCandle.quote_volume)
      .filter((value) => Number.isFinite(value) && value > 0);
    const rangeBaseline = ranges
      .slice(baselineStart, index)
      .filter(
        (value): value is number =>
          value !== null && Number.isFinite(value) && value > 0,
      );

    if (
      returnBaseline.length < minBaselineBars - 1 ||
      volumeBaseline.length < minBaselineBars ||
      rangeBaseline.length < minBaselineBars
    ) {
      return neutralFeature(candle, false);
    }

    const volumeMedian = median(volumeBaseline);
    const rangeMedian = median(rangeBaseline);
    const currentRange = trueRangePct(candle);
    const priceZ = robustZScore(return15m, returnBaseline);
    const volumeRatio =
      volumeMedian && volumeMedian > 0
        ? candle.quote_volume / volumeMedian
        : null;
    const volatilityRatio =
      rangeMedian && rangeMedian > 0 && currentRange !== null
        ? currentRange / rangeMedian
        : null;
    const returnPct = (Math.exp(return15m) - 1) * 100;
    const scores = calculateScores({
      price_z: priceZ,
      volume_ratio: volumeRatio,
      volatility_ratio: volatilityRatio,
    });

    return {
      symbol: candle.symbol,
      interval: MARKET_INTERVAL,
      open_time: candle.open_time,
      close_time: candle.close_time,
      close: candle.close,
      signal_window: SIGNAL_WINDOW_LABEL,
      baseline_window: BASELINE_WINDOW_LABEL,
      baseline_ready: true,
      return_15m: roundNumber(return15m, 8),
      return_15m_pct: roundNumber(returnPct, 4),
      true_range_pct:
        currentRange === null ? null : roundNumber(currentRange, 4),
      price_z: roundNumber(priceZ, 4),
      volume_ratio: volumeRatio === null ? null : roundNumber(volumeRatio, 4),
      volatility_ratio:
        volatilityRatio === null ? null : roundNumber(volatilityRatio, 4),
      scores,
      direction: directionFromReturn(return15m),
      is_elevated: isSymbolElevated({
        price_z: priceZ,
        return_15m_pct: returnPct,
        volume_ratio: volumeRatio,
        volatility_ratio: volatilityRatio,
      }),
    };
  });
}

export function calculateFeaturesBySymbol(
  candlesBySymbol: Partial<Record<MarketSymbol, MarketCandle[]>>,
): Partial<Record<MarketSymbol, SymbolFeature[]>> {
  const result: Partial<Record<MarketSymbol, SymbolFeature[]>> = {};

  for (const [symbol, candles] of Object.entries(candlesBySymbol) as Array<
    [MarketSymbol, MarketCandle[]]
  >) {
    result[symbol] = calculateSymbolFeatures(candles);
  }

  return result;
}

export function averageChangePct(features: SymbolFeature[]): number | null {
  return average(
    features
      .map((feature) => feature.return_15m_pct)
      .filter((value): value is number => value !== null),
  );
}
