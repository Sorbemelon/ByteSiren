import assert from "node:assert/strict";
import test from "node:test";

import { ALLOWED_SYMBOLS, type MarketSymbol } from "../../config.ts";
import type { MarketCandle } from "../../types/market.ts";
import {
  DAILY_OVERVIEW_MIN_CANDLES_PER_SYMBOL,
  generateDailyOverviewsV02,
} from "./index.ts";

const changesBySymbol: Record<MarketSymbol, number> = {
  BTCUSDT: 5,
  ETHUSDT: 4,
  BNBUSDT: 3,
  SOLUSDT: 2,
  XRPUSDT: 1,
};

function emptyCandlesBySymbol(): Record<MarketSymbol, MarketCandle[]> {
  const candlesBySymbol = {} as Record<MarketSymbol, MarketCandle[]>;

  for (const symbol of ALLOWED_SYMBOLS) {
    candlesBySymbol[symbol] = [];
  }

  return candlesBySymbol;
}

function dayCandles(
  dateUtc: string,
  changes: Record<MarketSymbol, number>,
  options: {
    count?: number;
    rangePct?: number;
    volumeMultiplier?: number;
  } = {},
): Record<MarketSymbol, MarketCandle[]> {
  const count = options.count ?? 96;
  const rangePct = options.rangePct ?? 6;
  const volumeMultiplier = options.volumeMultiplier ?? 1;
  const startMs = Date.parse(`${dateUtc}T00:00:00.000Z`);
  const candlesBySymbol = emptyCandlesBySymbol();

  for (const symbol of ALLOWED_SYMBOLS) {
    const changePct = changes[symbol];
    const finalClose = 100 * (1 + changePct / 100);
    const high = 100 * (1 + rangePct / 200);
    const low = 100 * (1 - rangePct / 200);

    candlesBySymbol[symbol] = Array.from({ length: count }, (_, index) => {
      const openTime = new Date(startMs + index * 15 * 60 * 1000);
      const closeTime = new Date(openTime.getTime() + 15 * 60 * 1000 - 1);
      const progress = count === 1 ? 1 : index / (count - 1);

      return {
        symbol,
        interval: "15m",
        open_time: openTime.toISOString(),
        close_time: closeTime.toISOString(),
        open: 100,
        high,
        low,
        close: 100 + (finalClose - 100) * progress,
        volume: (1000 + index) * volumeMultiplier,
        quote_volume: (100000 + index) * volumeMultiplier,
        trade_count: index,
      };
    });
  }

  return candlesBySymbol;
}

function mergeCandles(
  ...records: Array<Record<MarketSymbol, MarketCandle[]>>
): Record<MarketSymbol, MarketCandle[]> {
  const merged = emptyCandlesBySymbol();

  for (const record of records) {
    for (const symbol of ALLOWED_SYMBOLS) {
      merged[symbol].push(...record[symbol]);
    }
  }

  return merged;
}

test("Daily Overview generation creates one deterministic row for a complete UTC day", () => {
  const result = generateDailyOverviewsV02({
    candlesBySymbol: dayCandles("2026-06-19", changesBySymbol),
    now: new Date("2026-06-21T12:00:00.000Z"),
    signalEventIdsByDate: new Map([["2026-06-19", ["sig_late", "sig_early"]]]),
    marketStoriesByDate: new Map([
      [
        "2026-06-19",
        [{ id: "story_range", story_label: "Range break sequence" }],
      ],
    ]),
    auditEventCountsByDate: new Map([["2026-06-19", 2]]),
  });
  const row = result.rows[0];
  const topMoves = JSON.parse(row.top_symbol_moves_json) as Array<{
    symbol: string;
    change_pct: number;
  }>;
  const notable = JSON.parse(row.notable_symbols_json) as Array<{
    symbol: string;
    reason: string;
  }>;
  const summary = JSON.parse(row.daily_chart_context_summary_json) as Record<
    string,
    unknown
  >;

  assert.equal(result.summary.generated_count, 1);
  assert.equal(result.summary.skipped_count, 0);
  assert.equal(row.id, "daily_2026-06-19");
  assert.equal(row.day_start, "2026-06-19T00:00:00.000Z");
  assert.equal(row.day_end, "2026-06-19T23:59:59.999Z");
  assert.equal(row.daily_change_label, "24h Change");
  assert.equal(row.daily_change_pct, 3);
  assert.equal(row.market_range_pct, 6);
  assert.equal(row.market_tone, "risk_on");
  assert.deepEqual(JSON.parse(row.signal_event_ids_json), [
    "sig_late",
    "sig_early",
  ]);
  assert.deepEqual(JSON.parse(row.market_story_ids_json), ["story_range"]);
  assert.equal(row.audit_event_count, 2);
  assert.equal(row.claude_status, "queued_for_analysis");
  assert.equal(topMoves[0].symbol, "BTCUSDT");
  assert.equal(topMoves[0].change_pct, 5);
  assert.equal(notable.length, 3);
  assert.equal(summary.generated_by, "daily_overview_v02_deterministic");
  assert.equal(summary.signal_event_count, 2);
  assert.equal(summary.market_story_count, 1);
  assert.equal(summary.audit_event_count, 2);
  assert.equal(
    summary.daily_volatility_score_method,
    "rms_15m_bar_open_close_returns_x100",
  );
  assert.equal(typeof summary.daily_volatility_score, "number");
});

