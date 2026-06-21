import assert from "node:assert/strict";
import test from "node:test";

import {
  ALLOWED_SYMBOLS,
  MARKET_INTERVAL,
  type MarketSymbol,
} from "../../config.ts";
import type { MarketCandle } from "../../types/market.ts";
import { detectSignalAndAuditEventsV02 } from "./index.ts";

const baseTimeMs = Date.parse("2026-06-14T00:00:00.000Z");
const fifteenMinutesMs = 15 * 60 * 1000;

function isoAt(index: number): string {
  return new Date(baseTimeMs + index * fifteenMinutesMs).toISOString();
}

function closeIsoAt(index: number): string {
  return new Date(
    baseTimeMs + (index + 1) * fifteenMinutesMs - 1,
  ).toISOString();
}

function syntheticCandles(
  symbol: MarketSymbol,
  options: {
    count?: number;
    spike?: "up" | "down" | null;
  } = {},
): MarketCandle[] {
  const count = options.count ?? 112;
  const candles: MarketCandle[] = [];
  let price = symbol === "BTCUSDT" ? 100 : 50;

  for (let index = 0; index < count; index += 1) {
    const isSignalBar = index >= count - 2;
    const change =
      isSignalBar && options.spike === "up"
        ? 0.009
        : isSignalBar && options.spike === "down"
          ? -0.009
          : index % 2 === 0
            ? 0.0005
            : -0.0004;
    const open = price;
    price *= 1 + change;
    const close = price;
    const high =
      isSignalBar && options.spike === "up" ? close * 1.003 : close * 1.001;
    const low =
      isSignalBar && options.spike === "down" ? close * 0.997 : close * 0.999;
    const volume = isSignalBar && options.spike ? 260 : 100;

    candles.push({
      symbol,
      interval: MARKET_INTERVAL,
      open_time: isoAt(index),
      close_time: closeIsoAt(index),
      open,
      high,
      low,
      close,
      volume,
      quote_volume: volume * close,
      trade_count: 10,
    });
  }

  return candles;
}

function candlesBySymbol(spikeSymbols: MarketSymbol[], spike: "up" | "down") {
  return Object.fromEntries(
    ALLOWED_SYMBOLS.map((symbol) => [
      symbol,
      syntheticCandles(symbol, {
        spike: spikeSymbols.includes(symbol) ? spike : null,
      }),
    ]),
  ) as Record<MarketSymbol, MarketCandle[]>;
}

test("v0.2 detector produces compact Signal Event output from fixture candles", () => {
  const output = detectSignalAndAuditEventsV02({
    candlesBySymbol: candlesBySymbol(
      ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"],
      "up",
    ),
  });

  assert.equal(output.signal_events.length, 1);
  assert.equal(output.audit_events.length, 0);

  const event = output.signal_events[0];
  assert.equal(event.publish_candidate, true);
  assert.equal(event.direction, "observed_up");
  assert.equal(event.detector_version, "v02");
  assert.equal(event.avg_change_method, "median_participating_symbols");
  assert.ok(event.signals_count >= 3);
  assert.ok(event.duration_min <= 30);
  assert.ok(event.chart_context_score !== null);
  assert.ok(event.chart_context_label.length > 0);
  assert.ok(event.event_story_type.length > 0);
  assert.ok(event.trend_context.length > 0);
  assert.ok(event.momentum_context.length > 0);
  assert.ok(event.volatility_context.length > 0);
  assert.ok(event.event_range_context.length > 0);
  assert.equal(event.symbols.length, ALLOWED_SYMBOLS.length);
});

test("v0.2 detector emits deterministic IDs and per-symbol evidence", () => {
  const input = {
    candlesBySymbol: candlesBySymbol(
      ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"],
      "down",
    ),
  };
  const first = detectSignalAndAuditEventsV02(input);
  const second = detectSignalAndAuditEventsV02(input);
  const event = first.signal_events[0];
  const symbol = event.symbols[0];

  assert.equal(first.signal_events[0].id, second.signal_events[0].id);
  assert.equal(symbol.signal_event_id, event.id);
  assert.equal(typeof symbol.window_change_pct, "number");
  assert.equal(typeof symbol.peak_15m_change_pct, "number");
  assert.equal(typeof symbol.volume_ratio, "number");
  assert.ok(symbol.range_position);
  assert.ok(
    [
      "inside_range",
      "near_high",
      "near_low",
      "broke_high",
      "broke_low",
    ].includes(symbol.range_position),
  );
  assert.equal(event.symbols.filter((item) => item.is_lead_mover).length, 1);
  assert.equal(
    event.symbols.filter((item) => item.is_peak_15m_highlight).length,
    1,
  );
});

test("v0.2 detector produces Audit Events for non-public breadth", () => {
  const output = detectSignalAndAuditEventsV02({
    candlesBySymbol: candlesBySymbol(["BTCUSDT", "ETHUSDT"], "up"),
  });

  assert.equal(output.signal_events.length, 0);
  assert.equal(output.audit_events.length, 1);
  assert.equal(output.audit_events[0].detector_version, "v02");
  assert.equal(
    output.audit_events[0].suppress_reason,
    "insufficient_public_breadth",
  );
  assert.equal(output.summary.suppressed_count, 1);
});

test("v0.2 detector output does not emit Market Story, Daily Overview, or Claude payloads", () => {
  const output = detectSignalAndAuditEventsV02({
    candlesBySymbol: candlesBySymbol(
      ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"],
      "up",
    ),
  });
  const event = output.signal_events[0] as unknown as Record<string, unknown>;

  assert.equal("market_stories" in output, false);
  assert.equal("daily_overviews" in output, false);
  assert.equal("claude_payload" in event, false);
  assert.equal("claude_brief_id" in event, false);
});
