import assert from "node:assert/strict";
import test from "node:test";

import {
  ALLOWED_SYMBOLS,
  MARKET_INTERVAL,
  type MarketSymbol,
} from "../../config.ts";
import type { MarketCandle } from "../../types/market.ts";
import {
  FORBIDDEN_TRADING_ADVICE_TERMS,
  calculateScores,
  calculateSymbolFeatures,
  detectByteSirenSignals,
  detectRawMarketEvents,
  groupIncidentCandidates,
  isSymbolElevated,
  median,
  medianAbsoluteDeviation,
  robustZScore,
  scaledScore,
  type QueryHints,
  type RawMarketEvent,
  type SymbolFeature,
  type SymbolMoveDirection,
} from "./index.ts";

const baseTimeMs = Date.parse("2026-06-01T00:00:00.000Z");
const fifteenMinutesMs = 15 * 60 * 1000;

function isoAt(index: number): string {
  return new Date(baseTimeMs + index * fifteenMinutesMs).toISOString();
}

function closeIsoAt(index: number): string {
  return new Date(
    baseTimeMs + (index + 1) * fifteenMinutesMs - 1,
  ).toISOString();
}

function candle(
  symbol: MarketSymbol,
  index: number,
  input: {
    open: number;
    high: number;
    low: number;
    close: number;
    quoteVolume?: number;
  },
): MarketCandle {
  return {
    symbol,
    interval: MARKET_INTERVAL,
    open_time: isoAt(index),
    close_time: closeIsoAt(index),
    open: input.open,
    high: input.high,
    low: input.low,
    close: input.close,
    volume: 100,
    quote_volume: input.quoteVolume ?? 1000,
    trade_count: 10,
  };
}

function fixtureCandles(
  symbol: MarketSymbol,
  spike: Partial<MarketCandle> = {},
): MarketCandle[] {
  const candles: MarketCandle[] = [];
  let price = 100;

  for (let index = 0; index < 97; index += 1) {
    const change = index % 2 === 0 ? 0.001 : -0.0008;
    const open = price;
    price *= 1 + change;
    candles.push(
      candle(symbol, index, {
        open,
        high: price * 1.003,
        low: price * 0.997,
        close: price,
        quoteVolume: 1000,
      }),
    );
  }

  const open = price;
  const close = spike.close ?? price * 1.02;
  candles.push({
    ...candle(symbol, 97, {
      open,
      high: Number(spike.high ?? Number(close) * 1.01),
      low: Number(spike.low ?? Number(close) * 0.99),
      close: Number(close),
      quoteVolume: Number(spike.quote_volume ?? 5000),
    }),
    ...spike,
  });

  return candles;
}

function makeFeature(
  symbol: MarketSymbol,
  timeIndex: number,
  input: {
    direction?: "up" | "down" | "flat";
    elevated?: boolean;
    severity?: number;
    changePct?: number;
    priceZ?: number;
    volumeRatio?: number;
    volatilityRatio?: number;
  } = {},
): SymbolFeature {
  const direction = input.direction ?? "flat";
  const changePct =
    input.changePct ?? (direction === "down" ? -1 : direction === "up" ? 1 : 0);
  const severity = input.severity ?? (input.elevated ? 70 : 0);

  return {
    symbol,
    interval: MARKET_INTERVAL,
    open_time: isoAt(timeIndex),
    close_time: closeIsoAt(timeIndex),
    close: 100,
    signal_window: "15m",
    baseline_window: "24h",
    baseline_ready: true,
    return_15m: Math.log(1 + changePct / 100),
    return_15m_pct: changePct,
    true_range_pct: 1,
    price_z:
      input.priceZ ?? (input.elevated ? (direction === "down" ? -4 : 4) : 0),
    volume_ratio: input.volumeRatio ?? (input.elevated ? 2.5 : 1),
    volatility_ratio: input.volatilityRatio ?? (input.elevated ? 2.5 : 1),
    scores: {
      price_score: severity,
      volume_score: severity,
      range_score: severity,
      severity_score: severity,
    },
    direction,
    is_elevated: input.elevated ?? false,
  };
}

function featuresAt(
  timeIndex: number,
  elevated: Partial<
    Record<MarketSymbol, { direction: "up" | "down"; severity: number }>
  >,
): Record<MarketSymbol, SymbolFeature> {
  const result = {} as Record<MarketSymbol, SymbolFeature>;

  for (const symbol of ALLOWED_SYMBOLS) {
    const config = elevated[symbol];
    result[symbol] = makeFeature(symbol, timeIndex, {
      direction: config?.direction ?? "flat",
      elevated: Boolean(config),
      severity: config?.severity ?? 0,
    });
  }

  return result;
}

