import {
  ALLOWED_SYMBOLS,
  BASELINE_BARS_24H,
  FIFTEEN_MINUTES_MS,
  MARKET_INTERVAL,
  type MarketSymbol,
} from "../../config.ts";
import type { MarketCandle } from "../../types/market.ts";

export type V02EventDirection = "observed_up" | "observed_down";
export type V02RangePosition =
  | "inside_range"
  | "near_high"
  | "near_low"
  | "broke_high"
  | "broke_low";

export interface SignalEventSymbolV02 {
  id: string;
  signal_event_id: string;
  symbol: MarketSymbol;
  window_change_pct: number | null;
  peak_15m_change_pct: number | null;
  volume_ratio: number | null;
  range_position: V02RangePosition | null;
  prev_24h_high: number | null;
  prev_24h_low: number | null;
  range_break_direction: "up" | "down" | "none";
  range_break_pct: number | null;
  range_break_strength: number | null;
  distance_to_range_high_pct: number | null;
  distance_to_range_low_pct: number | null;
  is_lead_mover: boolean;
  is_peak_15m_highlight: boolean;
  participated: boolean;
  evidence_json: string;
}

export interface SignalEventV02 {
  id: string;
  date_utc: string;
  event_start: string;
  event_end: string;
  duration_min: number;
  peak_time: string | null;
  direction: V02EventDirection;
  signals_count: number;
  n_tracked: number;
  avg_change_pct: number | null;
  avg_change_method: "median_participating_symbols";
  event_strength_score: number | null;
  impact_label: "Low" | "Medium" | "High";
  chart_context_score: number | null;
  chart_context_label:
    | "Weak chart context"
    | "Moderate chart context"
    | "Strong chart context"
    | "Range break"
    | "Inside-range impulse"
    | "Volatility expansion";
  event_story_type:
    | "range_break_up"
    | "range_break_down"
    | "inside_range_impulse_up"
    | "inside_range_impulse_down"
    | "volatility_expansion_up"
    | "volatility_expansion_down"
    | "weak_chart_context";
  trend_context: "trend_up" | "trend_down" | "trend_flat" | "trend_mixed";
  momentum_context:
    | "continuation"
    | "impulse"
    | "whipsaw"
    | "no_clear_momentum";
  volatility_context:
    | "volatility_expansion"
    | "ordinary_volatility"
    | "noisy_range_only";
  event_range_context:
    | "broad_broke_high"
    | "broad_broke_low"
    | "mixed_range_position"
    | "mostly_inside_range"
    | "weak_range_context";
  chart_context_reasons_json: string;
  chart_context_warnings_json: string;
  macro_aligned: boolean;
  nearest_macro_event: string | null;
  macro_delta_min: number | null;
  source_route_hint:
    | "broad_market"
    | "weak_route"
    | "no_clear_route"
    | "possible_relief_rally"
    | "possible_liquidation_context";
  publish_candidate: boolean;
  publish_reason: string | null;
  suppress_reason: string | null;
  detector_version: "v02";
  symbols: SignalEventSymbolV02[];
}

export interface AuditEventV02 {
  id: string;
  date_utc: string;
  event_start: string;
  event_end: string;
  duration_min: number;
  direction: V02EventDirection | "mixed";
  avg_change_pct: number | null;
  signals_count: number;
  n_tracked: number;
  event_strength_score: number | null;
  chart_context_score: number | null;
  chart_context_label: string | null;
  suppress_reason: string;
  why_suppressed: string;
  nearby_public_event_id: string | null;
  detector_version: "v02";
  evidence_json: string;
}

export interface DetectorV02Result {
  signal_events: SignalEventV02[];
  audit_events: AuditEventV02[];
  summary: {
    detector_version: "v02";
    signal_count: number;
    audit_count: number;
    publish_candidate_count: number;
    suppressed_count: number;
    counts_by_reason: Record<string, number>;
  };
}

interface PointSignal {
  time: string;
  direction: V02EventDirection | "mixed";
  kind: "signal" | "audit";
  reason: string;
  breadth: number;
  avgAbsChange: number;
}

interface WindowSignal {
  startTime: string;
  endTime: string;
  direction: V02EventDirection | "mixed";
  kind: "signal" | "audit";
  reason: string;
  peakBreadth: number;
  peakAvgAbsChange: number;
}

