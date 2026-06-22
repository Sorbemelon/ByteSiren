import assert from "node:assert/strict";
import test from "node:test";

import {
  generateMarketStoriesV02,
  type MarketStoryCandleV02,
  type MarketStorySourceEventV02,
} from "./index.ts";

function iso(hour: number, minute = 0, day = "2026-06-15"): string {
  return `${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
}

function event(
  id: string,
  options: Partial<MarketStorySourceEventV02> & {
    startHour: number;
    endHour: number;
  },
): MarketStorySourceEventV02 {
  const publish = options.member_type !== "audit_event_v02";
  return {
    id,
    member_type: publish ? "signal_event_v02" : "audit_event_v02",
    event_start: iso(options.startHour),
    event_end: iso(options.endHour),
    direction: options.direction ?? "observed_up",
    avg_change_pct: options.avg_change_pct ?? 1.2,
    signals_count: options.signals_count ?? 4,
    chart_context_score: options.chart_context_score ?? 82,
    chart_context_label: options.chart_context_label ?? "Range break",
    event_story_type: options.event_story_type ?? "range_break_up",
    event_range_context: options.event_range_context ?? "broad_broke_high",
    trend_context: options.trend_context ?? "trend_up",
    momentum_context: options.momentum_context ?? "continuation",
    volatility_context: options.volatility_context ?? "ordinary_volatility",
    publish_candidate: options.publish_candidate ?? publish,
    macro_aligned: options.macro_aligned ?? false,
    suppress_reason: options.suppress_reason ?? null,
  };
}

function candle(
  symbol: string,
  openTime: string,
  open: number,
  close: number,
): MarketStoryCandleV02 {
  return {
    symbol,
    open_time: openTime,
    close_time: new Date(Date.parse(openTime) + 15 * 60 * 1000 - 1)
      .toISOString()
      .replace(".000Z", "Z"),
    open,
    high: Math.max(open, close),
    low: Math.min(open, close),
    close,
    volume: 100,
  };
}

test("two public Signal Events can form a signal story", () => {
  const output = generateMarketStoriesV02([
    event("signal_a", { startHour: 0, endHour: 1 }),
    event("signal_b", { startHour: 4, endHour: 5 }),
  ]);

  assert.equal(output.summary.story_count, 1);
  assert.equal(output.summary.signal_story_count, 1);
  assert.equal(output.market_stories[0].publish_candidate, true);
  assert.equal(output.market_stories[0].story_label, "Range break sequence");
  assert.deepEqual(
    JSON.parse(output.market_stories[0].included_signal_event_ids_json),
    ["signal_a", "signal_b"],
  );
});

test("Signal + audit events can form a mixed story when context is strong", () => {
  const output = generateMarketStoriesV02([
    event("signal_a", { startHour: 0, endHour: 1 }),
    event("audit_a", {
      startHour: 4,
      endHour: 5,
      member_type: "audit_event_v02",
      publish_candidate: false,
      chart_context_score: 86,
    }),
  ]);

  assert.equal(output.summary.story_count, 1);
  assert.equal(output.summary.signal_audit_story_count, 1);
  assert.equal(output.market_stories[0].publish_candidate, true);
  assert.equal(
    output.market_stories[0].publish_reason,
    "mixed_public_audit_strong_chart_context",
  );
});

test("audit-only story is allowed only with strong coherent chart context", () => {
  const output = generateMarketStoriesV02([
    event("audit_a", {
      startHour: 0,
      endHour: 1,
      member_type: "audit_event_v02",
      publish_candidate: false,
      chart_context_score: 88,
    }),
    event("audit_b", {
      startHour: 4,
      endHour: 5,
      member_type: "audit_event_v02",
      publish_candidate: false,
      chart_context_score: 86,
    }),
  ]);

  assert.equal(output.summary.story_count, 1);
  assert.equal(output.summary.audit_only_story_count, 1);
  assert.equal(output.market_stories[0].publish_candidate, true);
  assert.equal(
    output.market_stories[0].publish_reason,
    "strong_audit_context_sequence",
  );
});

test("weak audit-only sequence is suppressed", () => {
  const output = generateMarketStoriesV02([
    event("audit_a", {
      startHour: 0,
      endHour: 1,
      member_type: "audit_event_v02",
      publish_candidate: false,
      chart_context_score: 40,
    }),
    event("audit_b", {
      startHour: 3,
      endHour: 4,
      member_type: "audit_event_v02",
      publish_candidate: false,
      chart_context_score: 42,
    }),
  ]);

  assert.equal(output.summary.story_count, 1);
  assert.equal(output.market_stories[0].publish_candidate, false);
  assert.equal(
    output.market_stories[0].suppress_reason,
    "below_story_threshold",
  );
});

test("full market reset blocks bridging", () => {
  const output = generateMarketStoriesV02([
    event("signal_a", { startHour: 0, endHour: 1 }),
    event("signal_b", {
      startHour: 18,
      endHour: 19,
      direction: "observed_down",
      event_story_type: "range_break_down",
      event_range_context: "broad_broke_low",
    }),
  ]);

  assert.equal(output.summary.story_count, 0);
});

test("opposite direction events require coherent reversal or shared structure", () => {
  const output = generateMarketStoriesV02([
    event("signal_a", {
      startHour: 0,
      endHour: 1,
      direction: "observed_up",
      event_story_type: "relief_reversal_up",
      chart_context_label: "Relief / reversal",
      event_range_context: "mostly_inside_range",
    }),
    event("signal_b", {
      startHour: 5,
      endHour: 6,
      direction: "observed_down",
      event_story_type: "relief_reversal_down",
      chart_context_label: "Relief / reversal",
      event_range_context: "mostly_inside_range",
    }),
  ]);

  assert.equal(output.summary.story_count, 1);
  assert.equal(output.market_stories[0].direction, "two_sided");
  assert.equal(output.market_stories[0].story_label, "Reversal sequence");
});

test("two_sided direction does not produce a Two-sided sequence label", () => {
  const output = generateMarketStoriesV02([
    event("signal_a", { startHour: 0, endHour: 1 }),
    event("signal_b", {
      startHour: 4,
      endHour: 5,
      direction: "observed_down",
      event_story_type: "range_break_down",
      event_range_context: "broad_broke_low",
    }),
  ]);

  assert.equal(output.summary.story_count, 1);
  assert.equal(output.market_stories[0].direction, "two_sided");
  assert.notEqual(output.market_stories[0].story_label, "Two-sided sequence");
});

test("story-level label scoring can emit Momentum continuation sequence", () => {
  const output = generateMarketStoriesV02([
    event("signal_a", {
      startHour: 0,
      endHour: 1,
      event_story_type: "momentum_continuation_up",
      chart_context_label: "Momentum continuation",
      event_range_context: "mostly_inside_range",
    }),
    event("signal_b", {
      startHour: 4,
      endHour: 5,
      event_story_type: "momentum_continuation_up",
      chart_context_label: "Momentum continuation",
      event_range_context: "mostly_inside_range",
    }),
  ]);

  assert.equal(output.summary.story_count, 1);
  assert.equal(
    output.market_stories[0].story_label,
    "Momentum continuation sequence",
  );
  assert.equal(output.market_stories[0].story_family, "momentum_continuation");
});

test("story-level label scoring lets reversal beat range priority when reversal evidence is explicit", () => {
  const output = generateMarketStoriesV02([
    event("signal_a", {
      startHour: 0,
      endHour: 1,
      direction: "observed_up",
      event_story_type: "range_break_relief_reversal_up",
      chart_context_label: "Relief / reversal",
      event_range_context: "mostly_inside_range",
    }),
    event("signal_b", {
      startHour: 5,
      endHour: 6,
      direction: "observed_down",
      event_story_type: "range_break_relief_reversal_down",
      chart_context_label: "Relief / reversal",
      event_range_context: "mostly_inside_range",
    }),
  ]);

  assert.equal(output.summary.story_count, 1);
  assert.equal(output.market_stories[0].story_label, "Reversal sequence");
  assert.equal(output.market_stories[0].story_family, "relief_reversal");
});

test("story-level label scoring can emit Volatility expansion sequence", () => {
  const output = generateMarketStoriesV02([
    event("signal_a", {
      startHour: 0,
      endHour: 1,
      event_story_type: "volatility_expansion_up",
      chart_context_label: "Volatility expansion",
      event_range_context: "mostly_inside_range",
      volatility_context: "volatility_expansion",
    }),
    event("signal_b", {
      startHour: 4,
      endHour: 5,
      event_story_type: "volatility_expansion_up",
      chart_context_label: "Volatility expansion",
      event_range_context: "mostly_inside_range",
      volatility_context: "volatility_expansion",
    }),
  ]);

  assert.equal(output.summary.story_count, 1);
  assert.equal(
    output.market_stories[0].story_label,
    "Volatility expansion sequence",
  );
  assert.equal(output.market_stories[0].story_family, "volatility_expansion");
});

test("story-level label scoring can emit Inside-range impulse sequence", () => {
  const output = generateMarketStoriesV02([
    event("signal_a", {
      startHour: 0,
      endHour: 1,
      event_story_type: "inside_range_impulse_up",
      chart_context_label: "Inside-range impulse",
      event_range_context: "mostly_inside_range",
    }),
    event("signal_b", {
      startHour: 4,
      endHour: 5,
      event_story_type: "inside_range_impulse_up",
      chart_context_label: "Inside-range impulse",
      event_range_context: "mostly_inside_range",
    }),
  ]);

  assert.equal(output.summary.story_count, 1);
  assert.equal(
    output.market_stories[0].story_label,
    "Inside-range impulse sequence",
  );
  assert.equal(output.market_stories[0].story_family, "inside_range_impulse");
});

test("story-level label scoring keeps ambiguous context as Mixed sequence", () => {
  const output = generateMarketStoriesV02([
    event("signal_a", {
      startHour: 0,
      endHour: 1,
      chart_context_label: "Strong chart context",
      event_story_type: "",
      event_range_context: "",
      trend_context: "",
      momentum_context: "",
      volatility_context: "ordinary_volatility",
    }),
    event("signal_b", {
      startHour: 4,
      endHour: 5,
      chart_context_label: "Strong chart context",
      event_story_type: "",
      event_range_context: "",
      trend_context: "",
      momentum_context: "",
      volatility_context: "ordinary_volatility",
    }),
  ]);

  assert.equal(output.summary.story_count, 1);
  assert.equal(output.market_stories[0].story_label, "Mixed sequence");
  assert.equal(output.market_stories[0].story_family, "mixed_context");
});

test("story duration and swing thresholds are respected", () => {
  const output = generateMarketStoriesV02([
    event("signal_a", { startHour: 0, endHour: 1, avg_change_pct: 0.4 }),
    event("signal_b", { startHour: 2, endHour: 3, avg_change_pct: 0.4 }),
  ]);

  assert.equal(output.summary.story_count, 1);
  assert.equal(output.market_stories[0].publish_candidate, false);
  assert.equal(
    output.market_stories[0].suppress_reason,
    "below_minimum_story_range",
  );
});

test("Volatility Score uses RMS of all 15m bar changes inside the story window", () => {
  const output = generateMarketStoriesV02(
    [
      event("signal_a", { startHour: 0, endHour: 1 }),
      event("signal_b", { startHour: 4, endHour: 5 }),
    ],
    {},
    [
      candle("BTCUSDT", iso(0), 100, 101),
      candle("BTCUSDT", iso(0, 15), 101, 102.01),
    ],
  );
  const rangeContext = JSON.parse(output.market_stories[0].range_context_json);

  assert.equal(
    rangeContext.swing_score_method,
    "rms_15m_bar_open_close_returns_x100",
  );
  assert.equal(rangeContext.swing_score, 100);
  assert.equal(rangeContext.per_symbol_evidence[0].range_pct, 2.01);
  assert.equal(rangeContext.per_symbol_evidence[0].swing_score, 100);
  assert.equal(rangeContext.per_symbol_evidence[0].movement_status, "Net up");
});

test("Volatility Score rounds fractional raw scores to whole numbers", () => {
  const output = generateMarketStoriesV02(
    [
      event("signal_a", { startHour: 0, endHour: 1 }),
      event("signal_b", { startHour: 4, endHour: 5 }),
    ],
    {},
    [candle("BTCUSDT", iso(0), 100, 100.123)],
  );
  const rangeContext = JSON.parse(output.market_stories[0].range_context_json);

  assert.equal(rangeContext.swing_score, 12);
  assert.equal(rangeContext.per_symbol_evidence[0].swing_score, 12);
  assert.equal(
    rangeContext.per_symbol_evidence[0].movement_status,
    "Mostly flat",
  );
  assert.equal(Number.isInteger(rangeContext.swing_score), true);
});

test("deterministic story IDs are stable across repeated generation", () => {
  const source = [
    event("signal_a", { startHour: 0, endHour: 1 }),
    event("signal_b", { startHour: 4, endHour: 5 }),
  ];
  const first = generateMarketStoriesV02(source);
  const second = generateMarketStoriesV02(source);

  assert.equal(first.market_stories[0].id, second.market_stories[0].id);
});

test("Market Story identity survives later extension of the same anchored story", () => {
  const initial = generateMarketStoriesV02([
    event("signal_a", { startHour: 0, endHour: 1 }),
    event("signal_b", { startHour: 4, endHour: 5 }),
  ]);
  const extended = generateMarketStoriesV02([
    event("signal_a", { startHour: 0, endHour: 1 }),
    event("signal_b", { startHour: 4, endHour: 5 }),
    event("signal_c", { startHour: 8, endHour: 9 }),
  ]);

  assert.equal(initial.summary.story_count, 1);
  assert.equal(extended.summary.story_count, 1);
  assert.equal(initial.market_stories[0].id, extended.market_stories[0].id);
  assert.equal(
    initial.market_stories[0].story_end < extended.market_stories[0].story_end,
    true,
  );
  assert.deepEqual(
    JSON.parse(extended.market_stories[0].included_signal_event_ids_json),
    ["signal_a", "signal_b", "signal_c"],
  );
});
