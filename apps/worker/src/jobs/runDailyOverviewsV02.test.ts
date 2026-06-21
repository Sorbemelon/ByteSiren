import assert from "node:assert/strict";
import test from "node:test";

import { ALLOWED_SYMBOLS, type MarketSymbol } from "../config.ts";
import { getIntelligenceFeedV02 } from "../db/feedRepositoryV02.ts";
import { createMemoryD1 } from "../test/d1Memory.ts";
import type { Env } from "../types/env.ts";
import type { MarketCandle } from "../types/market.ts";
import { runDailyOverviewsV02 } from "./runDailyOverviewsV02.ts";

function dayCandles(dateUtc: string): MarketCandle[] {
  const startMs = Date.parse(`${dateUtc}T00:00:00.000Z`);
  const changes: Record<MarketSymbol, number> = {
    BTCUSDT: 5,
    ETHUSDT: 4,
    BNBUSDT: 3,
    SOLUSDT: 2,
    XRPUSDT: 1,
  };

  return ALLOWED_SYMBOLS.flatMap((symbol) =>
    Array.from({ length: 96 }, (_, index) => {
      const openTime = new Date(startMs + index * 15 * 60 * 1000);
      const closeTime = new Date(openTime.getTime() + 15 * 60 * 1000 - 1);
      const progress = index / 95;
      const finalClose = 100 * (1 + changes[symbol] / 100);

      return {
        symbol,
        interval: "15m",
        open_time: openTime.toISOString(),
        close_time: closeTime.toISOString(),
        open: 100,
        high: 103,
        low: 97,
        close: 100 + (finalClose - 100) * progress,
        volume: 1000 + index,
        quote_volume: 100000 + index,
        trade_count: index,
      };
    }),
  );
}

function signalRow(id: string, dateUtc = "2026-06-19") {
  return {
    id,
    date_utc: dateUtc,
    event_start: `${dateUtc}T14:00:00.000Z`,
    event_end: `${dateUtc}T14:45:00.000Z`,
    duration_min: 45,
    peak_time: `${dateUtc}T14:15:00.000Z`,
    direction: "observed_up",
    signals_count: 4,
    n_tracked: 5,
    avg_change_pct: 1.7,
    avg_change_method: "median_participating_symbols",
    event_strength_score: 82,
    impact_label: "High",
    chart_context_score: 88,
    chart_context_label: "Strong chart context",
    event_story_type: "range_break_up",
    trend_context: "trend_up",
    momentum_context: "impulse",
    volatility_context: "expansion_after_compression",
    event_range_context: "broad_broke_high",
    chart_context_reasons_json: "[]",
    chart_context_warnings_json: "[]",
    macro_aligned: 0,
    nearest_macro_event: null,
    macro_delta_min: null,
    source_route_hint: "broad_market",
    publish_candidate: 1,
    publish_reason: "fixture",
    suppress_reason: null,
    detector_version: "v02",
    created_at: `${dateUtc}T14:00:00.000Z`,
    updated_at: `${dateUtc}T14:00:00.000Z`,
  };
}

function marketStoryRow(id: string, dateUtc = "2026-06-19") {
  return {
    id,
    date_utc: dateUtc,
    story_start: `${dateUtc}T10:00:00.000Z`,
    story_end: `${dateUtc}T18:00:00.000Z`,
    duration_min: 480,
    story_label: "Range break sequence",
    story_family: "range_break",
    direction: "observed_up",
    swing_change_pct: 3.2,
    chart_context_score: 86,
    range_context_json: "{}",
    trend_context_json: "{}",
    momentum_context_json: "{}",
    volatility_context_json: "{}",
    decision_reasons_json: "[]",
    included_signal_event_ids_json: JSON.stringify(["signal_public"]),
    included_audit_event_ids_json: JSON.stringify(["audit_hidden"]),
    publish_candidate: 1,
    publish_reason: "fixture",
    suppress_reason: null,
    created_at: `${dateUtc}T10:00:00.000Z`,
    updated_at: `${dateUtc}T10:00:00.000Z`,
  };
}

function auditRow(id: string, dateUtc = "2026-06-19") {
  return {
    id,
    date_utc: dateUtc,
    event_start: `${dateUtc}T08:00:00.000Z`,
    event_end: `${dateUtc}T08:45:00.000Z`,
    duration_min: 45,
    direction: "observed_up",
    avg_change_pct: 0.8,
    signals_count: 2,
    n_tracked: 5,
    event_strength_score: 55,
    chart_context_score: 70,
    chart_context_label: "Moderate chart context",
    suppress_reason: "fixture",
    why_suppressed: "audit only",
    nearby_public_event_id: "signal_public",
    detector_version: "v02",
    evidence_json: "{}",
    created_at: `${dateUtc}T08:00:00.000Z`,
    updated_at: `${dateUtc}T08:00:00.000Z`,
  };
}