interface SymbolPointEvidence {
  symbol: MarketSymbol;
  change15mPct: number | null;
  volumeRatio: number | null;
  rangeRatio: number | null;
  direction: "up" | "down" | "flat";
  elevated: boolean;
}

const POINT_MIN_CHANGE_PCT = 0.45;
const POINT_FLASH_CHANGE_PCT = 0.8;
const POINT_MIN_VOLUME_RATIO = 1.2;
const POINT_MIN_RANGE_RATIO = 1.15;
const PUBLIC_MIN_CHART_CONTEXT_SCORE = 45;
const WINDOW_MERGE_GAP_BARS = 1;
const MAX_SIGNAL_WINDOW_BARS = 12;

function round(value: number | null | undefined, digits = 4): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Number(value!.toFixed(digits));
}

function median(values: Array<number | null | undefined>): number | null {
  const finite = values
    .filter((value): value is number => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (finite.length === 0) {
    return null;
  }

  const middle = Math.floor(finite.length / 2);
  return finite.length % 2 === 0
    ? (finite[middle - 1] + finite[middle]) / 2
    : finite[middle];
}

function average(values: Array<number | null | undefined>): number | null {
  const finite = values.filter((value): value is number =>
    Number.isFinite(value),
  );

  if (finite.length === 0) {
    return null;
  }

  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function pctChange(
  start: number | null | undefined,
  end: number,
): number | null {
  if (!start || !Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }

  return ((end - start) / start) * 100;
}

function dateUtc(iso: string): string {
  return iso.slice(0, 10);
}

function compactIso(iso: string): string {
  return iso.replace(/[-:.TZ]/g, "").slice(0, 12);
}

function eventId(prefix: "signal" | "audit", window: WindowSignal): string {
  return `bs_v02_${prefix}_${compactIso(window.startTime)}_${compactIso(
    window.endTime,
  )}_${window.direction}`;
}

function directionSign(direction: V02EventDirection): 1 | -1 {
  return direction === "observed_up" ? 1 : -1;
}

function toObservedDirection(direction: "up" | "down"): V02EventDirection {
  return direction === "up" ? "observed_up" : "observed_down";
}

function commonTimes(
  candlesBySymbol: Partial<Record<MarketSymbol, MarketCandle[]>>,
): string[] {
  const sets = ALLOWED_SYMBOLS.map(
    (symbol) =>
      new Set(
        (candlesBySymbol[symbol] ?? []).map((candle) => candle.open_time),
      ),
  );

  return [...sets[0]]
    .filter((time) => sets.every((set) => set.has(time)))
    .sort((a, b) => a.localeCompare(b));
}

function indexByTime(candles: MarketCandle[]): Map<string, number> {
  return new Map(candles.map((candle, index) => [candle.open_time, index]));
}

function priorCandles(
  candles: MarketCandle[],
  index: number,
  lookback: number,
) {
  return candles.slice(Math.max(0, index - lookback), index);
}

function candleRangePct(candle: MarketCandle, baseClose: number | null) {
  if (!baseClose || baseClose <= 0) {
    return null;
  }

  return ((candle.high - candle.low) / baseClose) * 100;
}

function pointEvidence(
  symbol: MarketSymbol,
  candles: MarketCandle[],
  index: number,
): SymbolPointEvidence {
  const candle = candles[index];
  const previous = candles[index - 1];
  const baseline = priorCandles(candles, index, BASELINE_BARS_24H);
  const change15mPct = pctChange(previous?.close, candle.close);
  const baselineVolume = median(baseline.map((item) => item.volume));
  const baselineRange = median(
    baseline.map((item, baselineIndex) =>
      candleRangePct(item, baseline[baselineIndex - 1]?.close ?? item.open),
    ),
  );
  const rangePct = candleRangePct(candle, previous?.close ?? candle.open);
  const volumeRatio =
    baselineVolume && baselineVolume > 0
      ? candle.volume / baselineVolume
      : null;
  const rangeRatio =
    baselineRange && baselineRange > 0 && rangePct !== null
      ? rangePct / baselineRange
      : null;
  const absChange = Math.abs(change15mPct ?? 0);
  const direction =
    absChange < 0.05 ? "flat" : change15mPct! > 0 ? "up" : "down";
  const elevated =
    absChange >= POINT_FLASH_CHANGE_PCT ||
    (absChange >= POINT_MIN_CHANGE_PCT &&
      ((volumeRatio ?? 0) >= POINT_MIN_VOLUME_RATIO ||
        (rangeRatio ?? 0) >= POINT_MIN_RANGE_RATIO));

  return {
    symbol,
    change15mPct: round(change15mPct),
    volumeRatio: round(volumeRatio, 3),
    rangeRatio: round(rangeRatio, 3),
    direction,
    elevated,
  };
}

function pointSignalsForTime(
  time: string,
  candlesBySymbol: Partial<Record<MarketSymbol, MarketCandle[]>>,
  indexBySymbol: Record<MarketSymbol, Map<string, number>>,
): PointSignal | null {
  const evidence = ALLOWED_SYMBOLS.map((symbol) => {
    const candles = candlesBySymbol[symbol] ?? [];
    const index = indexBySymbol[symbol].get(time);
    return index == null || index < BASELINE_BARS_24H
      ? null
      : pointEvidence(symbol, candles, index);
  }).filter((item): item is SymbolPointEvidence => item !== null);

  if (evidence.length !== ALLOWED_SYMBOLS.length) {
    return null;
  }

  const up = evidence.filter(
    (item) => item.elevated && item.direction === "up",
  );
  const down = evidence.filter(
    (item) => item.elevated && item.direction === "down",
  );
  const upAbs =
    average(up.map((item) => Math.abs(item.change15mPct ?? 0))) ?? 0;
  const downAbs =
    average(down.map((item) => Math.abs(item.change15mPct ?? 0))) ?? 0;

  if (up.length >= 3 || down.length >= 3) {
    const direction = up.length >= down.length ? "up" : "down";
    const breadth = Math.max(up.length, down.length);
    const avgAbsChange = direction === "up" ? upAbs : downAbs;

    return {
      time,
      direction: toObservedDirection(direction),
      kind: "signal",
      reason: "broad_same_direction_move",
      breadth,
      avgAbsChange,
    };
  }

  if (up.length + down.length >= 3 && up.length > 0 && down.length > 0) {
    return {
      time,
      direction: "mixed",
      kind: "audit",
      reason: "mixed_direction_breadth",
      breadth: up.length + down.length,
      avgAbsChange:
        average(evidence.map((item) => Math.abs(item.change15mPct ?? 0))) ?? 0,
    };
  }

  if (up.length >= 2 || down.length >= 2) {
    const direction = up.length >= down.length ? "up" : "down";

    return {
      time,
      direction: toObservedDirection(direction),
      kind: "audit",
      reason: "insufficient_public_breadth",
      breadth: Math.max(up.length, down.length),
      avgAbsChange: direction === "up" ? upAbs : downAbs,
    };
  }

  return null;
}

function minutesBetween(startIso: string, endIso: string): number {
  return Math.max(
    0,
    Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60000),
  );
}

function barsBetween(startIso: string, endIso: string): number {
  return Math.round(minutesBetween(startIso, endIso) / 15);
}

function buildWindows(points: PointSignal[]): WindowSignal[] {
  const windows: WindowSignal[] = [];
  let current: WindowSignal | null = null;

  for (const point of points) {
    if (!current) {
      current = {
        startTime: point.time,
        endTime: point.time,
        direction: point.direction,
        kind: point.kind,
        reason: point.reason,
        peakBreadth: point.breadth,
        peakAvgAbsChange: point.avgAbsChange,
      };
      continue;
    }

    const sameTrack =
      current.kind === point.kind && current.direction === point.direction;
    const gapBars = barsBetween(current.endTime, point.time);
    const spanBars = barsBetween(current.startTime, point.time) + 1;

    if (
      sameTrack &&
      gapBars <= WINDOW_MERGE_GAP_BARS + 1 &&
      (current.kind === "audit" || spanBars <= MAX_SIGNAL_WINDOW_BARS)
    ) {
      current.endTime = point.time;
      current.peakBreadth = Math.max(current.peakBreadth, point.breadth);
      current.peakAvgAbsChange = Math.max(
        current.peakAvgAbsChange,
        point.avgAbsChange,
      );
      continue;
    }

    windows.push(current);
    current = {
      startTime: point.time,
      endTime: point.time,
      direction: point.direction,
      kind: point.kind,
      reason: point.reason,
      peakBreadth: point.breadth,
      peakAvgAbsChange: point.avgAbsChange,
    };
  }

  if (current) {
    windows.push(current);
  }

  return windows;
}

function rangePosition(input: {
  direction: V02EventDirection;
  eventHigh: number;
  eventLow: number;
  eventClose: number;
  prevHigh: number | null;
  prevLow: number | null;
}): {
  position: V02RangePosition | null;
  breakDirection: "up" | "down" | "none";
  breakPct: number | null;
  breakStrength: number | null;
  distanceHighPct: number | null;
  distanceLowPct: number | null;
} {
  const { eventHigh, eventLow, eventClose, prevHigh, prevLow } = input;

  if (!prevHigh || !prevLow || prevHigh <= prevLow) {
    return {
      position: null,
      breakDirection: "none",
      breakPct: null,
      breakStrength: null,
      distanceHighPct: null,
      distanceLowPct: null,
    };
  }

  const range = prevHigh - prevLow;
  const distanceHighPct = ((prevHigh - eventClose) / prevHigh) * 100;
  const distanceLowPct = ((eventClose - prevLow) / prevLow) * 100;

  if (eventHigh > prevHigh) {
    const breakPct = ((eventHigh - prevHigh) / prevHigh) * 100;
    return {
      position: "broke_high",
      breakDirection: "up",
      breakPct: round(breakPct),
      breakStrength: round(
        breakPct / Math.max((range / prevHigh) * 100, 0.01),
        3,
      ),
      distanceHighPct: round(distanceHighPct),
      distanceLowPct: round(distanceLowPct),
    };
  }

  if (eventLow < prevLow) {
    const breakPct = ((prevLow - eventLow) / prevLow) * 100;
    return {
      position: "broke_low",
      breakDirection: "down",
      breakPct: round(breakPct),
      breakStrength: round(
        breakPct / Math.max((range / prevLow) * 100, 0.01),
        3,
      ),
      distanceHighPct: round(distanceHighPct),
      distanceLowPct: round(distanceLowPct),
    };
  }

  const normalized = (eventClose - prevLow) / range;
  const position =
    normalized >= 0.8
      ? "near_high"
      : normalized <= 0.2
        ? "near_low"
        : "inside_range";

  return {
    position,
    breakDirection: "none",
    breakPct: 0,
    breakStrength: 0,
    distanceHighPct: round(distanceHighPct),
    distanceLowPct: round(distanceLowPct),
  };
}

function eventCandles(
  candles: MarketCandle[],
  startIndex: number,
  endIndex: number,
) {
  return candles.slice(startIndex, endIndex + 1);
}

function trendContext(
  candlesBySymbol: Partial<Record<MarketSymbol, MarketCandle[]>>,
  indexBySymbol: Record<MarketSymbol, Map<string, number>>,
  startTime: string,
): SignalEventV02["trend_context"] {
  const moves = ALLOWED_SYMBOLS.map((symbol) => {
    const candles = candlesBySymbol[symbol] ?? [];
    const startIndex = indexBySymbol[symbol].get(startTime);
    if (startIndex == null || startIndex < 16) {
      return null;
    }

    return pctChange(
      candles[startIndex - 16].close,
      candles[startIndex - 1].close,
    );
  });
  const medianMove = median(moves);

  if (medianMove === null || Math.abs(medianMove) < 0.25) {
    return "trend_flat";
  }

  return medianMove > 0 ? "trend_up" : "trend_down";
}

function classifyEventStory(input: {
  direction: V02EventDirection;
  rangeContext: SignalEventV02["event_range_context"];
  volatilityContext: SignalEventV02["volatility_context"];
  chartScore: number;
}): {
  label: SignalEventV02["chart_context_label"];
  storyType: SignalEventV02["event_story_type"];
} {
  const suffix = input.direction === "observed_up" ? "up" : "down";

  if (
    input.rangeContext === "broad_broke_high" ||
    input.rangeContext === "broad_broke_low"
  ) {
    return {
      label: "Range break",
      storyType: `range_break_${suffix}`,
    };
  }

  if (input.volatilityContext === "volatility_expansion") {
    return {
      label: "Volatility expansion",
      storyType: `volatility_expansion_${suffix}`,
    };
  }

  if (input.chartScore >= 55) {
    return {
      label: "Inside-range impulse",
      storyType: `inside_range_impulse_${suffix}`,
    };
  }

  return {
    label:
      input.chartScore >= 45 ? "Moderate chart context" : "Weak chart context",
    storyType: "weak_chart_context",
  };
}

function signalEventFromWindow(
  window: WindowSignal,
  candlesBySymbol: Partial<Record<MarketSymbol, MarketCandle[]>>,
  indexBySymbol: Record<MarketSymbol, Map<string, number>>,
): SignalEventV02 | AuditEventV02 {
  const direction =
    window.direction === "mixed" ? "observed_up" : window.direction;
  const sign = directionSign(direction);
  const signalId = eventId("signal", { ...window, direction });
  const symbolRows: SignalEventSymbolV02[] = ALLOWED_SYMBOLS.map((symbol) => {
    const candles = candlesBySymbol[symbol] ?? [];
    const startIndex = indexBySymbol[symbol].get(window.startTime) ?? -1;
    const endIndex = indexBySymbol[symbol].get(window.endTime) ?? -1;
    const windowCandles =
      startIndex >= 0 && endIndex >= startIndex
        ? eventCandles(candles, startIndex, endIndex)
        : [];
    const baseClose =
      startIndex > 0 ? candles[startIndex - 1].close : windowCandles[0]?.open;
    const endClose = windowCandles.at(-1)?.close;
    const windowChangePct =
      endClose == null ? null : round(pctChange(baseClose, endClose));
    const prior = startIndex >= 0 ? priorCandles(candles, startIndex, 96) : [];
    const prev24hHigh =
      prior.length > 0 ? Math.max(...prior.map((candle) => candle.high)) : null;
    const prev24hLow =
      prior.length > 0 ? Math.min(...prior.map((candle) => candle.low)) : null;
    const eventHigh =
      windowCandles.length > 0
        ? Math.max(...windowCandles.map((candle) => candle.high))
        : 0;
    const eventLow =
      windowCandles.length > 0
        ? Math.min(...windowCandles.map((candle) => candle.low))
        : 0;
    const eventClose = endClose ?? 0;
    const range = rangePosition({
      direction,
      eventHigh,
      eventLow,
      eventClose,
      prevHigh: prev24hHigh,
      prevLow: prev24hLow,
    });
    const baselineVolume = median(prior.map((candle) => candle.volume));
    const volumeRatio =
      baselineVolume && baselineVolume > 0
        ? round(
            Math.max(
              ...windowCandles.map((candle) => candle.volume / baselineVolume),
            ),
            3,
          )
        : null;
    const peak15m = round(
      windowCandles.reduce<number | null>((peak, candle) => {
        const index = candles.indexOf(candle);
        const previous = index > 0 ? candles[index - 1] : null;
        const change = pctChange(previous?.close, candle.close);
        if (change === null) {
          return peak;
        }

        return peak === null || Math.abs(change) > Math.abs(peak)
          ? change
          : peak;
      }, null),
    );
    const participated =
      windowChangePct !== null && windowChangePct * sign >= 0.2;

    return {
      id: `${signalId}_${symbol}`,
      signal_event_id: signalId,
      symbol,
      window_change_pct: windowChangePct,
      peak_15m_change_pct: peak15m,
      volume_ratio: volumeRatio,
      range_position: range.position,
      prev_24h_high: round(prev24hHigh),
      prev_24h_low: round(prev24hLow),
      range_break_direction: range.breakDirection,
      range_break_pct: range.breakPct,
      range_break_strength: range.breakStrength,
      distance_to_range_high_pct: range.distanceHighPct,
      distance_to_range_low_pct: range.distanceLowPct,
      is_lead_mover: false,
      is_peak_15m_highlight: false,
      participated,
      evidence_json: JSON.stringify({
        event_high: round(eventHigh),
        event_low: round(eventLow),
        event_close: round(eventClose),
        range_ratio_source: "prior_24h_pre_window",
      }),
    } satisfies SignalEventSymbolV02;
  });
  const participatingRows = symbolRows.filter((row) => row.participated);
  const avgChangePct = round(
    median(participatingRows.map((row) => row.window_change_pct)),
  );
  const lead = [...participatingRows].sort(
    (a, b) =>
      Math.abs(b.window_change_pct ?? 0) - Math.abs(a.window_change_pct ?? 0),
  )[0];
  const peak = [...symbolRows].sort(
    (a, b) =>
      Math.abs(b.peak_15m_change_pct ?? 0) -
      Math.abs(a.peak_15m_change_pct ?? 0),
  )[0];

  for (const row of symbolRows) {
    row.is_lead_mover = row.symbol === lead?.symbol;
    row.is_peak_15m_highlight = row.symbol === peak?.symbol;
  }

  const rangeBreakUp = symbolRows.filter(
    (row) => row.range_break_direction === "up",
  ).length;
  const rangeBreakDown = symbolRows.filter(
    (row) => row.range_break_direction === "down",
  ).length;
  const eventRangeContext: SignalEventV02["event_range_context"] =
    direction === "observed_up" && rangeBreakUp >= 3
      ? "broad_broke_high"
      : direction === "observed_down" && rangeBreakDown >= 3
        ? "broad_broke_low"
        : rangeBreakUp > 0 && rangeBreakDown > 0
          ? "mixed_range_position"
          : participatingRows.length >= 3
            ? "mostly_inside_range"
            : "weak_range_context";
  const trend = trendContext(candlesBySymbol, indexBySymbol, window.startTime);
  const medianVolumeRatio = median(
    participatingRows.map((row) => row.volume_ratio),
  );
  const medianPeakAbs =
    median(
      participatingRows.map((row) => Math.abs(row.peak_15m_change_pct ?? 0)),
    ) ?? 0;
  const volatilityContext: SignalEventV02["volatility_context"] =
    medianPeakAbs >= 0.7 && (medianVolumeRatio ?? 0) >= 1.2
      ? "volatility_expansion"
      : participatingRows.length < 3
        ? "noisy_range_only"
        : "ordinary_volatility";
  const directionConsistency =
    participatingRows.length / ALLOWED_SYMBOLS.length;
  const momentumContext: SignalEventV02["momentum_context"] =
    directionConsistency >= 0.8
      ? "impulse"
      : directionConsistency >= 0.6
        ? "continuation"
        : "no_clear_momentum";
  const chartScore = Math.min(
    100,
    participatingRows.length * 12 +
      Math.abs(avgChangePct ?? 0) * 18 +
      Math.max(rangeBreakUp, rangeBreakDown) * 8 +
      Math.min(medianVolumeRatio ?? 0, 3) * 6 +
      (volatilityContext === "volatility_expansion" ? 10 : 0),
  );
  const story = classifyEventStory({
    direction,
    rangeContext: eventRangeContext,
    volatilityContext,
    chartScore,
  });
  const reasons = [
    `${participatingRows.length}_of_${ALLOWED_SYMBOLS.length}_symbols_participated`,
    `avg_change_${avgChangePct ?? 0}`,
    eventRangeContext,
    volatilityContext,
  ];
  const warnings =
    chartScore < PUBLIC_MIN_CHART_CONTEXT_SCORE
      ? ["weak_chart_context_score"]
      : [];
  const impactLabel =
    chartScore >= 72 || Math.abs(avgChangePct ?? 0) >= 1.5
      ? "High"
      : chartScore >= 55
        ? "Medium"
        : "Low";
  const eventStrengthScore = round(
    Math.min(100, Math.abs(avgChangePct ?? 0) * 20 + window.peakBreadth * 12),
    2,
  );
  const publishCandidate =
    window.kind === "signal" &&
    participatingRows.length >= 3 &&
    chartScore >= PUBLIC_MIN_CHART_CONTEXT_SCORE &&
    Math.abs(avgChangePct ?? 0) >= 0.45;

  if (!publishCandidate) {
    return {
      id: eventId("audit", window),
      date_utc: dateUtc(window.startTime),
      event_start: window.startTime,
      event_end: window.endTime,
      duration_min: minutesBetween(window.startTime, window.endTime) + 15,
      direction: window.direction,
      avg_change_pct: avgChangePct,
      signals_count: participatingRows.length,
      n_tracked: ALLOWED_SYMBOLS.length,
      event_strength_score: eventStrengthScore,
      chart_context_score: round(chartScore, 2),
      chart_context_label: story.label,
      suppress_reason:
        window.kind === "audit" ? window.reason : "weak_public_gate_context",
      why_suppressed:
        window.kind === "audit"
          ? "Detected movement did not meet public Signal Event breadth or direction requirements."
          : "Detected movement did not meet the v0.2 public Signal Event chart-context gate.",
      nearby_public_event_id: null,
      detector_version: "v02",
      evidence_json: JSON.stringify({
        event_range_context: eventRangeContext,
        trend_context: trend,
        momentum_context: momentumContext,
        volatility_context: volatilityContext,
        symbol_evidence: symbolRows,
      }),
    };
  }

  return {
    id: signalId,
    date_utc: dateUtc(window.startTime),
    event_start: window.startTime,
    event_end: window.endTime,
    duration_min: minutesBetween(window.startTime, window.endTime) + 15,
    peak_time: window.endTime,
    direction,
    signals_count: participatingRows.length,
    n_tracked: ALLOWED_SYMBOLS.length,
    avg_change_pct: avgChangePct,
    avg_change_method: "median_participating_symbols",
    event_strength_score: eventStrengthScore,
    impact_label: impactLabel,
    chart_context_score: round(chartScore, 2),
    chart_context_label: story.label,
    event_story_type: story.storyType,
    trend_context: trend,
    momentum_context: momentumContext,
    volatility_context: volatilityContext,
    event_range_context: eventRangeContext,
    chart_context_reasons_json: JSON.stringify(reasons),
    chart_context_warnings_json: JSON.stringify(warnings),
    macro_aligned: false,
    nearest_macro_event: null,
    macro_delta_min: null,
    source_route_hint:
      eventRangeContext === "broad_broke_high" ||
      eventRangeContext === "broad_broke_low"
        ? "broad_market"
        : "no_clear_route",
    publish_candidate: true,
    publish_reason: "broad_same_direction_chart_context",
    suppress_reason: null,
    detector_version: "v02",
    symbols: symbolRows,
  };
}

export function detectSignalAndAuditEventsV02(input: {
  candlesBySymbol: Partial<Record<MarketSymbol, MarketCandle[]>>;
}): DetectorV02Result {
  const indexBySymbol = Object.fromEntries(
    ALLOWED_SYMBOLS.map((symbol) => [
      symbol,
      indexByTime(input.candlesBySymbol[symbol] ?? []),
    ]),
  ) as Record<MarketSymbol, Map<string, number>>;
  const times = commonTimes(input.candlesBySymbol);
  const points = times
    .map((time) =>
      pointSignalsForTime(time, input.candlesBySymbol, indexBySymbol),
    )
    .filter((point): point is PointSignal => point !== null);
  const windows = buildWindows(points);
  const signalEvents: SignalEventV02[] = [];
  const auditEvents: AuditEventV02[] = [];

  for (const window of windows) {
    const event = signalEventFromWindow(
      window,
      input.candlesBySymbol,
      indexBySymbol,
    );

    if ("symbols" in event) {
      signalEvents.push(event);
    } else {
      auditEvents.push(event);
    }
  }

  const countsByReason = auditEvents.reduce<Record<string, number>>(
    (counts, event) => {
      counts[event.suppress_reason] = (counts[event.suppress_reason] ?? 0) + 1;
      return counts;
    },
    {},
  );

  return {
    signal_events: signalEvents,
    audit_events: auditEvents,
    summary: {
      detector_version: "v02",
      signal_count: signalEvents.length,
      audit_count: auditEvents.length,
      publish_candidate_count: signalEvents.filter(
        (event) => event.publish_candidate,
      ).length,
      suppressed_count: auditEvents.length,
      counts_by_reason: countsByReason,
    },
  };
}

export const DETECTOR_V02_VERSION = "v02";
export const DETECTOR_V02_INTERVAL = MARKET_INTERVAL;
export const DETECTOR_V02_MIN_CANDLES = BASELINE_BARS_24H + 1;
export const DETECTOR_V02_BAR_MS = FIFTEEN_MINUTES_MS;