function seriesFromRows(
  rows: Array<Record<MarketSymbol, SymbolFeature>>,
): Partial<Record<MarketSymbol, SymbolFeature[]>> {
  const bySymbol: Partial<Record<MarketSymbol, SymbolFeature[]>> = {};

  for (const symbol of ALLOWED_SYMBOLS) {
    bySymbol[symbol] = rows.map((row) => row[symbol]);
  }

  return bySymbol;
}

function rawEvent(input: {
  day: string;
  timeIndex: number;
  direction: "observed_up" | "observed_down";
  severity?: number;
  breadth?: number;
}): RawMarketEvent {
  const symbols = ALLOWED_SYMBOLS.slice(0, input.breadth ?? 3);
  const evidence = ALLOWED_SYMBOLS.map((symbol) => {
    const included = symbols.includes(symbol);
    const direction: SymbolMoveDirection = included
      ? input.direction === "observed_up"
        ? "up"
        : "down"
      : "flat";

    return {
      symbol,
      included_in_event: included,
      direction,
      signal_window: "15m" as const,
      baseline_window: "24h" as const,
      change_15m_pct: symbols.includes(symbol)
        ? input.direction === "observed_up"
          ? 1
          : -1
        : 0,
      price_z: symbols.includes(symbol) ? 4 : 0,
      volume_ratio: symbols.includes(symbol) ? 3 : 1,
      volatility_ratio: symbols.includes(symbol) ? 3 : 1,
      severity_score: included ? (input.severity ?? 70) : 0,
    };
  });
  const detectedAt = `${input.day}T${String(Math.floor(input.timeIndex / 4)).padStart(2, "0")}:${String((input.timeIndex % 4) * 15).padStart(2, "0")}:00.000Z`;

  return {
    id: `raw_${input.day}_${input.timeIndex}_${input.direction}`,
    scope: "market_wide",
    detected_at: detectedAt,
    close_time: detectedAt,
    signal_window: "15m",
    baseline_window: "24h",
    direction: input.direction,
    symbols,
    breadth_count: symbols.length,
    avg_15m_change_pct: input.direction === "observed_up" ? 1 : -1,
    headline_severity: input.severity ?? 70,
    max_elevated_severity: input.severity ?? 70,
    peak_symbol: symbols[0],
    tier: (input.severity ?? 70) >= 75 ? "severe" : "elevated",
    symbol_evidence: evidence,
    persistence: {
      waived: true,
      consecutive_bars: 1,
      confirm_reason: "breadth>=4",
    },
    query_hints: {
      route:
        input.direction === "observed_up"
          ? "market_wide_up"
          : "market_wide_down",
      date_bound_query_required: true,
      second_search_allowed: false,
      no_trading_advice: true,
    },
  };
}

test("median handles odd and even arrays", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
});

test("MAD and robust z-score handle zero MAD safely", () => {
  assert.equal(medianAbsoluteDeviation([1, 1, 1]), 0);
  assert.equal(robustZScore(10, [1, 1, 1]), 0);
  assert.ok(robustZScore(10, [1, 2, 3, 4, 5]) > 1);
});

test("score scaling floors and caps correctly", () => {
  assert.equal(scaledScore(3, 3, 8), 0);
  assert.equal(scaledScore(8, 3, 8), 100);
  assert.equal(scaledScore(5.5, 3, 8), 50);
  assert.equal(
    calculateScores({ price_z: 8, volume_ratio: 6, volatility_ratio: 6 })
      .severity_score,
    100,
  );
});

test("features require the full 96-bar baseline and exclude the current candle", () => {
  const insufficient = calculateSymbolFeatures(
    fixtureCandles("BTCUSDT").slice(0, 96),
  );
  assert.equal(insufficient.at(-1)?.baseline_ready, false);
  assert.equal(insufficient.at(-1)?.is_elevated, false);

  const features = calculateSymbolFeatures(fixtureCandles("BTCUSDT"));
  const latest = features.at(-1);
  assert.ok(latest);
  assert.equal(latest.baseline_ready, true);
  assert.ok((latest.return_15m_pct ?? 0) > 1);
  assert.ok((latest.true_range_pct ?? 0) > 0);
  assert.ok((latest.volume_ratio ?? 0) >= 4.9);
  assert.equal(latest.is_elevated, true);
});