test("runDailyOverviewsV02 is disabled by default", async () => {
  const { db, tables } = createMemoryD1({
    market_candles: dayCandles("2026-06-19"),
  });
  const env: Pick<Env, "ENABLE_DAILY_OVERVIEWS"> = {};
  const result = await runDailyOverviewsV02(db, env, {
    now: new Date("2026-06-21T12:00:00.000Z"),
  });

  assert.equal(result.status, "skipped");
  assert.equal(tables.daily_overviews_v02.length, 0);
  assert.equal(tables.job_runs.at(-1)?.job_name, "run_daily_overviews_v02");
});

test("runDailyOverviewsV02 writes deterministic Daily Overview rows only", async () => {
  const { db, tables } = createMemoryD1({
    market_candles: dayCandles("2026-06-19"),
    signal_events_v02: [
      signalRow("signal_old"),
      {
        ...signalRow("signal_public"),
        event_start: "2026-06-19T16:00:00.000Z",
        event_end: "2026-06-19T16:45:00.000Z",
      },
      { ...signalRow("signal_hidden"), publish_candidate: 0 },
    ],
    market_stories_v02: [marketStoryRow("story_public")],
    audit_events_v02: [auditRow("audit_hidden")],
  });
  const result = await runDailyOverviewsV02(
    db,
    { ENABLE_DAILY_OVERVIEWS: "true" },
    { now: new Date("2026-06-21T12:00:00.000Z") },
  );
  const row = tables.daily_overviews_v02[0];
  const metadata = JSON.parse(
    tables.job_runs.at(-1)?.metadata_json ?? "{}",
  ) as {
    generated_count: number;
    skipped_count: number;
  };

  assert.equal(result.status, "success");
  assert.equal(result.generated_count, 1);
  assert.equal(row.id, "daily_2026-06-19");
  assert.equal(row.daily_change_label, "24h Change");
  assert.equal(row.daily_change_pct, 3);
  assert.deepEqual(JSON.parse(row.signal_event_ids_json), [
    "signal_public",
    "signal_old",
  ]);
  assert.deepEqual(JSON.parse(row.market_story_ids_json), ["story_public"]);
  assert.equal(row.audit_event_count, 1);
  assert.equal(row.claude_status, "queued_for_analysis");
  assert.equal(tables.claude_briefs_v02.length, 0);
  assert.equal(tables.source_references_v02.length, 0);
  assert.equal(tables.market_stories_v02.length, 1);
  assert.equal(tables.signal_events_v02.length, 3);
  assert.equal(metadata.generated_count, 1);
  assert.equal(metadata.skipped_count, 0);
});

test("runDailyOverviewsV02 is idempotent and preserves terminal Claude status", async () => {
  const { db, tables } = createMemoryD1({
    market_candles: dayCandles("2026-06-19"),
    daily_overviews_v02: [
      {
        id: "daily_2026-06-19",
        date_utc: "2026-06-19",
        day_start: "2026-06-19T00:00:00.000Z",
        day_end: "2026-06-19T23:59:59.999Z",
        market_tone: "mixed",
        daily_change_pct: 0,
        daily_change_label: "24h Change",
        market_range_pct: 0,
        notable_symbols_json: "[]",
        top_symbol_moves_json: "[]",
        signal_event_ids_json: "[]",
        market_story_ids_json: "[]",
        audit_event_count: 0,
        daily_chart_context_summary_json: "{}",
        claude_status: "brief_ready",
        claude_brief_id: null,
        created_at: "2026-06-20T00:05:00.000Z",
        updated_at: "2026-06-20T00:05:00.000Z",
      },
    ],
  });

  await runDailyOverviewsV02(
    db,
    { ENABLE_DAILY_OVERVIEWS: "true" },
    { now: new Date("2026-06-21T12:00:00.000Z") },
  );
  await runDailyOverviewsV02(
    db,
    { ENABLE_DAILY_OVERVIEWS: "true" },
    { now: new Date("2026-06-21T12:00:00.000Z") },
  );

  assert.equal(tables.daily_overviews_v02.length, 1);
  assert.equal(tables.daily_overviews_v02[0].claude_status, "brief_ready");
  assert.equal(tables.daily_overviews_v02[0].daily_change_pct, 3);
});

test("generated Daily Overview appears in v0.2 feed without fake Claude text", async () => {
  const { db } = createMemoryD1({
    market_candles: dayCandles("2026-06-19"),
  });

  await runDailyOverviewsV02(
    db,
    { ENABLE_DAILY_OVERVIEWS: "true" },
    { now: new Date("2026-06-21T12:00:00.000Z") },
  );

  const feed = await getIntelligenceFeedV02(db, {
    now: new Date("2026-06-21T12:00:00.000Z"),
  });
  const daily = feed.day_groups[0].items[0];

  assert.equal(daily.item_type, "daily_overview");
  if (daily.item_type !== "daily_overview") {
    throw new Error("expected Daily Overview item");
  }

  assert.equal(daily.daily_change_label, "24h Change");
  assert.equal(daily.public_context_status, "queued_for_analysis");
  assert.equal(Object.hasOwn(daily, "brief"), false);
  assert.deepEqual(daily.sources, []);
});
