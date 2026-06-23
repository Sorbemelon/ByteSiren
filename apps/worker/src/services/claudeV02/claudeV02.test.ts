import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryD1 } from "../../test/d1Memory.ts";
import {
  buildDailyOverviewClaudePayloadsV02,
  buildDailyOverviewSystemPromptV02,
  buildDailyOverviewUserPromptV02,
  buildSignalEventClaudePayloadsV02,
  buildSignalEventSystemPromptV02,
  buildSignalEventUserPromptV02,
  MAX_PUBLIC_SOURCES_PER_BRIEF_V02,
  toSourceReferenceInputsV02,
  validateClaudeResultV02,
  validateDailyOverviewClaudeResultV02,
  validateSignalEventClaudeResultV02,
} from "./index.ts";

const now = new Date("2026-06-21T12:00:00.000Z");

function signalEvent(id = "sig_public") {
  return {
    id,
    date_utc: "2026-06-19",
    event_start: "2026-06-19T14:00:00.000Z",
    event_end: "2026-06-19T14:45:00.000Z",
    duration_min: 45,
    peak_time: "2026-06-19T14:15:00.000Z",
    direction: "observed_up",
    signals_count: 4,
    n_tracked: 5,
    avg_change_pct: 1.8,
    avg_change_method: "median_participating_symbols",
    event_strength_score: 84,
    impact_label: "High",
    chart_context_score: 88,
    chart_context_label: "Strong chart context",
    event_story_type: "range_break_up",
    trend_context: "trend_up",
    momentum_context: "impulse",
    volatility_context: "volatility_expansion",
    event_range_context: "broad_broke_high",
    chart_context_reasons_json: JSON.stringify(["broad range break"]),
    chart_context_warnings_json: JSON.stringify([]),
    macro_aligned: 0,
    nearest_macro_event: null,
    macro_delta_min: null,
    source_route_hint: "broad_market",
    publish_candidate: 1,
    publish_reason: "strong chart context",
    suppress_reason: null,
    detector_version: "v02",
    created_at: "2026-06-19T14:00:00.000Z",
    updated_at: "2026-06-19T14:00:00.000Z",
  };
}

function signalSymbol(signalEventId: string, symbol = "BTCUSDT") {
  return {
    id: `${signalEventId}_${symbol}`,
    signal_event_id: signalEventId,
    symbol,
    window_change_pct: 2.1,
    peak_15m_change_pct: 1.2,
    volume_ratio: 2.6,
    range_position: "broke_high",
    prev_24h_high: 100,
    prev_24h_low: 90,
    range_break_direction: "up",
    range_break_pct: 0.8,
    range_break_strength: 0.7,
    distance_to_range_high_pct: 0.1,
    distance_to_range_low_pct: 9.2,
    is_lead_mover: 1,
    is_peak_15m_highlight: 1,
    participated: 1,
    evidence_json: "{}",
    created_at: "2026-06-19T14:00:00.000Z",
    updated_at: "2026-06-19T14:00:00.000Z",
  };
}

function dailyOverview() {
  return {
    id: "daily_2026-06-19",
    date_utc: "2026-06-19",
    day_start: "2026-06-19T00:00:00.000Z",
    day_end: "2026-06-19T23:59:59.999Z",
    market_tone: "volatile",
    daily_change_pct: 2.4,
    daily_change_label: "24h Change",
    market_range_pct: 4.8,
    notable_symbols_json: JSON.stringify(["BTCUSDT", "ETHUSDT"]),
    top_symbol_moves_json: JSON.stringify([{ symbol: "BTCUSDT" }]),
    signal_event_ids_json: JSON.stringify(["sig_public"]),
    market_story_ids_json: JSON.stringify(["story_public"]),
    audit_event_count: 2,
    daily_chart_context_summary_json: JSON.stringify({
      story_count: 1,
    }),
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
    range_context_json: JSON.stringify({ swing_score: 0.42 }),
    trend_context_json: "{}",
    momentum_context_json: "{}",
    volatility_context_json: "{}",
    decision_reasons_json: JSON.stringify(["coherent range break"]),
    included_signal_event_ids_json: JSON.stringify(["sig_public"]),
    included_audit_event_ids_json: JSON.stringify(["audit_strong"]),
    publish_candidate: 1,
    publish_reason: "story criteria",
    suppress_reason: null,
    created_at: "2026-06-19T18:00:00.000Z",
    updated_at: "2026-06-19T18:00:00.000Z",
  };
}