test("symbol elevation requires price floor and one confirming dimension", () => {
  assert.equal(
    isSymbolElevated({
      price_z: 0.5,
      return_15m_pct: 0.06,
      volume_ratio: 8,
      volatility_ratio: 5,
    }),
    false,
  );
  assert.equal(
    isSymbolElevated({
      price_z: 4,
      return_15m_pct: 1.2,
      volume_ratio: 1,
      volatility_ratio: 1,
    }),
    false,
  );
  assert.equal(
    isSymbolElevated({
      price_z: 8,
      return_15m_pct: 0.2,
      volume_ratio: 4,
      volatility_ratio: 4,
    }),
    false,
  );
  assert.equal(
    isSymbolElevated({
      price_z: 4,
      return_15m_pct: 1.2,
      volume_ratio: 2.1,
      volatility_ratio: 1,
    }),
    true,
  );
  assert.equal(
    isSymbolElevated({
      price_z: -4,
      return_15m_pct: -1.2,
      volume_ratio: 1,
      volatility_ratio: 2.1,
    }),
    true,
  );
});

test("market detection confirms 3 of 5 same-direction events after persistence", () => {
  const rows = [
    featuresAt(1, {
      BTCUSDT: { direction: "up", severity: 60 },
      ETHUSDT: { direction: "up", severity: 60 },
      SOLUSDT: { direction: "up", severity: 60 },
    }),
    featuresAt(2, {
      BTCUSDT: { direction: "up", severity: 60 },
      ETHUSDT: { direction: "up", severity: 60 },
      SOLUSDT: { direction: "up", severity: 60 },
    }),
  ];
  const result = detectRawMarketEvents(seriesFromRows(rows));

  assert.equal(result.suppressed_events.length, 1);
  assert.equal(
    result.suppressed_events[0].suppression_reason,
    "market_elevated_not_persisted",
  );
  assert.equal(result.raw_events.length, 1);
  assert.equal(result.raw_events[0].breadth_count, 3);
  assert.equal(
    result.raw_events[0].persistence.confirm_reason,
    "consecutive_bars>=2",
  );
});

test("market detection suppresses mixed direction", () => {
  const rows = [
    featuresAt(1, {
      BTCUSDT: { direction: "up", severity: 70 },
      ETHUSDT: { direction: "up", severity: 70 },
      SOLUSDT: { direction: "down", severity: 70 },
    }),
  ];
  const result = detectRawMarketEvents(seriesFromRows(rows));

  assert.equal(result.raw_events.length, 0);
  assert.equal(result.suppressed_events.length, 1);
  assert.equal(
    result.suppressed_events[0].suppression_reason,
    "mixed_direction_same_candle",
  );
});

test("market detection represents insufficient baseline and single-symbol suppression", () => {
  const insufficientRows = [
    Object.fromEntries(
      Object.entries(featuresAt(1, {})).map(([symbol, feature]) => [
        symbol,
        {
          ...feature,
          baseline_ready: false,
        },
      ]),
    ) as Record<MarketSymbol, SymbolFeature>,
  ];
  const insufficientResult = detectRawMarketEvents(
    seriesFromRows(insufficientRows),
  );

  assert.equal(insufficientResult.raw_events.length, 0);
  assert.equal(
    insufficientResult.suppressed_events[0].suppression_reason,
    "insufficient_baseline",
  );

  const singleSymbolResult = detectRawMarketEvents(
    seriesFromRows([
      featuresAt(1, {
        BTCUSDT: { direction: "up", severity: 90 },
      }),
    ]),
  );

  assert.equal(singleSymbolResult.raw_events.length, 0);
  assert.equal(
    singleSymbolResult.suppressed_events[0].suppression_reason,
    "single_symbol_public_mvp_suppressed",
  );
});

