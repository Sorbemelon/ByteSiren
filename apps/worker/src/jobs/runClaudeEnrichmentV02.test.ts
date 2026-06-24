import assert from "node:assert/strict";
import test from "node:test";

import type {
  ClaudeClientRequest,
  ClaudeClientResult,
} from "../services/claude/index.ts";
import { createMemoryD1 } from "../test/d1Memory.ts";
import type { Env } from "../types/env.ts";
import {
  isClaudeEnrichmentV02Enabled,
  runClaudeEnrichmentV02,
  selectClaudeEnrichmentTargetsV02,
  type ClaudeEnrichmentClientV02,
} from "./runClaudeEnrichmentV02.ts";

const now = new Date("2026-06-21T12:00:00.000Z");

class MockClaudeClient implements ClaudeEnrichmentClientV02 {
  readonly requests: ClaudeClientRequest[] = [];
  private readonly results: ClaudeClientResult[];

  constructor(results: ClaudeClientResult[]) {
    this.results = results;
  }

  async createIncidentBrief(
    request: ClaudeClientRequest,
  ): Promise<ClaudeClientResult> {
    this.requests.push(request);
    const result = this.results.shift();

    if (!result) {
      throw new Error("No mocked Claude result available.");
    }

    return result;
  }
}

function env(overrides: Partial<Env> = {}): Env {
  return {
    DB: createMemoryD1().db,
    ANTHROPIC_API_KEY: "test-key",
    CLAUDE_MODEL: "claude-test-model",
    CLAUDE_WEB_SEARCH_TOOL_TYPE: "web_search_20250305",
    CLAUDE_DEFAULT_MAX_USES: "2",
    CLAUDE_BLOCKED_DOMAINS: "blocked.example",
    ENABLE_SIGNAL_CLAUDE_V02: "false",
    ENABLE_DAILY_CLAUDE: "false",
    CLAUDE_CATCHUP_LIMIT: "5",
    ...overrides,
  };
}

function signalEvent(id: string, start: string, publishCandidate = 1) {
  const end = new Date(Date.parse(start) + 45 * 60 * 1000).toISOString();
  return {
    id,
    date_utc: start.slice(0, 10),
    event_start: start,
    event_end: end,
    duration_min: 45,
    peak_time: start,
    direction: "observed_up",
    signals_count: 4,
    n_tracked: 5,
    avg_change_pct: 1.8,
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
    chart_context_reasons_json: JSON.stringify(["range break"]),
    chart_context_warnings_json: "[]",
    macro_aligned: 0,
    nearest_macro_event: null,
    macro_delta_min: null,
    source_route_hint: "broad_market",
    publish_candidate: publishCandidate,
    publish_reason: "strong context",
    suppress_reason: publishCandidate ? null : "audit_only",
    detector_version: "v02",
    created_at: start,
    updated_at: start,
  };
}

function signalSymbol(signalEventId: string, symbol = "BTCUSDT") {
  return {
    id: `${signalEventId}_${symbol}`,
    signal_event_id: signalEventId,
    symbol,
    window_change_pct: 2.2,
    peak_15m_change_pct: 1.1,
    volume_ratio: 2.5,
    range_position: "broke_high",
    prev_24h_high: 100,
    prev_24h_low: 90,
    range_break_direction: "up",
    range_break_pct: 1.2,
    range_break_strength: 0.7,
    distance_to_range_high_pct: 0.2,
    distance_to_range_low_pct: 8.2,
    is_lead_mover: 1,
    is_peak_15m_highlight: 1,
    participated: 1,
    evidence_json: "{}",
    created_at: "2026-06-19T14:00:00.000Z",
    updated_at: "2026-06-19T14:00:00.000Z",
  };
}

function dailyOverview(id = "daily_2026-06-19") {
  return {
    id,
    date_utc: "2026-06-19",
    day_start: "2026-06-19T00:00:00.000Z",
    day_end: "2026-06-19T23:59:59.999Z",
    market_tone: "volatile",
    daily_change_pct: 2.4,
    daily_change_label: "24h Change",
    market_range_pct: 4.8,
    notable_symbols_json: JSON.stringify(["BTCUSDT"]),
    top_symbol_moves_json: JSON.stringify([{ symbol: "BTCUSDT" }]),
    signal_event_ids_json: JSON.stringify(["sig_public"]),
    market_story_ids_json: JSON.stringify(["story_public"]),
    audit_event_count: 1,
    daily_chart_context_summary_json: "{}",
    claude_status: "queued_for_analysis",
    claude_brief_id: null,
    created_at: "2026-06-20T00:10:00.000Z",
    updated_at: "2026-06-20T00:10:00.000Z",
  };
}

function marketStory() {
  return {
    id: "story_public",
    date_utc: "2026-06-19",
    story_start: "2026-06-19T12:00:00.000Z",
    story_end: "2026-06-19T18:00:00.000Z",
    duration_min: 360,
    story_label: "Range break sequence",
    story_family: "range_break",
    direction: "observed_up",
    swing_change_pct: 3.4,
    chart_context_score: 86,
    range_context_json: "{}",
    trend_context_json: "{}",
    momentum_context_json: "{}",
    volatility_context_json: "{}",
    decision_reasons_json: JSON.stringify(["coherent range break"]),
    included_signal_event_ids_json: JSON.stringify(["sig_public"]),
    included_audit_event_ids_json: JSON.stringify(["audit_hidden"]),
    publish_candidate: 1,
    publish_reason: "story criteria",
    suppress_reason: null,
    created_at: "2026-06-19T18:00:00.000Z",
    updated_at: "2026-06-19T18:00:00.000Z",
  };
}