function validSignalResult() {
  return {
    mode: "signal_event",
    item_id: "sig_public",
    classification: "Focused Cause",
    confidence: "high",
    headline: "Source-supported catalyst",
    collapsed_summary: "A source-supported event lined up with the move.",
    context_details: "The public context was time-aligned with the event.",
    why_this_classification: "A focused source matched the event window.",
    source_support: "high",
    source_timing_alignment: "exact",
    sources: [
      {
        title: "Crypto market context",
        publisher: "Reuters",
        url: "https://www.reuters.com/markets/2026/06/19/context/",
        published_at: "2026-06-19T14:20:00.000Z",
        catalyst_time_utc: "2026-06-19T14:05:00.000Z",
        tag: "Focused catalyst source",
        why_relevant: "Time-aligned catalyst context.",
      },
    ],
    rejected_or_ignored_source_notes: [],
    validation_flags: { has_focused_source: true },
    detector_feedback: { event_quality: "keep" },
  };
}

function validDailyResult() {
  return {
    mode: "daily_overview",
    item_id: "daily_2026-06-19",
    date_utc: "2026-06-19",
    confidence: "medium",
    headline: "Daily crypto context",
    collapsed_summary: "The day had broad crypto market context.",
    context_details: "Sources described the day-level context.",
    market_tone_summary: "Volatile but source-supported.",
    notable_drivers: [
      {
        driver: "Macro backdrop",
        source_support: "medium",
        why_relevant: "Same-day public context.",
      },
    ],
    sources: [
      {
        title: "Daily crypto market context",
        publisher: "CoinDesk",
        url: "https://www.coindesk.com/markets/2026/06/19/daily-context/",
        published_at: "2026-06-19T20:00:00.000Z",
        tag: "Main daily context source",
        why_relevant: "Same-day daily context.",
      },
    ],
    validation_flags: { no_major_driver_found: false },
    detector_feedback: { daily_overview_quality: "useful" },
  };
}

test("Signal Event payload builder emits v0.2 evidence labels and chart context", async () => {
  const { db } = createMemoryD1({
    signal_events_v02: [signalEvent()],
    signal_event_symbols_v02: [signalSymbol("sig_public")],
  });
  const payloads = await buildSignalEventClaudePayloadsV02(db, { now });

  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].mode, "signal_event");
  assert.equal(payloads[0].target_type, "signal_event_v02");
  assert.equal(payloads[0].avg_change_label, "Avg Change");
  assert.equal(payloads[0].evidence_window.duration_min, 45);
  assert.equal(
    payloads[0].per_symbol_evidence[0].window_change_label,
    "Window Change",
  );
  assert.equal(
    payloads[0].per_symbol_evidence[0].range_position_label,
    "Range Position",
  );
  assert.equal(
    payloads[0].chart_context.chart_context_label,
    "Strong chart context",
  );
  assert.equal(payloads[0].no_trading_advice, true);
});

test("Daily Overview payload builder emits 24h Change and deterministic Market Story context", async () => {
  const { db } = createMemoryD1({
    daily_overviews_v02: [dailyOverview()],
    market_stories_v02: [marketStory()],
  });
  const payloads = await buildDailyOverviewClaudePayloadsV02(db, { now });

  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].mode, "daily_overview");
  assert.equal(payloads[0].target_type, "daily_overview_v02");
  assert.equal(payloads[0].daily_change_label, "24h Change");
  assert.deepEqual(payloads[0].signal_event_ids_for_day, ["sig_public"]);
  assert.deepEqual(payloads[0].market_story_ids_for_day, ["story_public"]);
  assert.equal(payloads[0].market_stories_for_day[0].id, "story_public");
  assert.equal(payloads[0].market_stories_for_day[0].swing_score, 0.42);
  assert.equal(payloads[0].no_trading_advice, true);
});