test("market detection waives persistence for v2.2 paths", () => {
  const breadthWaiver = detectRawMarketEvents(
    seriesFromRows([
      featuresAt(1, {
        BTCUSDT: { direction: "down", severity: 60 },
        ETHUSDT: { direction: "down", severity: 60 },
        BNBUSDT: { direction: "down", severity: 60 },
        SOLUSDT: { direction: "down", severity: 60 },
      }),
    ]),
  );
  assert.equal(
    breadthWaiver.raw_events[0].persistence.confirm_reason,
    "breadth>=4",
  );

  const avgSeverityWaiver = detectRawMarketEvents(
    seriesFromRows([
      featuresAt(1, {
        BTCUSDT: { direction: "up", severity: 80 },
        ETHUSDT: { direction: "up", severity: 80 },
        SOLUSDT: { direction: "up", severity: 80 },
      }),
    ]),
  );
  assert.equal(
    avgSeverityWaiver.raw_events[0].persistence.confirm_reason,
    "avg_severity>=80",
  );

  const maxSeverityWaiver = detectRawMarketEvents(
    seriesFromRows([
      featuresAt(1, {
        BTCUSDT: { direction: "up", severity: 85 },
        ETHUSDT: { direction: "up", severity: 60 },
        SOLUSDT: { direction: "up", severity: 60 },
      }),
    ]),
  );
  assert.equal(
    maxSeverityWaiver.raw_events[0].persistence.confirm_reason,
    "breadth>=3+max_severity>=85",
  );
});

test("raw events include evidence for all five symbols and average headline severity", () => {
  const result = detectRawMarketEvents(
    seriesFromRows([
      featuresAt(1, {
        BTCUSDT: { direction: "up", severity: 80 },
        ETHUSDT: { direction: "up", severity: 100 },
        SOLUSDT: { direction: "up", severity: 60 },
      }),
    ]),
  );
  const event = result.raw_events[0];

  assert.equal(event.symbol_evidence.length, 5);
  assert.equal(event.headline_severity, 80);
  assert.equal(event.max_elevated_severity, 100);
  assert.equal(event.peak_symbol, "ETHUSDT");
});

test("grouping creates market day, merges same direction, and preserves sub-events", () => {
  const grouped = groupIncidentCandidates([
    rawEvent({
      day: "2026-05-23",
      timeIndex: 32,
      direction: "observed_down",
      severity: 90,
      breadth: 5,
    }),
    rawEvent({
      day: "2026-05-23",
      timeIndex: 82,
      direction: "observed_up",
      severity: 95,
      breadth: 5,
    }),
    rawEvent({
      day: "2026-05-24",
      timeIndex: 10,
      direction: "observed_up",
      severity: 80,
      breadth: 4,
    }),
    rawEvent({
      day: "2026-05-24",
      timeIndex: 20,
      direction: "observed_up",
      severity: 85,
      breadth: 4,
    }),
    rawEvent({
      day: "2026-05-25",
      timeIndex: 20,
      direction: "observed_up",
      severity: 85,
      breadth: 4,
    }),
  ]);

  assert.equal(grouped.length, 3);
  assert.equal(grouped[0].scope, "market_day");
  assert.equal(grouped[0].direction, "two_sided");
  assert.equal(grouped[0].sub_events.length, 2);
  assert.equal(grouped[1].scope, "market_wide");
  assert.equal(grouped[1].sub_events.length, 2);
  assert.equal(grouped[2].scope, "market_wide");
  assert.equal(grouped[2].sub_events.length, 1);
  assert.equal(grouped[0].symbol_evidence.length, 5);
  assert.equal(grouped[0].query_hints.second_search_allowed, true);
});

test("full detector combines feature calculation, raw detection, and grouping", () => {
  const candlesBySymbol = Object.fromEntries(
    ALLOWED_SYMBOLS.map((symbol) => [symbol, fixtureCandles(symbol)]),
  ) as Record<MarketSymbol, MarketCandle[]>;
  const result = detectByteSirenSignals({ candlesBySymbol });

  assert.ok(result.raw_events.length >= 1);
  assert.ok(result.candidates.length >= 1);
  assert.equal(result.candidates[0].symbol_evidence.length, 5);
});

test("query hints and exported labels do not contain trading-advice wording", () => {
  const hints: QueryHints[] = [
    {
      route: "market_wide_up",
      date_bound_query_required: true,
      second_search_allowed: false,
      no_trading_advice: true,
    },
    {
      route: "market_wide_down",
      date_bound_query_required: true,
      second_search_allowed: true,
      no_trading_advice: true,
    },
    {
      route: "two_sided_market_day",
      date_bound_query_required: true,
      second_search_allowed: true,
      no_trading_advice: true,
    },
  ];
  const serialized = JSON.stringify(hints).toLowerCase();

  for (const term of FORBIDDEN_TRADING_ADVICE_TERMS) {
    assert.equal(
      serialized.includes(term),
      false,
      `Unexpected forbidden term: ${term}`,
    );
  }
});