function auditEvent() {
  return {
    id: "audit_hidden",
    date_utc: "2026-06-19",
    event_start: "2026-06-19T10:00:00.000Z",
    event_end: "2026-06-19T10:45:00.000Z",
    duration_min: 45,
    direction: "observed_up",
    avg_change_pct: 0.9,
    signals_count: 2,
    n_tracked: 5,
    event_strength_score: 44,
    chart_context_score: 82,
    chart_context_label: "Strong chart context",
    suppress_reason: "audit_only",
    why_suppressed: "not public standalone",
    nearby_public_event_id: "sig_public",
    detector_version: "v02",
    evidence_json: "{}",
    created_at: "2026-06-19T10:00:00.000Z",
    updated_at: "2026-06-19T10:00:00.000Z",
  };
}

function signalResult(
  classification:
    | "Focused Cause"
    | "Likely Cause"
    | "Market Backdrop"
    | "No Clear Cause" = "Likely Cause",
  sourceUrl = "https://www.reuters.com/markets/2026/06/19/context/",
) {
  const tag =
    classification === "Focused Cause"
      ? "Focused catalyst source"
      : classification === "Likely Cause"
        ? "Likely cause source"
        : "Backdrop source";

  return {
    mode: "signal_event",
    item_id: "sig_public",
    classification,
    confidence: "medium",
    headline: "Signal context",
    collapsed_summary: "Short signal context.",
    source_free_signal_insight: null as string | null,
    context_details: "Long signal context.",
    why_this_classification: "A public source matched the event context.",
    source_support: classification === "No Clear Cause" ? "none" : "medium",
    source_timing_alignment:
      classification === "No Clear Cause" ? "none" : "same_day",
    sources:
      classification === "No Clear Cause"
        ? []
        : [
            {
              title: "Crypto market context",
              publisher: "Reuters",
              url: sourceUrl,
              published_at: "2026-06-19T14:30:00.000Z",
              catalyst_time_utc: "2026-06-19T14:05:00.000Z",
              tag,
              why_relevant: "Time aligned.",
            },
          ],
    rejected_or_ignored_source_notes: [],
    validation_flags: { generic_commentary_only: false },
    detector_feedback: { event_quality: "keep" },
  };
}

function dailyResult() {
  return {
    mode: "daily_overview",
    item_id: "daily_2026-06-19",
    date_utc: "2026-06-19",
    confidence: "medium",
    headline: "Daily context",
    collapsed_summary: "Short daily context.",
    context_details: "Long daily context.",
    market_tone_summary: "Volatile day.",
    notable_drivers: [
      {
        driver: "Macro backdrop",
        source_support: "medium",
        why_relevant: "Same-day context.",
      },
    ],
    sources: [
      {
        title: "Daily crypto market context",
        publisher: "CoinDesk",
        url: "https://www.coindesk.com/markets/2026/06/19/daily-context/",
        published_at: "2026-06-19T18:00:00.000Z",
        tag: "Main daily context source",
        why_relevant: "Same-day daily context.",
      },
    ],
    validation_flags: { no_major_driver_found: false },
    detector_feedback: { daily_overview_quality: "useful" },
  };
}

function okResult(json: unknown, searchesUsed = 1): ClaudeClientResult {
  return {
    ok: true,
    parsed: {
      json,
      text: JSON.stringify(json),
      citations: [],
      metadata: {
        searches_used: searchesUsed,
        claude_model: "claude-test-model",
        tool_type: "web_search_20250305",
        max_uses: searchesUsed,
        error_code: null,
        generated_at: "2026-06-21T12:00:00.000Z",
      },
      retryable: false,
      error_message: null,
    },
  };
}

function maxUsesExceededWithJsonResult(
  json: unknown,
  searchesUsed = 2,
): ClaudeClientResult {
  return {
    ok: true,
    parsed: {
      json,
      text: JSON.stringify(json),
      citations: [],
      metadata: {
        searches_used: searchesUsed,
        claude_model: "claude-test-model",
        tool_type: "web_search_20250305",
        max_uses: searchesUsed,
        error_code: "max_uses_exceeded",
        generated_at: "2026-06-21T12:00:00.000Z",
      },
      retryable: false,
      error_message: null,
    },
  };
}

function errorResult(errorCode: "max_uses_exceeded" | "parse_error") {
  return {
    ok: false,
    parsed: {
      json: null,
      text: "",
      citations: [],
      metadata: {
        searches_used: 0,
        claude_model: "claude-test-model",
        tool_type: "web_search_20250305",
        max_uses: 1,
        error_code: errorCode,
        generated_at: "2026-06-21T12:00:00.000Z",
      },
      retryable: false,
      error_message: "mocked Claude error",
    },
  } satisfies ClaudeClientResult;
}