test("prompt builders include v0.2 label rules and JSON-only safety", async () => {
  const { db } = createMemoryD1({
    signal_events_v02: [signalEvent()],
    signal_event_symbols_v02: [signalSymbol("sig_public")],
    daily_overviews_v02: [dailyOverview()],
  });
  const signalPayload = (
    await buildSignalEventClaudePayloadsV02(db, { now })
  )[0];
  const dailyPayload = (
    await buildDailyOverviewClaudePayloadsV02(db, { now })
  )[0];
  // Rules and the output schema now live in the static system prompt; the
  // per-item payload is the only thing in the user prompt.
  const signalPrompt = buildSignalEventSystemPromptV02();
  const dailyPrompt = buildDailyOverviewSystemPromptV02();
  const signalUserPrompt = buildSignalEventUserPromptV02(signalPayload);
  const dailyUserPrompt = buildDailyOverviewUserPromptV02(dailyPayload);

  assert.match(signalPrompt, /Focused Cause/);
  assert.match(signalPrompt, /Likely Cause/);
  assert.match(signalPrompt, /Market Backdrop/);
  assert.match(signalPrompt, /No Clear Cause/);
  assert.match(signalPrompt, /Claude Limited/);
  assert.match(signalPrompt, /6 hours before the evidence window start/);
  assert.match(signalPrompt, /published after the Signal Event/i);
  assert.match(
    signalPrompt,
    /Keep article publication time and catalyst\/event time separate/,
  );
  assert.match(
    signalPrompt,
    /published_at is the article's publication timestamp/,
  );
  assert.match(signalPrompt, /never substitute the Signal Event time/);
  assert.match(signalPrompt, /If catalyst_time_utc is unknown/);
  assert.match(
    signalPrompt,
    /publication itself is inside the allowed catalyst window/,
  );
  assert.match(
    signalPrompt,
    /Later recaps without an in-window catalyst_time_utc/,
  );
  assert.match(
    signalPrompt,
    /broad multi-day-old macro context belongs in Daily Overview/,
  );
  assert.match(
    signalPrompt,
    /Sources too far from the event should be omitted or rejected/,
  );
  assert.match(signalPrompt, /Return no more than 3 sources total/);
  assert.match(
    signalPrompt,
    /collapsed_summary may only mention source-backed news or article facts that are supported by one of those returned sources/,
  );
  assert.match(signalPrompt, /catalyst_time_utc/);
  assert.match(signalPrompt, /chart context only as descriptive evidence/i);
  assert.match(signalPrompt, /collapsed_summary is the main public brief/);
  assert.doesNotMatch(signalPrompt, /"context_details"/);
  assert.match(signalPrompt, /Return JSON only/);
  assert.match(dailyPrompt, /Do not generate a Daily Overview label/);
  assert.match(dailyPrompt, /deterministic market_tone/);
  assert.doesNotMatch(dailyPrompt, /Allowed Daily Overview labels/);
  assert.doesNotMatch(dailyPrompt, /daily_label:/);
  assert.match(dailyPrompt, /collapsed_summary is the main public brief/);
  assert.match(dailyPrompt, /Return no more than 3 sources total/);
  assert.match(
    dailyPrompt,
    /collapsed_summary may only mention source-backed news or article facts that are supported by one of those returned sources/,
  );
  assert.doesNotMatch(dailyPrompt, /"context_details"/);
  assert.match(dailyPrompt, /Do not provide trading advice/);

  // Bug 2 hardening: explicit anti-stale-promotion / no-back-dating wording.
  assert.match(
    signalPrompt,
    /Do not back-date it to fit the allowed catalyst window/,
  );
  assert.match(
    signalPrompt,
    /published well before the allowed catalyst window must be a Backdrop source/,
  );

  // Round 2: catalyst recall — require catalyst_time_utc, known macro times,
  // no midnight rounding, and prefer Market Backdrop over No Clear Cause.
  assert.match(signalPrompt, /ALWAYS include catalyst_time_utc/);
  assert.match(signalPrompt, /FOMC rate decisions are announced ~18:00 UTC/);
  assert.match(signalPrompt, /date-level is acceptable/);
  assert.match(signalPrompt, /never move published_at to a different calendar day/i);
  assert.match(signalPrompt, /Prefer Market Backdrop over No Clear Cause/);
  // Daily sourcing must stay within the UTC day.
  assert.match(dailyPrompt, /Sources must fall within this UTC day/);

  // User prompts carry only the payload, not the rules/schema.
  assert.match(signalUserPrompt, /Signal Event payload:/);
  assert.match(signalUserPrompt, new RegExp(signalPayload.target_id));
  assert.doesNotMatch(signalUserPrompt, /Allowed classifications/);
  assert.doesNotMatch(signalUserPrompt, /Return JSON only/);
  assert.match(dailyUserPrompt, /Daily Overview payload:/);
  assert.match(dailyUserPrompt, new RegExp(dailyPayload.target_id));
  assert.doesNotMatch(dailyUserPrompt, /Allowed Daily Overview labels/);
});

