import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryD1 } from "../test/d1Memory.ts";
import { runMarketStoriesV02 } from "./runMarketStoriesV02.ts";

function signalRow(
  id: string,
  start: string,
  end: string,
  options: {
    direction?: "observed_up" | "observed_down";
    avgChangePct?: number;
    score?: number;
    storyType?: string;
    rangeContext?: string;
  } = {},
) {
  return {
    id,
    date_utc: start.slice(0, 10),
    event_start: start,
    event_end: end,
    duration_min: 60,
    peak_time: start,
    direction: options.direction ?? "observed_up",
    signals_count: 4,
    n_tracked: 5,
    avg_change_pct: options.avgChangePct ?? 1.2,
    avg_change_method: "median_participating_symbols",
    event_strength_score: 80,
    impact_label: "High",
    chart_context_score: options.score ?? 82,
    chart_context_label: "Range break",
    event_story_type: options.storyType ?? "range_break_up",
    trend_context: "trend_up",
    momentum_context: "continuation",
    volatility_context: "ordinary_volatility",
    event_range_context: options.rangeContext ?? "broad_broke_high",
    chart_context_reasons_json: "[]",
    chart_context_warnings_json: "[]",
    macro_aligned: 0,
    nearest_macro_event: null,
    macro_delta_min: null,
    source_route_hint: "broad_market",
    publish_candidate: 1,
    publish_reason: "test_public_signal",
    suppress_reason: null,
    detector_version: "v02",
    created_at: start,
    updated_at: start,
  };
}

function auditRow(
  id: string,
  start: string,
  end: string,
  options: {
    direction?: "observed_up" | "observed_down";
    avgChangePct?: number;
    score?: number;
  } = {},
) {
  return {
    id,
    date_utc: start.slice(0, 10),
    event_start: start,
    event_end: end,
    duration_min: 60,
    direction: options.direction ?? "observed_up",
    avg_change_pct: options.avgChangePct ?? 1.2,
    signals_count: 3,
    n_tracked: 5,
    event_strength_score: 70,
    chart_context_score: options.score ?? 86,
    chart_context_label: "Range break",
    suppress_reason: "test_audit_only",
    why_suppressed: "test audit event",
    nearby_public_event_id: null,
    detector_version: "v02",
    evidence_json: JSON.stringify({
      event_story_type: "range_break_up",
      event_range_context: "broad_broke_high",
      trend_context: "trend_up",
      momentum_context: "continuation",
      volatility_context: "ordinary_volatility",
    }),
    created_at: start,
    updated_at: start,
  };
}

function candle(
  symbol: "BTCUSDT" | "ETHUSDT" | "BNBUSDT" | "SOLUSDT" | "XRPUSDT",
  openTime: string,
  open: number,
  close: number,
) {
  const closeTime = new Date(Date.parse(openTime) + 15 * 60 * 1000 - 1)
    .toISOString()
    .replace(".000Z", "Z");

  return {
    symbol,
    interval: "15m" as const,
    open_time: openTime,
    close_time: closeTime,
    open,
    high: Math.max(open, close),
    low: Math.min(open, close),
    close,
    volume: 100,
    quote_volume: 1000,
    trade_count: 10,
  };
}

function storedStoryRow(id: string, start: string, end: string) {
  return {
    id,
    date_utc: start.slice(0, 10),
    story_start: start,
    story_end: end,
    duration_min: 240,
    story_label: "Range break sequence",
    story_family: "range_break",
    direction: "observed_up",
    swing_change_pct: 2.2,
    chart_context_score: 80,
    range_context_json: "{}",
    trend_context_json: "{}",
    momentum_context_json: "{}",
    volatility_context_json: "{}",
    decision_reasons_json: "[]",
    included_signal_event_ids_json: "[]",
    included_audit_event_ids_json: "[]",
    publish_candidate: 1,
    publish_reason: "test stale story",
    suppress_reason: null,
    created_at: start,
    updated_at: start,
  };
}

function storedStoryMemberRow(storyId: string, memberId: string) {
  return {
    id: `${storyId}_${memberId}`,
    market_story_id: storyId,
    member_type: "signal_event_v02",
    member_id: memberId,
    display_order: 0,
    role: "test_stale_member",
    created_at: "2026-06-15T00:00:00.000Z",
  };
}

test("runMarketStoriesV02 writes Market Stories and members", async () => {
  const { db, tables } = createMemoryD1({
    market_candles: [
      candle("BTCUSDT", "2026-06-15T00:00:00.000Z", 100, 101),
      candle("BTCUSDT", "2026-06-15T00:15:00.000Z", 101, 100),
      candle("BTCUSDT", "2026-06-15T04:00:00.000Z", 100, 100.6),
      candle("BTCUSDT", "2026-06-15T04:15:00.000Z", 100.6, 100),
    ],
    signal_events_v02: [
      signalRow(
        "signal_a",
        "2026-06-15T00:00:00.000Z",
        "2026-06-15T01:00:00.000Z",
      ),
      signalRow(
        "signal_b",
        "2026-06-15T04:00:00.000Z",
        "2026-06-15T05:00:00.000Z",
      ),
    ],
  });

  const result = await runMarketStoriesV02(
    db,
    new Date("2026-06-15T06:00:00.000Z"),
  );

  assert.equal(result.status, "success");
  assert.equal(result.story_count, 1);
  assert.equal(result.publish_candidate_count, 1);
  assert.equal(tables.market_stories_v02.length, 1);
  assert.equal(tables.market_story_members_v02.length, 2);
  assert.equal(
    tables.market_stories_v02[0].story_label,
    "Range break sequence",
  );
  assert.notEqual(tables.market_stories_v02[0].swing_change_pct, null);
  const rangeContext = JSON.parse(
    tables.market_stories_v02[0].range_context_json,
  );
  assert.equal(rangeContext.swing_score_label, "Volatility Score");
  assert.equal(rangeContext.per_symbol_evidence[0].symbol, "BTCUSDT");
  assert.equal(tables.job_runs.at(-1)?.job_name, "run_market_stories_v02");
});