test("v0.2 Claude flags default disabled", () => {
  assert.equal(isClaudeEnrichmentV02Enabled(env()), false);
  assert.equal(
    isClaudeEnrichmentV02Enabled(env({ ENABLE_SIGNAL_CLAUDE_V02: "true" })),
    true,
  );
  assert.equal(
    isClaudeEnrichmentV02Enabled(env({ ENABLE_DAILY_CLAUDE: "true" })),
    true,
  );
});

test("v0.2 target selection respects flags, ordering, limit, and terminal briefs", async () => {
  const { db } = createMemoryD1({
    signal_events_v02: [
      signalEvent("sig_public", "2026-06-19T14:00:00.000Z"),
      signalEvent("sig_hidden", "2026-06-19T16:00:00.000Z", 0),
    ],
    signal_event_symbols_v02: [signalSymbol("sig_public")],
    daily_overviews_v02: [dailyOverview()],
    market_stories_v02: [marketStory()],
    audit_events_v02: [auditEvent()],
    claude_briefs_v02: [
      {
        id: "brief_done",
        target_type: "daily_overview_v02",
        target_id: "daily_2026-06-19",
        prompt_mode: "daily_overview",
        status: "brief_ready",
        public_label: null,
        classification: null,
        confidence: "medium",
        headline: "Done",
        collapsed_summary: "Done",
        context_details: "Done",
        source_support: "medium",
        source_timing_alignment: null,
        validation_flags_json: "{}",
        detector_feedback_json: "{}",
        prompt_version: "v02-test",
        model: "claude-test",
        error_code: null,
        error_message: null,
        created_at: "2026-06-19T00:00:00.000Z",
        updated_at: "2026-06-19T00:00:00.000Z",
      },
    ],
  });
  const targets = await selectClaudeEnrichmentTargetsV02(
    db,
    env({
      DB: db,
      ENABLE_SIGNAL_CLAUDE_V02: "true",
      ENABLE_DAILY_CLAUDE: "true",
    }),
    { now, limit: 5 },
  );

  assert.deepEqual(
    targets.map((target) => target.target_id),
    ["sig_public"],
  );
  assert.equal(JSON.stringify(targets).includes("story_public"), false);
  assert.equal(JSON.stringify(targets).includes("audit_hidden"), false);
});

test("v0.2 target selection can be bounded by sample kind and IDs", async () => {
  const { db } = createMemoryD1({
    signal_events_v02: [
      signalEvent("sig_first", "2026-06-19T14:00:00.000Z"),
      signalEvent("sig_second", "2026-06-19T16:00:00.000Z"),
    ],
    signal_event_symbols_v02: [
      signalSymbol("sig_first"),
      signalSymbol("sig_second"),
    ],
    daily_overviews_v02: [dailyOverview()],
  });
  const testEnv = env({
    DB: db,
    ENABLE_SIGNAL_CLAUDE_V02: "true",
    ENABLE_DAILY_CLAUDE: "true",
  });
  const signalTargets = await selectClaudeEnrichmentTargetsV02(db, testEnv, {
    now,
    limit: 5,
    targetKinds: ["signal"],
    targetIds: ["sig_first"],
  });
  const dailyTargets = await selectClaudeEnrichmentTargetsV02(db, testEnv, {
    now,
    limit: 5,
    targetKinds: ["daily"],
  });

  assert.deepEqual(
    signalTargets.map((target) => target.target_id),
    ["sig_first"],
  );
  assert.deepEqual(
    dailyTargets.map((target) => target.target_id),
    ["daily_2026-06-19"],
  );
  assert.equal(
    dailyTargets.every((target) => target.target_type === "daily_overview_v02"),
    true,
  );
});

test("v0.2 sample target selection can bypass scheduled flags", async () => {
  const { db } = createMemoryD1({
    signal_events_v02: [signalEvent("sig_sample", "2026-06-19T14:00:00.000Z")],
    signal_event_symbols_v02: [signalSymbol("sig_sample")],
    daily_overviews_v02: [dailyOverview()],
  });
  const testEnv = env({
    DB: db,
    ENABLE_SIGNAL_CLAUDE_V02: "false",
    ENABLE_DAILY_CLAUDE: "false",
  });
  const scheduledTargets = await selectClaudeEnrichmentTargetsV02(db, testEnv, {
    now,
    limit: 5,
    targetKinds: ["signal"],
  });
  const sampleTargets = await selectClaudeEnrichmentTargetsV02(db, testEnv, {
    now,
    limit: 5,
    targetKinds: ["signal"],
    bypassScheduleFlags: true,
  });

  assert.equal(scheduledTargets.length, 0);
  assert.deepEqual(
    sampleTargets.map((target) => target.target_id),
    ["sig_sample"],
  );
});

test("v0.2 target selection skips processing targets", async () => {
  const { db } = createMemoryD1({
    signal_events_v02: [
      signalEvent("sig_processing", "2026-06-19T14:00:00.000Z"),
    ],
    signal_event_symbols_v02: [signalSymbol("sig_processing")],
    claude_briefs_v02: [
      {
        id: "brief_processing",
        target_type: "signal_event_v02",
        target_id: "sig_processing",
        prompt_mode: "signal_event",
        status: "processing",
        public_label: null,
        classification: null,
        confidence: null,
        headline: null,
        collapsed_summary: null,
        context_details: null,
        source_support: null,
        source_timing_alignment: null,
        validation_flags_json: "{}",
        detector_feedback_json: "{}",
        prompt_version: "v02-test",
        model: "claude-test",
        error_code: null,
        error_message: null,
        created_at: "2026-06-19T14:01:00.000Z",
        updated_at: "2026-06-19T14:01:00.000Z",
      },
    ],
  });
  const targets = await selectClaudeEnrichmentTargetsV02(
    db,
    env({
      DB: db,
      ENABLE_SIGNAL_CLAUDE_V02: "true",
    }),
    { now, limit: 5 },
  );

  assert.equal(targets.length, 0);
});