test("v0.2 validators accept Signal and Daily results but reject crossed labels and Market Story mode", () => {
  const signal = validateSignalEventClaudeResultV02(validSignalResult());
  const daily = validateDailyOverviewClaudeResultV02(validDailyResult());

  assert.equal(signal.classification, "Focused Cause");
  assert.equal(Object.hasOwn(daily, "daily_label"), false);
  assert.throws(() =>
    validateSignalEventClaudeResultV02({
      ...validSignalResult(),
      classification: "Quiet Day",
    }),
  );
  assert.throws(() =>
    validateDailyOverviewClaudeResultV02({
      ...validDailyResult(),
      daily_label: "Daily Context",
    }),
  );
  assert.throws(() => validateClaudeResultV02({ mode: "market_story" }));
});

test("v0.2 validators allow omitted long context details", () => {
  const signal = validSignalResult();
  const daily = validDailyResult();
  delete (signal as { context_details?: string }).context_details;
  delete (daily as { context_details?: string }).context_details;

  assert.equal(
    validateSignalEventClaudeResultV02(signal).context_details,
    null,
  );
  assert.equal(
    validateDailyOverviewClaudeResultV02(daily).context_details,
    null,
  );
});

test("v0.2 Signal Event cause labels require matching source tags", () => {
  assert.throws(() =>
    validateSignalEventClaudeResultV02({
      ...validSignalResult(),
      classification: "Focused Cause",
      sources: [
        {
          title: "Backdrop",
          publisher: "Reuters",
          url: "https://www.reuters.com/markets/2026/06/19/backdrop/",
          published_at: "2026-06-19T14:20:00.000Z",
          tag: "Backdrop source",
          why_relevant: "Backdrop only.",
        },
      ],
    }),
  );
  assert.throws(() =>
    validateSignalEventClaudeResultV02({
      ...validSignalResult(),
      classification: "Likely Cause",
      sources: [
        {
          title: "Price check",
          publisher: "CoinDesk",
          url: "https://www.coindesk.com/markets/2026/06/19/price-check/",
          published_at: "2026-06-19T14:20:00.000Z",
          tag: "Price check source",
          why_relevant: "Price confirmation only.",
        },
      ],
    }),
  );
});

test("v0.2 source policy rejects root URLs and disallows Market Story targets", () => {
  const signalResult = validateSignalEventClaudeResultV02(validSignalResult());
  const result = toSourceReferenceInputsV02({
    target_type: "signal_event_v02",
    target_id: "sig_public",
    sources: signalResult.sources,
    signalEventWindow: {
      start: "2026-06-19T14:00:00.000Z",
      end: "2026-06-19T14:45:00.000Z",
    },
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].accepted, true);
  assert.equal(result[0].source_role, "Focused catalyst source");
  assert.equal(
    result[0].url,
    "https://www.reuters.com/markets/2026/06/19/context/",
  );
  assert.deepEqual(
    toSourceReferenceInputsV02({
      target_type: "signal_event_v02",
      target_id: "sig_public",
      sources: [
        {
          title: "CoinDesk homepage",
          publisher: "CoinDesk",
          url: "https://www.coindesk.com/",
          published_at: null,
          tag: "Backdrop source",
          why_relevant: "Root URL should be rejected.",
        },
      ],
      includeRejected: true,
    }).map((source) => source.accepted),
    [false],
  );
  assert.throws(() =>
    toSourceReferenceInputsV02({
      target_type: "market_story_v02",
      target_id: "story_public",
      sources: [],
    }),
  );
});

