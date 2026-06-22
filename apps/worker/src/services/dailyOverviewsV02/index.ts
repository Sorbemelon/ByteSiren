import {
  ALLOWED_SYMBOLS,
  BASELINE_BARS_24H,
  type MarketSymbol,
} from "../../config.ts";
import type { MarketCandle } from "../../types/market.ts";

export const DAILY_OVERVIEW_V02_GENERATOR = "daily_overview_v02_deterministic";
export const DAILY_OVERVIEW_V02_GENERATOR_VERSION =
  "daily_overview_v02_deterministic_v1";
export const DAILY_OVERVIEW_EXPECTED_15M_CANDLES = BASELINE_BARS_24H;
export const DAILY_OVERVIEW_MIN_COVERAGE_RATIO = 0.8;
export const DAILY_OVERVIEW_MIN_CANDLES_PER_SYMBOL = Math.ceil(
  DAILY_OVERVIEW_EXPECTED_15M_CANDLES * DAILY_OVERVIEW_MIN_COVERAGE_RATIO,
);

const TERMINAL_DAILY_CLAUDE_STATUSES = new Set([
  "brief_ready",
  "context_only",
  "no_major_driver",
  "claude_limited",
  "failed_terminal",
]);

export type DailyOverviewToneV02 =
  | "risk_on"
  | "risk_off"
  | "mixed"
  | "quiet"
  | "volatile"
  | "relief";

export interface DailyOverviewV02Input {
  id: string;
  date_utc: string;
  day_start: string;
  day_end: string;
  market_tone: DailyOverviewToneV02;
  daily_change_pct: number;
  daily_change_label: "24h Change";
  market_range_pct: number;
  notable_symbols_json: string;
  top_symbol_moves_json: string;
  signal_event_ids_json: string;
  market_story_ids_json: string;
  audit_event_count: number;
  daily_chart_context_summary_json: string;
  claude_status: string;
  claude_brief_id: string | null;
}

export interface DailyOverviewMarketStoryContextV02 {
  id: string;
  story_label: string;
}

export interface DailyOverviewGenerationInputV02 {
  candlesBySymbol: Record<MarketSymbol, MarketCandle[]>;
  now?: Date;
  includeIncompleteDays?: boolean;
  signalEventIdsByDate?: Map<string, string[]>;
  marketStoriesByDate?: Map<string, DailyOverviewMarketStoryContextV02[]>;
  auditEventCountsByDate?: Map<string, number>;
  existingClaudeStatusByDate?: Map<string, string | null>;
}

export interface DailyOverviewSkippedV02 {
  date_utc: string;
  reason:
    | "incomplete_current_utc_day"
    | "insufficient_coverage"
    | "missing_symbol_data";
  coverage_summary: Record<string, unknown>;
}

export interface DailyOverviewGenerationResultV02 {
  rows: DailyOverviewV02Input[];
  skipped: DailyOverviewSkippedV02[];
  summary: {
    generated_count: number;
    skipped_count: number;
    dates_generated: string[];
    dates_skipped: string[];
  };
}

interface SymbolDailyStatsV02 {
  symbol: MarketSymbol;
  change_pct: number;
  range_pct: number;
  volatility_score: number | null;
  peak_change_pct: number;
  volume_ratio: number | null;
  range_position: string;
  range_position_display: string;
  first_price: number;
  last_price: number;
  candle_count: number;
}