test("v0.2 enrichment writes Signal Event brief and sources only to v0.2 tables", async () => {
  const { db, tables } = createMemoryD1({
    signal_events_v02: [signalEvent("sig_public", "2026-06-19T14:00:00.000Z")],
    signal_event_symbols_v02: [signalSymbol("sig_public")],
    market_stories_v02: [marketStory()],
    audit_events_v02: [auditEvent()],
  });
  const mock = new MockClaudeClient([okResult(signalResult())]);
  const result = await runClaudeEnrichmentV02(
    db,
    env({
      DB: db,
      ENABLE_SIGNAL_CLAUDE_V02: "true",
      ENABLE_DAILY_CLAUDE: "false",
    }),
    { now, client: mock },
  );

  assert.equal(result.status, "success");
  assert.equal(result.signal_processed, 1);
  assert.equal(result.daily_processed, 0);
  assert.equal(tables.claude_briefs_v02.length, 1);
  assert.equal(tables.claude_briefs_v02[0].target_type, "signal_event_v02");
  assert.equal(tables.claude_briefs_v02[0].status, "brief_ready");
  assert.equal(tables.source_references_v02.length, 1);
  assert.equal(tables.source_references_v02[0].brief_id, null);
  assert.equal(
    tables.source_references_v02[0].brief_v02_id,
    tables.claude_briefs_v02[0].id,
  );
  assert.equal(tables.claude_briefs.length, 0);
  assert.equal(tables.source_references.length, 0);
  assert.equal(
    JSON.stringify(tables.claude_briefs_v02).includes("story"),
    false,
  );
  assert.equal(mock.requests.length, 1);

  // Rules + output schema live in the system prompt; the user prompt is the payload only.
  const request = mock.requests[0];
  assert.match(request.system_prompt, /Allowed classifications/);
  assert.match(request.system_prompt, /Required output shape/);
  assert.match(request.user_prompt, /Signal Event payload:/);
  assert.doesNotMatch(request.user_prompt, /Allowed classifications/);
});

test("v0.2 admin sample run works with scheduled flags disabled", async () => {
  const { db, tables } = createMemoryD1({
    signal_events_v02: [signalEvent("sig_sample", "2026-06-19T14:00:00.000Z")],
    signal_event_symbols_v02: [signalSymbol("sig_sample")],
  });
  const mock = new MockClaudeClient([okResult(signalResult())]);
  const result = await runClaudeEnrichmentV02(
    db,
    env({
      DB: db,
      ENABLE_SIGNAL_CLAUDE_V02: "false",
      ENABLE_DAILY_CLAUDE: "false",
    }),
    {
      now,
      client: mock,
      targetKinds: ["signal"],
      bypassScheduleFlags: true,
      runSource: "admin_sample",
    },
  );

  assert.equal(result.status, "success");
  assert.equal(result.claimed_count, 1);
  assert.equal(result.signal_processed, 1);
  assert.equal(tables.claude_briefs_v02.length, 1);
  assert.equal(tables.claude_briefs_v02[0].target_type, "signal_event_v02");
  assert.equal(
    tables.job_runs[0].metadata_json.includes('"bypass_schedule_flags":true'),
    true,
  );
  assert.equal(
    tables.job_runs[0].metadata_json.includes('"run_source":"admin_sample"'),
    true,
  );
});

test("v0.2 admin Daily sample works with scheduled flags disabled", async () => {
  const { db, tables } = createMemoryD1({
    daily_overviews_v02: [dailyOverview()],
  });
  const mock = new MockClaudeClient([okResult(dailyResult())]);
  const result = await runClaudeEnrichmentV02(
    db,
    env({
      DB: db,
      ENABLE_SIGNAL_CLAUDE_V02: "false",
      ENABLE_DAILY_CLAUDE: "false",
    }),
    {
      now,
      client: mock,
      targetKinds: ["daily"],
      bypassScheduleFlags: true,
      runSource: "admin_sample",
    },
  );

  assert.equal(result.status, "success");
  assert.equal(result.claimed_count, 1);
  assert.equal(result.daily_processed, 1);
  assert.equal(tables.claude_briefs_v02.length, 1);
  assert.equal(tables.claude_briefs_v02[0].target_type, "daily_overview_v02");
  assert.equal(
    tables.job_runs[0].metadata_json.includes('"bypass_schedule_flags":true'),
    true,
  );
  assert.equal(
    tables.job_runs[0].metadata_json.includes('"run_source":"admin_sample"'),
    true,
  );
});