test("v0.2 source policy limits accepted public sources to three by role priority", () => {
  const result = toSourceReferenceInputsV02({
    target_type: "signal_event_v02",
    target_id: "sig_public",
    signalEventWindow: {
      start: "2026-06-19T14:00:00.000Z",
      end: "2026-06-19T14:45:00.000Z",
    },
    sources: [
      {
        title: "Backdrop one",
        publisher: "Reuters",
        url: "https://www.reuters.com/markets/2026/06/19/backdrop-one/",
        published_at: "2026-06-19T14:05:00.000Z",
        tag: "Backdrop source",
        why_relevant: "In-window backdrop.",
      },
      {
        title: "Backdrop two",
        publisher: "CoinDesk",
        url: "https://www.coindesk.com/markets/2026/06/19/backdrop-two/",
        published_at: "2026-06-19T14:10:00.000Z",
        tag: "Backdrop source",
        why_relevant: "In-window backdrop.",
      },
      {
        title: "Likely catalyst",
        publisher: "The Block",
        url: "https://www.theblock.co/post/likely-catalyst",
        published_at: "2026-06-19T14:15:00.000Z",
        catalyst_time_utc: "2026-06-19T14:12:00.000Z",
        tag: "Likely cause source",
        why_relevant: "In-window likely catalyst.",
      },
      {
        title: "Price check",
        publisher: "Cointelegraph",
        url: "https://cointelegraph.com/news/price-check",
        published_at: "2026-06-19T14:20:00.000Z",
        tag: "Price check source",
        why_relevant: "Price check.",
      },
    ],
  });

  assert.equal(result.length, MAX_PUBLIC_SOURCES_PER_BRIEF_V02);
  assert.deepEqual(
    result.map((source) => source.source_role),
    ["Likely cause source", "Backdrop source", "Backdrop source"],
  );
});

