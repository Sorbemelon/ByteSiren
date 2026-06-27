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

test("runDailyOverviewsV02 dispatches bounded Daily Claude workflow for queued rows", async () => {
  const { db, tables } = createMemoryD1({
    market_candles: dayCandles("2026-06-19"),
  });
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedBody: {
    ref?: unknown;
    inputs?: Record<string, unknown>;
  } = {};
  globalThis.fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(null, { status: 204 });
  };

  try {
    const result = await runDailyOverviewsV02(
      db,
      {
        DB: db,
        ENABLE_DAILY_OVERVIEWS: "true",
        ENABLE_V02_DAILY_CLAUDE_WORKFLOW_DISPATCH: "true",
        GITHUB_REFRESH_WORKFLOW_REPO: "Sorbemelon/ByteSiren",
        GITHUB_INGEST_DISPATCH_TOKEN: "secret-github-token",
        V02_DAILY_CLAUDE_WORKFLOW_FILE: "v02-claude-enrichment.yml",
        V02_DAILY_CLAUDE_WORKFLOW_REF: "main",
        V02_DAILY_CLAUDE_DISPATCH_LIMIT: "3",
      },
      {
        now: new Date("2026-06-21T12:00:00.000Z"),
        requestId: "daily-dispatch-test",
        triggerSource: "cloudflare_cron_daily",
        dispatchClaude: true,
      },
    );
    const inputs = capturedBody.inputs ?? {};
    const dispatchJob = tables.job_runs.find(
      (row) => row.job_name === "dispatch_v02_daily_claude_workflow",
    );
    const dispatchMeta = JSON.parse(dispatchJob?.metadata_json ?? "{}") as {
      daily_overview_ids?: string[];
      dispatch_status?: string;
      inputs_summary?: { target_types?: string; mode?: string; ids?: string };
    };

    assert.equal(result.status, "success");
    assert.equal(result.claude_dispatch?.dispatch_status, "dispatched");
    assert.match(capturedUrl, /v02-claude-enrichment\.yml\/dispatches$/);
    assert.equal(capturedBody.ref, "main");
    assert.equal(inputs.trigger_source, "cloudflare_cron_daily");
    assert.equal(inputs.target_types, "daily");
    assert.equal(inputs.mode, "ids");
    assert.equal(inputs.ids, "daily_2026-06-19");
    assert.equal(inputs.limit, "3");
    assert.equal(inputs.batch_size, "3");
    assert.equal(inputs.dry_run, "false");
    assert.equal(inputs.confirm_live, "true");
    assert.equal(dispatchJob?.status, "success");
    assert.equal(dispatchMeta.dispatch_status, "dispatched");
    assert.deepEqual(dispatchMeta.daily_overview_ids, ["daily_2026-06-19"]);
    assert.equal(dispatchMeta.inputs_summary?.target_types, "daily");
    assert.equal(dispatchMeta.inputs_summary?.mode, "ids");
    assert.equal(tables.claude_briefs_v02.length, 0);
    assert.equal(tables.source_references_v02.length, 0);
    assert.equal(
      JSON.stringify(capturedBody).includes("secret-github-token"),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runDailyOverviewsV02 skips Daily Claude dispatch for existing terminal briefs", async () => {
  const { db, tables } = createMemoryD1({
    market_candles: dayCandles("2026-06-19"),
    claude_briefs_v02: [
      {
        id: "brief_daily_2026-06-19",
        target_type: "daily_overview_v02",
        target_id: "daily_2026-06-19",
        prompt_mode: "daily_overview",
        status: "brief_ready",
        public_label: "Daily context",
        classification: "market_day",
        confidence: "medium",
        headline: "Daily market context",
        collapsed_summary: "Existing daily context.",
        context_details: "Existing daily context.",
        source_support: "source_backed",
        source_timing_alignment: "aligned",
        validation_flags_json: "[]",
        detector_feedback_json: "{}",
        prompt_version: "v02-daily-overview-v1",
        model: "claude-sonnet-4-6",
        error_code: null,
        error_message: null,
        created_at: "2026-06-20T00:10:00.000Z",
        updated_at: "2026-06-20T00:10:00.000Z",
      },
    ],
  });
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => {
      throw new Error("GitHub dispatch should not be called");
    };

    const result = await runDailyOverviewsV02(
      db,
      {
        ENABLE_DAILY_OVERVIEWS: "true",
        ENABLE_V02_DAILY_CLAUDE_WORKFLOW_DISPATCH: "true",
        GITHUB_INGEST_DISPATCH_TOKEN: "secret-github-token",
        GITHUB_INGEST_REPO: "ByteSiren",
        GITHUB_INGEST_OWNER: "Sorbemelon",
        V02_DAILY_CLAUDE_WORKFLOW_FILE: "v02-claude-enrichment.yml",
        V02_DAILY_CLAUDE_WORKFLOW_REF: "main",
        V02_DAILY_CLAUDE_DISPATCH_LIMIT: "3",
      },
      {
        now: new Date("2026-06-21T12:00:00.000Z"),
        requestId: "daily-dispatch-existing-brief",
        triggerSource: "cloudflare_cron_daily",
        dispatchClaude: true,
      },
    );
    const dispatchJob = tables.job_runs.find(
      (row) => row.job_name === "dispatch_v02_daily_claude_workflow",
    );
    const dispatchMeta = JSON.parse(dispatchJob?.metadata_json ?? "{}") as {
      daily_overview_ids?: string[];
      dispatch_status?: string;
    };

    assert.equal(result.status, "success");
    assert.equal(result.claude_dispatch?.dispatch_status, "skipped_no_targets");
    assert.equal(dispatchJob?.status, "skipped");
    assert.equal(dispatchMeta.dispatch_status, "skipped_no_targets");
    assert.deepEqual(dispatchMeta.daily_overview_ids, []);
    assert.equal(tables.claude_briefs_v02.length, 1);
    assert.equal(tables.source_references_v02.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
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