test("v0.2 enrichment claim prevents duplicate processing windows", async () => {
  const { db, tables } = createMemoryD1({
    signal_events_v02: [signalEvent("sig_claimed", "2026-06-19T14:00:00.000Z")],
    signal_event_symbols_v02: [signalSymbol("sig_claimed")],
    claude_briefs_v02: [
      {
        id: "brief_claimed",
        target_type: "signal_event_v02",
        target_id: "sig_claimed",
        prompt_mode: "signal_event",
        status: "processing",
        public_label: null,
        classification: null,
        confidence: null,
        headline: null,
        collapsed_summary: null,
        context_details: null,
        source_support: null,
        source_timing_alignment: null,
        validation_flags_json: "{}",
        detector_feedback_json: "{}",
        prompt_version: "v02-test",
        model: "claude-test",
        error_code: null,
        error_message: null,
        created_at: "2026-06-19T14:01:00.000Z",
        updated_at: "2026-06-19T14:01:00.000Z",
      },
    ],
  });
  const mock = new MockClaudeClient([okResult(signalResult())]);
  const result = await runClaudeEnrichmentV02(
    db,
    env({
      DB: db,
      ENABLE_SIGNAL_CLAUDE_V02: "true",
    }),
    {
      now,
      client: mock,
      targetIds: ["sig_claimed"],
      targetKinds: ["signal"],
    },
  );

  assert.equal(result.status, "skipped");
  assert.equal(result.processed, 0);
  assert.equal(result.skipped_processing_count, 0);
  assert.equal(mock.requests.length, 0);
  assert.equal(tables.claude_briefs_v02[0].status, "processing");
});

test("v0.2 enrichment sample filters prevent accidental other-mode processing", async () => {
  const { db, tables } = createMemoryD1({
    signal_events_v02: [signalEvent("sig_public", "2026-06-19T14:00:00.000Z")],
    signal_event_symbols_v02: [signalSymbol("sig_public")],
    daily_overviews_v02: [dailyOverview()],
  });
  const mock = new MockClaudeClient([okResult(dailyResult())]);
  const result = await runClaudeEnrichmentV02(
    db,
    env({
      DB: db,
      ENABLE_SIGNAL_CLAUDE_V02: "true",
      ENABLE_DAILY_CLAUDE: "true",
    }),
    { now, client: mock, targetKinds: ["daily"], limit: 5 },
  );

  assert.equal(result.signal_processed, 0);
  assert.equal(result.daily_processed, 1);
  assert.equal(tables.claude_briefs_v02.length, 1);
  assert.equal(tables.claude_briefs_v02[0].target_type, "daily_overview_v02");
  assert.equal(
    JSON.stringify(tables.claude_briefs_v02).includes("sig_public"),
    false,
  );
});

test("v0.2 enrichment replaces Signal news copy when no accepted source survives policy", async () => {
  const { db, tables } = createMemoryD1({
    signal_events_v02: [signalEvent("sig_public", "2026-06-19T14:00:00.000Z")],
    signal_event_symbols_v02: [signalSymbol("sig_public")],
  });
  const staleNewsResult = signalResult("Likely Cause");
  staleNewsResult.headline = "Fed news drove the move";
  staleNewsResult.collapsed_summary =
    "Reuters reported a Fed catalyst and Binance news around this Signal Event.";
  staleNewsResult.sources = [
    {
      title: "Old catalyst recap",
      publisher: "Reuters",
      url: "https://www.reuters.com/markets/2026/06/17/old-catalyst-recap/",
      published_at: "2026-06-17T02:00:00.000Z",
      catalyst_time_utc: "2026-06-17T02:00:00.000Z",
      tag: "Likely cause source",
      why_relevant: "Older macro context from a prior UTC day.",
    },
  ];
  const mock = new MockClaudeClient([okResult(staleNewsResult)]);
  const result = await runClaudeEnrichmentV02(
    db,
    env({
      DB: db,
      ENABLE_SIGNAL_CLAUDE_V02: "true",
      ENABLE_DAILY_CLAUDE: "false",
    }),
    { now, client: mock },
  );

  assert.equal(result.status, "success");
  assert.equal(tables.claude_briefs_v02.length, 1);
  const brief = tables.claude_briefs_v02[0];
  assert.equal(brief.status, "no_clear_cause");
  assert.equal(brief.headline, "No clear public catalyst");
  assert.match(
    brief.collapsed_summary ?? "",
    /range break upside pressure across 4 of 5 tracked symbols/,
  );
  assert.match(brief.collapsed_summary ?? "", /BTCUSDT leading the move/);
  assert.match(brief.collapsed_summary ?? "", /average move of \+1\.80%/);
  assert.doesNotMatch(brief.collapsed_summary ?? "", /Signal Event reads as/);
  assert.doesNotMatch(brief.collapsed_summary ?? "", /Avg Change/);
  assert.equal(
    /source|article|publisher|Reuters|Fed news/i.test(
      brief.collapsed_summary ?? "",
    ),
    false,
  );
  assert.equal(tables.source_references_v02.length, 1);
  assert.equal(tables.source_references_v02[0].accepted, 0);
  assert.equal(
    tables.source_references_v02[0].rejection_reason,
    "signal_source_outside_6h_event_window",
  );
});