test("v0.2 Signal source policy downgrades stale cause sources but allows aligned catalyst time", () => {
  const window = {
    start: "2026-06-19T14:00:00.000Z",
    end: "2026-06-19T14:45:00.000Z",
  };
  const stale = toSourceReferenceInputsV02({
    target_type: "signal_event_v02",
    target_id: "sig_public",
    signalEventWindow: window,
    includeRejected: true,
    sources: [
      {
        title: "Old catalyst recap",
        publisher: "Reuters",
        url: "https://www.reuters.com/markets/2026/06/19/old-catalyst-recap/",
        published_at: "2026-06-17T02:00:00.000Z",
        catalyst_time_utc: "2026-06-17T02:00:00.000Z",
        tag: "Likely cause source",
        why_relevant: "Older macro context from a prior UTC day.",
      },
    ],
  });
  const postEventArticle = toSourceReferenceInputsV02({
    target_type: "signal_event_v02",
    target_id: "sig_public",
    signalEventWindow: window,
    sources: [
      {
        title: "Post-event catalyst report",
        publisher: "Reuters",
        url: "https://www.reuters.com/markets/2026/06/19/post-event-catalyst/",
        published_at: "2026-06-19T18:00:00.000Z",
        catalyst_time_utc: "2026-06-19T13:30:00.000Z",
        tag: "Focused catalyst source",
        why_relevant:
          "Published later, but describes a catalyst inside the 6-hour event window.",
      },
    ],
  });
  const postEventArticleWithoutCatalystTime = toSourceReferenceInputsV02({
    target_type: "signal_event_v02",
    target_id: "sig_public",
    signalEventWindow: window,
    includeRejected: true,
    sources: [
      {
        title: "Post-event recap without catalyst time",
        publisher: "Reuters",
        url: "https://www.reuters.com/markets/2026/06/19/post-event-recap-no-catalyst-time/",
        published_at: "2026-06-19T18:00:00.000Z",
        catalyst_time_utc: null,
        tag: "Focused catalyst source",
        why_relevant:
          "Published later, but does not provide a catalyst time inside the event window.",
      },
    ],
  });
  const priceCheck = toSourceReferenceInputsV02({
    target_type: "signal_event_v02",
    target_id: "sig_public",
    signalEventWindow: window,
    sources: [
      {
        title: "Price recap",
        publisher: "CoinDesk",
        url: "https://www.coindesk.com/markets/2026/06/19/price-recap/",
        published_at: "2026-06-19T14:20:00.000Z",
        tag: "Price check source",
        why_relevant: "Price confirmation only.",
      },
    ],
  });
  const oldBackdrop = toSourceReferenceInputsV02({
    target_type: "signal_event_v02",
    target_id: "sig_public",
    signalEventWindow: window,
    includeRejected: true,
    sources: [
      {
        title: "Old broad backdrop",
        publisher: "Reuters",
        url: "https://www.reuters.com/markets/2026/06/19/old-broad-backdrop/",
        published_at: "2026-06-17T02:00:00.000Z",
        catalyst_time_utc: "2026-06-17T02:00:00.000Z",
        tag: "Backdrop source",
        why_relevant: "Broad context from a prior UTC day, well outside the window.",
      },
    ],
  });
  const untimestampedPriceCheck = toSourceReferenceInputsV02({
    target_type: "signal_event_v02",
    target_id: "sig_public",
    signalEventWindow: window,
    sources: [
      {
        title: "Live price page",
        publisher: "Price Feed",
        url: "https://example.com/price/live-sol",
        published_at: null,
        tag: "Price check source",
        why_relevant: "Live price page without article publication time.",
      },
    ],
  });
  // Same UTC day as the event but outside the 6h window (window starts 08:00):
  // a Backdrop source is kept as Backdrop (Market Backdrop context), and a cause
  // tag is downgraded to Backdrop but still kept because it is same-UTC-day.
  const sameDayBackdrop = toSourceReferenceInputsV02({
    target_type: "signal_event_v02",
    target_id: "sig_public",
    signalEventWindow: window,
    includeRejected: true,
    sources: [
      {
        title: "Same-day market roundup",
        publisher: "BlockchainReporter",
        url: "https://blockchainreporter.net/markets/2026/06/19/roundup/",
        published_at: "2026-06-19T02:00:00.000Z",
        catalyst_time_utc: null,
        tag: "Backdrop source",
        why_relevant: "Same-day coverage of the move; no pinpoint catalyst time.",
      },
    ],
  });
  const sameDayCauseDowngraded = toSourceReferenceInputsV02({
    target_type: "signal_event_v02",
    target_id: "sig_public",
    signalEventWindow: window,
    includeRejected: true,
    sources: [
      {
        title: "Same-day cause claim without in-window time",
        publisher: "Reuters",
        url: "https://www.reuters.com/markets/2026/06/19/same-day-cause/",
        published_at: "2026-06-19T02:00:00.000Z",
        catalyst_time_utc: null,
        tag: "Likely cause source",
        why_relevant: "Same day but outside the 6h window and no catalyst time.",
      },
    ],
  });

  assert.equal(stale[0].accepted, false);
  assert.equal(stale[0].source_role, "Backdrop source");
  assert.equal(
    stale[0].rejection_reason,
    "signal_source_outside_6h_event_window",
  );
  assert.equal(postEventArticle[0].source_role, "Focused catalyst source");
  assert.equal(
    postEventArticle[0].metadata.timing_policy_note,
    "catalyst_time_in_window",
  );
  // Published same UTC day, after the event, without an in-window catalyst time:
  // downgraded from cause to Backdrop and kept as same-day Market Backdrop context.
  assert.equal(postEventArticleWithoutCatalystTime[0].accepted, true);
  assert.equal(
    postEventArticleWithoutCatalystTime[0].source_role,
    "Backdrop source",
  );
  assert.equal(
    postEventArticleWithoutCatalystTime[0].metadata.timing_policy_note,
    "signal_source_same_utc_day_backdrop",
  );
  assert.equal(oldBackdrop[0].accepted, false);
  assert.equal(
    oldBackdrop[0].rejection_reason,
    "signal_source_outside_6h_event_window",
  );
  assert.equal(priceCheck[0].source_role, "Price check source");
  assert.equal(untimestampedPriceCheck[0].source_role, "Price check source");
  assert.equal(
    untimestampedPriceCheck[0].metadata.timing_policy_note,
    "price_source_without_publication_time",
  );
  assert.equal(sameDayBackdrop[0].accepted, true);
  assert.equal(sameDayBackdrop[0].source_role, "Backdrop source");
  assert.equal(
    sameDayBackdrop[0].metadata.timing_policy_note,
    "signal_source_same_utc_day_backdrop",
  );
  assert.equal(sameDayCauseDowngraded[0].accepted, true);
  assert.equal(sameDayCauseDowngraded[0].source_role, "Backdrop source");
  assert.equal(
    sameDayCauseDowngraded[0].metadata.timing_policy_note,
    "signal_source_same_utc_day_backdrop",
  );
});