interface DailyStatsV02 {
  dateUtc: string;
  dailyChangePct: number;
  marketRangePct: number;
  dailyVolatilityScore: number | null;
  positiveSymbolCount: number;
  negativeSymbolCount: number;
  maxAbsSymbolChangePct: number;
  maxSymbolRangePct: number;
  symbolStats: SymbolDailyStatsV02[];
  coverageSummary: Record<string, unknown>;
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function dayRange(dateUtc: string): { dayStart: string; dayEnd: string } {
  return {
    dayStart: `${dateUtc}T00:00:00.000Z`,
    dayEnd: `${dateUtc}T23:59:59.999Z`,
  };
}

function candlesForDate(candles: MarketCandle[], dateUtc: string) {
  return candles
    .filter((candle) => candle.open_time.slice(0, 10) === dateUtc)
    .sort((a, b) => a.open_time.localeCompare(b.open_time));
}

function previousCandlesForDate(
  candles: MarketCandle[],
  dateUtc: string,
): MarketCandle[] {
  const dayStartMs = Date.parse(`${dateUtc}T00:00:00.000Z`);
  const previousStartMs =
    dayStartMs - DAILY_OVERVIEW_EXPECTED_15M_CANDLES * 15 * 60 * 1000;

  return candles
    .filter((candle) => {
      const openMs = Date.parse(candle.open_time);
      return openMs >= previousStartMs && openMs < dayStartMs;
    })
    .sort((a, b) => a.open_time.localeCompare(b.open_time));
}

function averageVolume(candles: MarketCandle[]): number | null {
  const volumes = candles
    .map((candle) => candle.volume)
    .filter((volume) => Number.isFinite(volume) && volume > 0);

  if (volumes.length === 0) {
    return null;
  }

  return volumes.reduce((sum, volume) => sum + volume, 0) / volumes.length;
}

function peakCandleChangePct(candles: MarketCandle[]): number {
  let peak = 0;

  for (const candle of candles) {
    if (candle.open <= 0) {
      continue;
    }

    const change = ((candle.close - candle.open) / candle.open) * 100;
    if (Math.abs(change) > Math.abs(peak)) {
      peak = change;
    }
  }

  return round4(peak);
}

function candleReturnPct(candle: MarketCandle): number | null {
  if (candle.open <= 0) {
    return null;
  }

  return ((candle.close - candle.open) / candle.open) * 100;
}

function volatilityScore(candles: MarketCandle[]): number | null {
  const returns = candles
    .map(candleReturnPct)
    .filter((value): value is number => value !== null);

  if (returns.length === 0) {
    return null;
  }

  const meanSquare =
    returns.reduce((sum, value) => sum + value ** 2, 0) / returns.length;
  return Math.round(Math.sqrt(meanSquare) * 100);
}

function rangePositionFromReference({
  close,
  referenceHigh,
  referenceLow,
}: {
  close: number;
  referenceHigh: number;
  referenceLow: number;
}): string {
  if (close > referenceHigh) {
    return "broke_high";
  }

  if (close < referenceLow) {
    return "broke_low";
  }

  const range = referenceHigh - referenceLow;
  if (range <= 0) {
    return "inside_range";
  }

  const position = (close - referenceLow) / range;
  if (position >= 0.8) {
    return "near_high";
  }
  if (position <= 0.2) {
    return "near_low";
  }
  return "inside_range";
}

function rangePositionDisplay(value: string): string {
  if (value === "near_high") return "Near high";
  if (value === "near_low") return "Near low";
  if (value === "broke_high") return "Broke high";
  if (value === "broke_low") return "Broke low";
  return "Inside range";
}

function coverageSummary(
  candlesBySymbol: Record<MarketSymbol, MarketCandle[]>,
  dateUtc: string,
): Record<string, unknown> {
  const bySymbol: Record<string, { count: number; coverage_ratio: number }> =
    {};

  for (const symbol of ALLOWED_SYMBOLS) {
    const count = candlesForDate(candlesBySymbol[symbol], dateUtc).length;
    bySymbol[symbol] = {
      count,
      coverage_ratio: round4(count / DAILY_OVERVIEW_EXPECTED_15M_CANDLES),
    };
  }

  return {
    expected_candles_per_symbol: DAILY_OVERVIEW_EXPECTED_15M_CANDLES,
    min_candles_per_symbol: DAILY_OVERVIEW_MIN_CANDLES_PER_SYMBOL,
    min_coverage_ratio: DAILY_OVERVIEW_MIN_COVERAGE_RATIO,
    by_symbol: bySymbol,
  };
}

function hasEnoughCoverage(
  candlesBySymbol: Record<MarketSymbol, MarketCandle[]>,
  dateUtc: string,
): boolean {
  return ALLOWED_SYMBOLS.every(
    (symbol) =>
      candlesForDate(candlesBySymbol[symbol], dateUtc).length >=
      DAILY_OVERVIEW_MIN_CANDLES_PER_SYMBOL,
  );
}

function computeDailyStats(
  candlesBySymbol: Record<MarketSymbol, MarketCandle[]>,
  dateUtc: string,
): DailyStatsV02 | null {
  const symbolStats: SymbolDailyStatsV02[] = [];
  const allCandles: MarketCandle[] = [];

  for (const symbol of ALLOWED_SYMBOLS) {
    const candles = candlesForDate(candlesBySymbol[symbol], dateUtc);

    if (candles.length < DAILY_OVERVIEW_MIN_CANDLES_PER_SYMBOL) {
      return null;
    }

    const first = candles[0];
    const last = candles.at(-1);

    if (!last || first.open <= 0) {
      return null;
    }

    const high = Math.max(...candles.map((candle) => candle.high));
    const low = Math.min(...candles.map((candle) => candle.low));
    const changePct = ((last.close - first.open) / first.open) * 100;
    const rangePct = ((high - low) / first.open) * 100;
    allCandles.push(...candles);
    const previousCandles = previousCandlesForDate(
      candlesBySymbol[symbol],
      dateUtc,
    );
    const previousHigh =
      previousCandles.length > 0
        ? Math.max(...previousCandles.map((candle) => candle.high))
        : high;
    const previousLow =
      previousCandles.length > 0
        ? Math.min(...previousCandles.map((candle) => candle.low))
        : low;
    const currentAverageVolume = averageVolume(candles);
    const previousAverageVolume = averageVolume(previousCandles);
    const volumeRatio =
      currentAverageVolume !== null &&
      previousAverageVolume !== null &&
      previousAverageVolume > 0
        ? round4(currentAverageVolume / previousAverageVolume)
        : null;
    const rangePosition = rangePositionFromReference({
      close: last.close,
      referenceHigh: previousHigh,
      referenceLow: previousLow,
    });

    symbolStats.push({
      symbol,
      change_pct: round4(changePct),
      range_pct: round4(rangePct),
      volatility_score: volatilityScore(candles),
      peak_change_pct: peakCandleChangePct(candles),
      volume_ratio: volumeRatio,
      range_position: rangePosition,
      range_position_display: rangePositionDisplay(rangePosition),
      first_price: first.open,
      last_price: last.close,
      candle_count: candles.length,
    });
  }

  const changes = symbolStats.map((stat) => stat.change_pct);
  const ranges = symbolStats.map((stat) => stat.range_pct);

  return {
    dateUtc,
    dailyChangePct: round4(median(changes)),
    marketRangePct: round4(median(ranges)),
    dailyVolatilityScore: volatilityScore(allCandles),
    positiveSymbolCount: symbolStats.filter((stat) => stat.change_pct > 0)
      .length,
    negativeSymbolCount: symbolStats.filter((stat) => stat.change_pct < 0)
      .length,
    maxAbsSymbolChangePct: round4(
      Math.max(...symbolStats.map((stat) => Math.abs(stat.change_pct))),
    ),
    maxSymbolRangePct: round4(Math.max(...ranges)),
    symbolStats,
    coverageSummary: coverageSummary(candlesBySymbol, dateUtc),
  };
}

function toneForDay(
  stats: DailyStatsV02,
  previousStats: DailyStatsV02 | null,
  storyLabels: string[],
): { tone: DailyOverviewToneV02; reasons: string[] } {
  const reasons: string[] = [];
  const absDailyChange = Math.abs(stats.dailyChangePct);
  const hasReversalStory = storyLabels.some((label) =>
    label.toLowerCase().includes("reversal"),
  );

  if (
    (stats.dailyChangePct >= 0.8 &&
      (previousStats?.dailyChangePct ?? 0) <= -1.5 &&
      stats.positiveSymbolCount >= 3) ||
    hasReversalStory
  ) {
    reasons.push("positive day after prior weakness or reversal story context");
    return { tone: "relief", reasons };
  }

  if (absDailyChange < 0.5 && stats.marketRangePct < 2) {
    reasons.push("low median change and low median range");
    return { tone: "quiet", reasons };
  }

  if (stats.dailyChangePct >= 1 && stats.positiveSymbolCount >= 3) {
    reasons.push("positive median change with broad positive breadth");
    return { tone: "risk_on", reasons };
  }

  if (stats.dailyChangePct <= -1 && stats.negativeSymbolCount >= 3) {
    reasons.push("negative median change with broad negative breadth");
    return { tone: "risk_off", reasons };
  }

  if (stats.marketRangePct >= 4) {
    reasons.push("wide median intraday range");
    return { tone: "volatile", reasons };
  }

  reasons.push("mixed or low-conviction day structure");
  return { tone: "mixed", reasons };
}

function topSymbolMoves(stats: DailyStatsV02) {
  return [...stats.symbolStats]
    .sort(
      (a, b) =>
        Math.abs(b.change_pct) - Math.abs(a.change_pct) ||
        a.symbol.localeCompare(b.symbol),
    )
    .map((stat) => ({
      symbol: stat.symbol,
      change_pct: stat.change_pct,
      range_pct: stat.range_pct,
      volatility_score_label: "Volatility Score",
      volatility_score: stat.volatility_score,
      peak_change_pct: stat.peak_change_pct,
      volume_ratio: stat.volume_ratio,
      range_position: stat.range_position,
      range_position_display: stat.range_position_display,
      first_price: stat.first_price,
      last_price: stat.last_price,
    }));
}

function notableSymbols(stats: DailyStatsV02) {
  return [...stats.symbolStats]
    .sort(
      (a, b) =>
        Math.max(Math.abs(b.change_pct), b.range_pct) -
          Math.max(Math.abs(a.change_pct), a.range_pct) ||
        a.symbol.localeCompare(b.symbol),
    )
    .slice(0, 3)
    .map((stat) => ({
      symbol: stat.symbol,
      change_pct: stat.change_pct,
      range_pct: stat.range_pct,
      reason:
        Math.abs(stat.change_pct) >= stat.range_pct / 2
          ? "largest_change"
          : "wide_range",
    }));
}

export function isTerminalDailyOverviewClaudeStatusV02(
  status: string | null | undefined,
): boolean {
  return status ? TERMINAL_DAILY_CLAUDE_STATUSES.has(status) : false;
}

export function candidateDailyOverviewDatesV02(
  candlesBySymbol: Record<MarketSymbol, MarketCandle[]>,
): string[] {
  const dates = new Set<string>();

  for (const symbol of ALLOWED_SYMBOLS) {
    for (const candle of candlesBySymbol[symbol]) {
      const dateUtc = candle.open_time.slice(0, 10);
      dates.add(dateUtc);
    }
  }

  return [...dates].sort();
}

export function generateDailyOverviewsV02({
  candlesBySymbol,
  now = new Date(),
  includeIncompleteDays = false,
  signalEventIdsByDate = new Map(),
  marketStoriesByDate = new Map(),
  auditEventCountsByDate = new Map(),
  existingClaudeStatusByDate = new Map(),
}: DailyOverviewGenerationInputV02): DailyOverviewGenerationResultV02 {
  const currentDateUtc = now.toISOString().slice(0, 10);
  const dates = candidateDailyOverviewDatesV02(candlesBySymbol);
  const rows: DailyOverviewV02Input[] = [];
  const skipped: DailyOverviewSkippedV02[] = [];
  const statsByDate = new Map<string, DailyStatsV02>();

  for (const dateUtc of dates) {
    if (!includeIncompleteDays && dateUtc >= currentDateUtc) {
      skipped.push({
        date_utc: dateUtc,
        reason: "incomplete_current_utc_day",
        coverage_summary: coverageSummary(candlesBySymbol, dateUtc),
      });
      continue;
    }

    if (!hasEnoughCoverage(candlesBySymbol, dateUtc)) {
      skipped.push({
        date_utc: dateUtc,
        reason: "insufficient_coverage",
        coverage_summary: coverageSummary(candlesBySymbol, dateUtc),
      });
      continue;
    }

    const stats = computeDailyStats(candlesBySymbol, dateUtc);

    if (!stats) {
      skipped.push({
        date_utc: dateUtc,
        reason: "missing_symbol_data",
        coverage_summary: coverageSummary(candlesBySymbol, dateUtc),
      });
      continue;
    }

    statsByDate.set(dateUtc, stats);
  }

  for (const dateUtc of dates) {
    const stats = statsByDate.get(dateUtc);

    if (!stats) {
      continue;
    }

    const previousDate = new Date(`${dateUtc}T00:00:00.000Z`);
    previousDate.setUTCDate(previousDate.getUTCDate() - 1);
    const previousStats =
      statsByDate.get(previousDate.toISOString().slice(0, 10)) ?? null;
    const marketStories = marketStoriesByDate.get(dateUtc) ?? [];
    const storyLabels = marketStories.map((story) => story.story_label);
    const { tone, reasons } = toneForDay(stats, previousStats, storyLabels);
    const signalEventIds = signalEventIdsByDate.get(dateUtc) ?? [];
    const marketStoryIds = marketStories.map((story) => story.id);
    const auditEventCount = auditEventCountsByDate.get(dateUtc) ?? 0;
    const existingStatus = existingClaudeStatusByDate.get(dateUtc);
    const { dayStart, dayEnd } = dayRange(dateUtc);
    const chartSummary = {
      daily_change_method: "median_symbol_open_to_last_close_pct",
      market_range_method: "median_symbol_high_low_range_pct",
      daily_volatility_score_method: "rms_15m_bar_open_close_returns_x100",
      daily_volatility_score: stats.dailyVolatilityScore,
      positive_symbol_count: stats.positiveSymbolCount,
      negative_symbol_count: stats.negativeSymbolCount,
      max_abs_symbol_change_pct: stats.maxAbsSymbolChangePct,
      max_symbol_range_pct: stats.maxSymbolRangePct,
      signal_event_count: signalEventIds.length,
      market_story_count: marketStoryIds.length,
      audit_event_count: auditEventCount,
      story_labels: storyLabels,
      tone_reasons: reasons,
      coverage_summary: stats.coverageSummary,
      generated_by: DAILY_OVERVIEW_V02_GENERATOR,
      generator_version: DAILY_OVERVIEW_V02_GENERATOR_VERSION,
    };

    rows.push({
      id: `daily_${dateUtc}`,
      date_utc: dateUtc,
      day_start: dayStart,
      day_end: dayEnd,
      market_tone: tone,
      daily_change_pct: stats.dailyChangePct,
      daily_change_label: "24h Change",
      market_range_pct: stats.marketRangePct,
      notable_symbols_json: JSON.stringify(notableSymbols(stats)),
      top_symbol_moves_json: JSON.stringify(topSymbolMoves(stats)),
      signal_event_ids_json: JSON.stringify(signalEventIds),
      market_story_ids_json: JSON.stringify(marketStoryIds),
      audit_event_count: auditEventCount,
      daily_chart_context_summary_json: JSON.stringify(chartSummary),
      claude_status: isTerminalDailyOverviewClaudeStatusV02(existingStatus)
        ? String(existingStatus)
        : "queued_for_analysis",
      claude_brief_id: null,
    });
  }

  return {
    rows,
    skipped,
    summary: {
      generated_count: rows.length,
      skipped_count: skipped.length,
      dates_generated: rows.map((row) => row.date_utc),
      dates_skipped: skipped.map((row) => row.date_utc),
    },
  };
}