test("v0.2 enrichment preserves genuine Signal No Clear Cause analysis without accepted sources", async () => {
  const { db, tables } = createMemoryD1({
    signal_events_v02: [signalEvent("sig_public", "2026-06-19T14:00:00.000Z")],
    signal_event_symbols_v02: [signalSymbol("sig_public")],
  });
  const noClearCause = signalResult("No Clear Cause");
  noClearCause.headline = "No clear cause in public context";
  noClearCause.collapsed_summary =
    "Claude did not identify a reliable public driver for this Signal Event.";
  noClearCause.why_this_classification =
    "No reliable external driver was identified for this Signal Event.";
  const mock = new MockClaudeClient([okResult(noClearCause)]);
  const result = await runClaudeEnrichmentV02(
    db,
    env({
      DB: db,
      ENABLE_SIGNAL_CLAUDE_V02: "true",
      ENABLE_DAILY_CLAUDE: "false",
    }),
    { now, client: mock },
  );

  assert.equal(result.status, "success");
  assert.equal(tables.claude_briefs_v02.length, 1);
  const brief = tables.claude_briefs_v02[0];
  assert.equal(brief.status, "no_clear_cause");
  assert.equal(brief.classification, "No Clear Cause");
  assert.equal(brief.headline, "No clear cause in public context");
  assert.match(brief.collapsed_summary ?? "", /reliable public driver/);
  assert.equal(brief.source_support, "none");
  assert.equal(brief.source_timing_alignment, "none");
  assert.equal(tables.source_references_v02.length, 0);
});

test("v0.2 enrichment uses Claude source-free Signal insight after source policy rejects rows", async () => {
  const { db, tables } = createMemoryD1({
    signal_events_v02: [signalEvent("sig_public", "2026-06-19T14:00:00.000Z")],
    signal_event_symbols_v02: [signalSymbol("sig_public")],
  });
  const noClearCause = signalResult("No Clear Cause");
  noClearCause.headline = "No time-aligned public source";
  noClearCause.collapsed_summary =
    "No time-aligned public source was accepted for this signal event. Reuters described a possible Fed catalyst in an older article.";
  noClearCause.context_details =
    "Reuters and other articles did not line up with this Signal Event.";
  noClearCause.source_free_signal_insight =
    "The move reads as downside pressure with SOLUSDT setting the pace while breadth across the basket confirms the detector signal; the external driver remains unconfirmed.";
  noClearCause.sources = [
    {
      title: "Old catalyst recap",
      publisher: "Reuters",
      url: "https://www.reuters.com/markets/2026/06/17/old-catalyst-recap/",
      published_at: "2026-06-17T02:00:00.000Z",
      catalyst_time_utc: "2026-06-17T02:00:00.000Z",
      tag: "Backdrop source",
      why_relevant: "Older macro context from a prior UTC day.",
    },
  ];
  const mock = new MockClaudeClient([okResult(noClearCause)]);
  const result = await runClaudeEnrichmentV02(
    db,
    env({
      DB: db,
      ENABLE_SIGNAL_CLAUDE_V02: "true",
      ENABLE_DAILY_CLAUDE: "false",
    }),
    { now, client: mock },
  );

  assert.equal(result.status, "success");
  assert.equal(tables.claude_briefs_v02.length, 1);
  const brief = tables.claude_briefs_v02[0];
  assert.equal(brief.status, "no_clear_cause");
  assert.equal(brief.headline, "No clear public catalyst");
  assert.match(brief.collapsed_summary ?? "", /SOLUSDT setting the pace/);
  assert.match(
    brief.collapsed_summary ?? "",
    /external driver remains unconfirmed/,
  );
  assert.doesNotMatch(brief.collapsed_summary ?? "", /Signal Event reads as/);
  assert.equal(
    /source|article|publisher|Reuters|Fed/i.test(
      `${brief.headline} ${brief.collapsed_summary} ${brief.context_details ?? ""}`,
    ),
    false,
  );
  assert.equal(brief.context_details, null);
  assert.equal(
    JSON.parse(brief.validation_flags_json)
      .source_policy_used_source_free_signal_insight,
    true,
  );
  assert.equal(tables.source_references_v02.length, 1);
  assert.equal(tables.source_references_v02[0].accepted, 0);
});

test("v0.2 enrichment keeps Market Backdrop with a nearby Backdrop source", async () => {
  const { db, tables } = createMemoryD1({
    signal_events_v02: [signalEvent("sig_public", "2026-06-19T14:00:00.000Z")],
    signal_event_symbols_v02: [signalSymbol("sig_public")],
  });
  const backdrop = signalResult("Market Backdrop");
  backdrop.headline = "Market backdrop around the move";
  backdrop.collapsed_summary =
    "A near next-day recap described same-day risk-off conditions around the Signal Event.";
  backdrop.context_details = "";
  backdrop.sources = [
    {
      title: "Next-day risk recap",
      publisher: "Yahoo Finance",
      url: "https://finance.yahoo.com/markets/crypto/articles/next-day-risk-recap.html",
      published_at: "2026-06-20T02:00:00.000Z",
      catalyst_time_utc: "",
      tag: "Backdrop source",
      why_relevant:
        "Near next-day recap of the same UTC-day move without a pinpoint catalyst time.",
    },
  ];
  const mock = new MockClaudeClient([okResult(backdrop)]);
  const result = await runClaudeEnrichmentV02(
    db,
    env({
      DB: db,
      ENABLE_SIGNAL_CLAUDE_V02: "true",
      ENABLE_DAILY_CLAUDE: "false",
    }),
    { now, client: mock },
  );

  assert.equal(result.status, "success");
  assert.equal(result.context_only_count, 1);
  assert.equal(tables.claude_briefs_v02.length, 1);
  assert.equal(tables.claude_briefs_v02[0].status, "context_only");
  assert.equal(tables.claude_briefs_v02[0].public_label, "Market Backdrop");
  assert.equal(tables.claude_briefs_v02[0].classification, "Market Backdrop");
  assert.equal(tables.source_references_v02.length, 1);
  assert.equal(tables.source_references_v02[0].accepted, 1);
  assert.equal(tables.source_references_v02[0].source_role, "Backdrop source");
  assert.match(
    tables.source_references_v02[0].metadata_json,
    /signal_source_nearby_backdrop_recap/,
  );
});