test("Daily Overview top symbol moves include peak, volume, and range position fields", () => {
  const result = generateDailyOverviewsV02({
    candlesBySymbol: mergeCandles(
      dayCandles("2026-06-18", changesBySymbol, {
        rangePct: 4,
        volumeMultiplier: 1,
      }),
      dayCandles("2026-06-19", changesBySymbol, {
        rangePct: 6,
        volumeMultiplier: 2,
      }),
    ),
    now: new Date("2026-06-21T12:00:00.000Z"),
  });
  const row = result.rows.find((entry) => entry.date_utc === "2026-06-19");
  assert.ok(row);
  const topMoves = JSON.parse(row.top_symbol_moves_json) as Array<{
    symbol: string;
    peak_change_pct: number;
    volatility_score_label: string;
    volatility_score: number | null;
    volume_ratio: number | null;
    range_position: string;
    range_position_display: string;
  }>;

  assert.equal(topMoves[0].symbol, "BTCUSDT");
  assert.equal(topMoves[0].peak_change_pct, 5);
  assert.equal(topMoves[0].volatility_score_label, "Volatility Score");
  assert.equal(Number.isInteger(topMoves[0].volatility_score), true);
  assert.ok((topMoves[0].volatility_score ?? 0) > 0);
  assert.equal(topMoves[0].volume_ratio, 2);
  assert.equal(topMoves[0].range_position, "broke_high");
  assert.equal(topMoves[0].range_position_display, "Broke high");
});

test("Daily Overview generation skips current and insufficient-coverage days", () => {
  const currentDay = dayCandles("2026-06-21", changesBySymbol);
  const thinDay = dayCandles("2026-06-20", changesBySymbol, {
    count: DAILY_OVERVIEW_MIN_CANDLES_PER_SYMBOL - 1,
  });
  const result = generateDailyOverviewsV02({
    candlesBySymbol: mergeCandles(currentDay, thinDay),
    now: new Date("2026-06-21T12:00:00.000Z"),
  });

  assert.equal(result.rows.length, 0);
  assert.deepEqual(result.skipped.map((skip) => skip.reason).sort(), [
    "incomplete_current_utc_day",
    "insufficient_coverage",
  ]);
});

test("Daily Overview tone classification is deterministic", () => {
  const quietChanges: Record<MarketSymbol, number> = {
    BTCUSDT: 0.1,
    ETHUSDT: -0.1,
    BNBUSDT: 0.2,
    SOLUSDT: -0.2,
    XRPUSDT: 0,
  };
  const downChanges: Record<MarketSymbol, number> = {
    BTCUSDT: -5,
    ETHUSDT: -4,
    BNBUSDT: -3,
    SOLUSDT: -2,
    XRPUSDT: -1,
  };
  const mixedWideChanges: Record<MarketSymbol, number> = {
    BTCUSDT: 0.2,
    ETHUSDT: -0.3,
    BNBUSDT: 0.1,
    SOLUSDT: -0.2,
    XRPUSDT: 0,
  };
  const reliefChanges: Record<MarketSymbol, number> = {
    BTCUSDT: 2,
    ETHUSDT: 1.8,
    BNBUSDT: 1.6,
    SOLUSDT: 1.4,
    XRPUSDT: 1.2,
  };
  const result = generateDailyOverviewsV02({
    candlesBySymbol: mergeCandles(
      dayCandles("2026-06-17", quietChanges, { rangePct: 1 }),
      dayCandles("2026-06-18", downChanges, { rangePct: 6 }),
      dayCandles("2026-06-19", reliefChanges, { rangePct: 5 }),
      dayCandles("2026-06-20", mixedWideChanges, { rangePct: 8 }),
    ),
    now: new Date("2026-06-21T12:00:00.000Z"),
  });
  const tonesByDate = new Map(
    result.rows.map((row) => [row.date_utc, row.market_tone]),
  );

  assert.equal(tonesByDate.get("2026-06-17"), "quiet");
  assert.equal(tonesByDate.get("2026-06-18"), "risk_off");
  assert.equal(tonesByDate.get("2026-06-19"), "relief");
  assert.equal(tonesByDate.get("2026-06-20"), "volatile");
});

test("Daily Overview generation preserves terminal Claude status on existing rows", () => {
  const result = generateDailyOverviewsV02({
    candlesBySymbol: dayCandles("2026-06-19", changesBySymbol),
    now: new Date("2026-06-21T12:00:00.000Z"),
    existingClaudeStatusByDate: new Map([["2026-06-19", "brief_ready"]]),
  });

  assert.equal(result.rows[0].claude_status, "brief_ready");
});