test("runMarketStoriesV02 is idempotent and replaces members", async () => {
  const { db, tables } = createMemoryD1({
    signal_events_v02: [
      signalRow(
        "signal_a",
        "2026-06-15T00:00:00.000Z",
        "2026-06-15T01:00:00.000Z",
      ),
      signalRow(
        "signal_b",
        "2026-06-15T04:00:00.000Z",
        "2026-06-15T05:00:00.000Z",
      ),
    ],
  });

  await runMarketStoriesV02(db, new Date("2026-06-15T06:00:00.000Z"));
  const firstStoryId = tables.market_stories_v02[0].id;
  await runMarketStoriesV02(db, new Date("2026-06-15T06:00:00.000Z"));

  assert.equal(tables.market_stories_v02.length, 1);
  assert.equal(tables.market_story_members_v02.length, 2);
  assert.equal(tables.market_stories_v02[0].id, firstStoryId);
});

test("runMarketStoriesV02 prunes stale stories and members", async () => {
  const { db, tables } = createMemoryD1({
    signal_events_v02: [
      signalRow(
        "signal_a",
        "2026-06-15T00:00:00.000Z",
        "2026-06-15T01:00:00.000Z",
      ),
      signalRow(
        "signal_b",
        "2026-06-15T04:00:00.000Z",
        "2026-06-15T05:00:00.000Z",
      ),
    ],
    market_stories_v02: [
      storedStoryRow(
        "stale_story",
        "2026-06-14T00:00:00.000Z",
        "2026-06-14T06:00:00.000Z",
      ),
    ],
    market_story_members_v02: [
      storedStoryMemberRow("stale_story", "stale_signal"),
    ],
  });

  const result = await runMarketStoriesV02(
    db,
    new Date("2026-06-15T06:00:00.000Z"),
  );

  assert.equal(result.status, "success");
  assert.equal(
    tables.market_stories_v02.some((story) => story.id === "stale_story"),
    false,
  );
  assert.equal(
    tables.market_story_members_v02.some(
      (member) => member.market_story_id === "stale_story",
    ),
    false,
  );
  assert.equal(tables.market_stories_v02.length, result.story_count);
});

test("runMarketStoriesV02 clears stale stories when generation is skipped", async () => {
  const { db, tables } = createMemoryD1({
    signal_events_v02: [
      signalRow(
        "signal_a",
        "2026-06-15T00:00:00.000Z",
        "2026-06-15T01:00:00.000Z",
      ),
    ],
    market_stories_v02: [
      storedStoryRow(
        "stale_story",
        "2026-06-14T00:00:00.000Z",
        "2026-06-14T06:00:00.000Z",
      ),
    ],
    market_story_members_v02: [
      storedStoryMemberRow("stale_story", "stale_signal"),
    ],
  });

  const result = await runMarketStoriesV02(
    db,
    new Date("2026-06-15T06:00:00.000Z"),
  );

  assert.equal(result.status, "skipped");
  assert.equal(tables.market_stories_v02.length, 0);
  assert.equal(tables.market_story_members_v02.length, 0);
});

test("runMarketStoriesV02 can write audit-only strong context stories", async () => {
  const { db, tables } = createMemoryD1({
    audit_events_v02: [
      auditRow(
        "audit_a",
        "2026-06-15T00:00:00.000Z",
        "2026-06-15T01:00:00.000Z",
      ),
      auditRow(
        "audit_b",
        "2026-06-15T04:00:00.000Z",
        "2026-06-15T05:00:00.000Z",
      ),
    ],
  });

  const result = await runMarketStoriesV02(
    db,
    new Date("2026-06-15T06:00:00.000Z"),
  );

  assert.equal(result.status, "success");
  assert.equal(result.audit_only_story_count, 1);
  assert.equal(tables.market_stories_v02[0].publish_candidate, 1);
  assert.deepEqual(
    JSON.parse(tables.market_stories_v02[0].included_audit_event_ids_json),
    ["audit_a", "audit_b"],
  );
});

test("Market Story write path does not write Claude or source tables", async () => {
  const { db, tables } = createMemoryD1({
    signal_events_v02: [
      signalRow(
        "signal_a",
        "2026-06-15T00:00:00.000Z",
        "2026-06-15T01:00:00.000Z",
      ),
      signalRow(
        "signal_b",
        "2026-06-15T04:00:00.000Z",
        "2026-06-15T05:00:00.000Z",
      ),
    ],
  });

  await runMarketStoriesV02(db, new Date("2026-06-15T06:00:00.000Z"));

  assert.equal(tables.claude_briefs_v02.length, 0);
  assert.equal(tables.source_references_v02.length, 0);
  assert.equal(tables.claude_briefs.length, 0);
  assert.equal(tables.source_references.length, 0);
});