test("v0.2 enrichment writes Daily Overview brief and sources only when daily flag is enabled", async () => {
  const { db, tables } = createMemoryD1({
    daily_overviews_v02: [dailyOverview()],
    market_stories_v02: [marketStory()],
  });
  const mock = new MockClaudeClient([okResult(dailyResult())]);
  const result = await runClaudeEnrichmentV02(
    db,
    env({
      DB: db,
      ENABLE_DAILY_CLAUDE: "true",
      ENABLE_SIGNAL_CLAUDE_V02: "false",
    }),
    { now, client: mock },
  );

  assert.equal(result.status, "success");
  assert.equal(result.signal_processed, 0);
  assert.equal(result.daily_processed, 1);
  assert.equal(tables.claude_briefs_v02[0].target_type, "daily_overview_v02");
  assert.equal(tables.claude_briefs_v02[0].public_label, null);
  assert.equal(tables.claude_briefs_v02[0].classification, null);
  assert.equal(
    tables.source_references_v02[0].target_type,
    "daily_overview_v02",
  );
  assert.equal(tables.claude_briefs.length, 0);
  assert.equal(tables.source_references.length, 0);
});

test("v0.2 Daily enrichment rejects public web-search-limit copy as retryable", async () => {
  const { db, tables } = createMemoryD1({
    daily_overviews_v02: [dailyOverview()],
    market_stories_v02: [marketStory()],
  });
  const limitedDaily = dailyResult();
  limitedDaily.collapsed_summary =
    "External source validation could not be completed this session due to a web search tool limit error.";
  const mock = new MockClaudeClient([okResult(limitedDaily)]);
  const result = await runClaudeEnrichmentV02(
    db,
    env({
      DB: db,
      ENABLE_DAILY_CLAUDE: "true",
      ENABLE_SIGNAL_CLAUDE_V02: "false",
    }),
    { now, client: mock },
  );

  assert.equal(result.status, "failed");
  assert.equal(result.daily_processed, 1);
  assert.equal(result.brief_ready_count, 0);
  assert.equal(result.failed_retryable_count, 1);
  assert.equal(tables.claude_briefs_v02.length, 1);
  assert.equal(tables.claude_briefs_v02[0].target_type, "daily_overview_v02");
  assert.equal(tables.claude_briefs_v02[0].status, "failed_retryable");
  assert.equal(tables.claude_briefs_v02[0].error_code, "validation_error");
  assert.equal(tables.claude_briefs_v02[0].collapsed_summary, null);
  assert.equal(tables.source_references_v02.length, 0);
});

test("v0.2 enrichment skips safely when API key is missing", async () => {
  const { db, tables } = createMemoryD1({
    signal_events_v02: [signalEvent("sig_public", "2026-06-19T14:00:00.000Z")],
    signal_event_symbols_v02: [signalSymbol("sig_public")],
  });
  const result = await runClaudeEnrichmentV02(
    db,
    env({
      DB: db,
      ANTHROPIC_API_KEY: "",
      ENABLE_SIGNAL_CLAUDE_V02: "true",
    }),
    { now },
  );

  assert.equal(result.status, "skipped");
  assert.equal(result.processed, 0);
  assert.equal(tables.claude_briefs_v02.length, 0);
  assert.equal(
    tables.job_runs.some((row) => row.job_name === "claude_enrichment_v02"),
    true,
  );
});

test("max_uses_exceeded without usable JSON is retryable and not Claude Limited", async () => {
  const { db, tables } = createMemoryD1({
    signal_events_v02: [signalEvent("sig_public", "2026-06-19T14:00:00.000Z")],
    signal_event_symbols_v02: [signalSymbol("sig_public")],
  });
  const mock = new MockClaudeClient([errorResult("max_uses_exceeded")]);
  const result = await runClaudeEnrichmentV02(
    db,
    env({
      DB: db,
      ENABLE_SIGNAL_CLAUDE_V02: "true",
    }),
    { now, client: mock },
  );

  assert.equal(result.claude_limited_count, 0);
  assert.equal(result.failed_retryable_count, 1);
  assert.equal(tables.claude_briefs_v02[0].status, "failed_retryable");
  assert.equal(tables.claude_briefs_v02[0].public_label, null);
  assert.equal(tables.claude_briefs_v02[0].classification, null);
  assert.equal(tables.claude_briefs.length, 0);
});

