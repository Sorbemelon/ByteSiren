import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  ALLOWED_SYMBOLS,
  MARKET_INTERVAL,
  type MarketSymbol,
} from "../../config.ts";
import type { MarketCandle } from "../../types/market.ts";
import { detectSignalAndAuditEventsV02 } from "./index.ts";

const baseTimeMs = Date.parse("2026-06-14T00:00:00.000Z");
const fifteenMinutesMs = 15 * 60 * 1000;
const testDir = dirname(fileURLToPath(import.meta.url));

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
    spikeChangePct?: number;
  } = {},
): MarketCandle[] {
  const count = options.count ?? 112;
  const spikeChangePct = options.spikeChangePct ?? 0.009;
  const candles: MarketCandle[] = [];
  let price = symbol === "BTCUSDT" ? 100 : 50;

  for (let index = 0; index < count; index += 1) {
    const isSignalBar = index >= count - 2;
    const change =
      isSignalBar && options.spike === "up"
        ? spikeChangePct
        : isSignalBar && options.spike === "down"
          ? -spikeChangePct
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

function candlesBySymbol(
  spikeSymbols: MarketSymbol[],
  spike: "up" | "down",
  options: { spikeChangePct?: number } = {},
) {
  return Object.fromEntries(
    ALLOWED_SYMBOLS.map((symbol) => [
      symbol,
      syntheticCandles(symbol, {
        spike: spikeSymbols.includes(symbol) ? spike : null,
        spikeChangePct: options.spikeChangePct,
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
  assert.ok(event.duration_min >= 45);
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

test("v0.2 detector produces Audit Events for structurally weak public context", () => {
  const output = detectSignalAndAuditEventsV02({
    candlesBySymbol: candlesBySymbol(["BTCUSDT", "ETHUSDT", "BNBUSDT"], "up", {
      spikeChangePct: 0.003,
    }),
  });

  assert.equal(output.signal_events.length, 0);
  assert.equal(output.audit_events.length, 1);
  assert.equal(output.audit_events[0].detector_version, "v02");
  assert.equal(
    output.audit_events[0].suppress_reason,
    "no_strong_context_path",
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

function acceptedSignature(event: Record<string, unknown>) {
  return {
    id: event.event_id,
    start: event.window_start,
    end: event.window_end,
    duration_min: event.duration_min,
    direction: event.direction,
    publish_candidate: Boolean(event.publish_candidate),
    publish_reason: event.publish_reason ?? null,
    suppress_reason: event.suppress_reason ?? null,
    avg_change_pct: event.window_move_pct ?? null,
    signals_count: event.signals_count,
    chart_context_label: event.chart_context_label,
    event_range_context: event.event_range_context,
    event_story_type: event.event_story_type,
  };
}

function outputSignature(
  event: Record<string, unknown>,
  publishCandidate: boolean,
) {
  const evidence =
    typeof event.evidence_json === "string"
      ? (JSON.parse(event.evidence_json) as Record<string, unknown>)
      : {};

  return {
    id: event.id,
    start: event.event_start,
    end: event.event_end,
    duration_min: event.duration_min,
    direction: event.direction,
    publish_candidate: publishCandidate,
    publish_reason: event.publish_reason ?? null,
    suppress_reason: event.suppress_reason ?? null,
    avg_change_pct: event.avg_change_pct ?? null,
    signals_count: event.signals_count,
    chart_context_label: event.chart_context_label,
    event_range_context:
      event.event_range_context ?? evidence.event_range_context,
    event_story_type: event.event_story_type ?? evidence.event_story_type,
  };
}

function sortSignatures<
  T extends { start: unknown; end: unknown; id: unknown },
>(signatures: T[]) {
  return signatures.sort(
    (a, b) =>
      String(a.start).localeCompare(String(b.start)) ||
      String(a.end).localeCompare(String(b.end)) ||
      String(a.id).localeCompare(String(b.id)),
  );
}

test("v0.2 detector matches the accepted structural experiment exactly", async () => {
  const fixture = JSON.parse(
    readFileSync(
      resolve(testDir, "../../../../../experiments/v0.2/data/candles_30d.json"),
      "utf8",
    ),
  ) as { candles_by_symbol: Record<MarketSymbol, MarketCandle[]> };
  const output = detectSignalAndAuditEventsV02({
    candlesBySymbol: fixture.candles_by_symbol,
  });
  const acceptedModule = (await import(
    pathToFileURL(
      resolve(
        testDir,
        "../../../../../experiments/v0.2/src/detector-structural/index.mjs",
      ),
    ).href
  )) as {
    detectStructuralEvents: (input: {
      candlesBySymbol: Record<MarketSymbol, MarketCandle[]>;
    }) => { events: Record<string, unknown>[] };
  };
  const accepted = acceptedModule.detectStructuralEvents({
    candlesBySymbol: fixture.candles_by_symbol,
  }) as { events: Record<string, unknown>[] };
  const durations = output.signal_events
    .map((event) => event.duration_min)
    .sort((a, b) => a - b);
  const outputSignatures = sortSignatures([
    ...output.signal_events.map((event) =>
      outputSignature(event as unknown as Record<string, unknown>, true),
    ),
    ...output.audit_events.map((event) =>
      outputSignature(event as unknown as Record<string, unknown>, false),
    ),
  ]);
  const acceptedSignatures = sortSignatures(
    accepted.events.map(acceptedSignature),
  );

  assert.equal(accepted.events.length, 56);
  assert.equal(output.signal_events.length, 25);
  assert.equal(output.audit_events.length, 31);
  assert.equal(
    output.summary.publish_candidate_count,
    output.signal_events.length,
  );
  assert.deepEqual(output.summary.counts_by_reason, {
    no_strong_context_path: 21,
    weak_avg_change: 10,
  });
  assert.equal(durations.filter((duration) => duration <= 30).length, 0);
  assert.equal(durations.filter((duration) => duration <= 60).length, 2);
  assert.equal(durations[0], 45);
  assert.equal(durations.at(-1), 885);
  assert.deepEqual(outputSignatures, acceptedSignatures);
});