test("max_uses_exceeded with usable JSON persists the available result", async () => {
  const { db, tables } = createMemoryD1({
    signal_events_v02: [signalEvent("sig_public", "2026-06-19T14:00:00.000Z")],
    signal_event_symbols_v02: [signalSymbol("sig_public")],
  });
  const mock = new MockClaudeClient([
    maxUsesExceededWithJsonResult(signalResult("Likely Cause")),
  ]);
  const result = await runClaudeEnrichmentV02(
    db,
    env({
      DB: db,
      ENABLE_SIGNAL_CLAUDE_V02: "true",
    }),
    { now, client: mock },
  );

  assert.equal(result.brief_ready_count, 1);
  assert.equal(result.claude_limited_count, 0);
  assert.equal(result.failed_retryable_count, 0);
  assert.equal(tables.claude_briefs_v02[0].status, "brief_ready");
  assert.equal(tables.claude_briefs_v02[0].public_label, "Likely Cause");
  assert.equal(tables.source_references_v02.length, 1);
  assert.equal(tables.claude_briefs.length, 0);
  assert.equal(tables.source_references.length, 0);
});

test("source policy downgrades Signal cause labels when accepted cause sources do not remain", async () => {
  const { db, tables } = createMemoryD1({
    signal_events_v02: [signalEvent("sig_public", "2026-06-19T14:00:00.000Z")],
    signal_event_symbols_v02: [signalSymbol("sig_public")],
  });
  const mock = new MockClaudeClient([
    okResult(signalResult("Likely Cause", "https://www.coindesk.com/")),
  ]);
  const result = await runClaudeEnrichmentV02(
    db,
    env({
      DB: db,
      ENABLE_SIGNAL_CLAUDE_V02: "true",
    }),
    { now, client: mock },
  );

  assert.equal(result.no_clear_cause_count, 1);
  assert.equal(tables.claude_briefs_v02[0].status, "no_clear_cause");
  assert.equal(tables.claude_briefs_v02[0].public_label, "No Clear Cause");
  assert.equal(tables.source_references_v02[0].accepted, 0);
});

test("source policy rejects stale Signal cause sources outside the 6-hour event window", async () => {
  const { db, tables } = createMemoryD1({
    signal_events_v02: [signalEvent("sig_public", "2026-06-19T14:00:00.000Z")],
    signal_event_symbols_v02: [signalSymbol("sig_public")],
  });
  const staleResult = signalResult("Focused Cause");
  staleResult.sources[0].published_at = "2026-06-17T02:00:00.000Z";
  staleResult.sources[0].catalyst_time_utc = "2026-06-17T02:00:00.000Z";
  staleResult.sources[0].why_relevant =
    "Older macro context from a prior UTC day that does not align with the window.";
  const mock = new MockClaudeClient([okResult(staleResult)]);
  const result = await runClaudeEnrichmentV02(
    db,
    env({
      DB: db,
      ENABLE_SIGNAL_CLAUDE_V02: "true",
    }),
    { now, client: mock },
  );

  assert.equal(result.no_clear_cause_count, 1);
  assert.equal(tables.claude_briefs_v02[0].status, "no_clear_cause");
  assert.equal(tables.claude_briefs_v02[0].public_label, "No Clear Cause");
  assert.equal(tables.source_references_v02[0].accepted, 0);
  assert.equal(tables.source_references_v02[0].source_role, "Backdrop source");
  assert.match(
    tables.source_references_v02[0].metadata_json,
    /signal_source_outside_6h_event_window/,
  );
});

test("invalid v0.2 Claude JSON fails safely without fake brief or source rows", async () => {
  const { db, tables } = createMemoryD1({
    signal_events_v02: [signalEvent("sig_public", "2026-06-19T14:00:00.000Z")],
    signal_event_symbols_v02: [signalSymbol("sig_public")],
  });
  const mock = new MockClaudeClient([
    okResult({
      ...signalResult("Focused Cause"),
      sources: [],
    }),
  ]);
  const result = await runClaudeEnrichmentV02(
    db,
    env({
      DB: db,
      ENABLE_SIGNAL_CLAUDE_V02: "true",
    }),
    { now, client: mock },
  );

  assert.equal(result.failed_retryable_count, 1);
  assert.equal(tables.claude_briefs_v02[0].status, "failed_retryable");
  assert.equal(tables.claude_briefs_v02[0].error_code, "validation_error");
  assert.equal(tables.source_references_v02.length, 0);
});

test("repeated v0.2 enrichment is idempotent for brief and source rows", async () => {
  const { db, tables } = createMemoryD1({
    signal_events_v02: [signalEvent("sig_public", "2026-06-19T14:00:00.000Z")],
    signal_event_symbols_v02: [signalSymbol("sig_public")],
  });
  const first = new MockClaudeClient([okResult(signalResult())]);
  const second = new MockClaudeClient([okResult(signalResult())]);
  const testEnv = env({
    DB: db,
    ENABLE_SIGNAL_CLAUDE_V02: "true",
  });

  await runClaudeEnrichmentV02(db, testEnv, { now, client: first });
  await runClaudeEnrichmentV02(db, testEnv, {
    now,
    client: second,
    limit: 5,
  });

  assert.equal(tables.claude_briefs_v02.length, 1);
  assert.equal(tables.source_references_v02.length, 1);
  assert.equal(second.requests.length, 0);
});
