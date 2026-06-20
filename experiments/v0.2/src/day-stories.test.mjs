import assert from "node:assert/strict";
import test from "node:test";

import { buildDayStories } from "./generate-day-stories.mjs";

function candle(openTime, closeTime, open, high, low, close) {
  return {
    open_time: openTime,
    close_time: closeTime,
    open,
    high,
    low,
    close,
    volume: 1,
  };
}

function event({
  id,
  start,
  end,
  direction = "observed_up",
  move = 1.1,
  type,
  label,
  rangeContext = "mostly_inside_range",
}) {
  return {
    event_id: id,
    window_start: start,
    window_end: end,
    direction,
    publish_candidate: true,
    window_move_pct: move,
    chart_context_score: 90,
    chart_context_label: label,
    event_story_type: type,
    event_range_context: rangeContext,
  };
}

const TEST_OPTIONS = {
  minStoryDurationMinutes: 30,
  minStorySwingChangePct: 0.5,
};

test("Market Story classifier can select Volatility expansion sequence from story-window score", () => {
  const events = [
    event({
      id: "vol_1",
      start: "2026-01-01T00:00:00.000Z",
      end: "2026-01-01T00:30:00.000Z",
      type: "volatility_expansion_up",
      label: "Volatility expansion",
    }),
    event({
      id: "vol_2",
      start: "2026-01-01T01:00:00.000Z",
      end: "2026-01-01T01:30:00.000Z",
      type: "volatility_expansion_up",
      label: "Volatility expansion",
    }),
  ];
  const candlesBySymbol = {
    BTCUSDT: [
      candle(
        "2025-12-31T23:15:00.000Z",
        "2025-12-31T23:29:59.999Z",
        100,
        100.2,
        99.9,
        100.1,
      ),
      candle(
        "2025-12-31T23:30:00.000Z",
        "2025-12-31T23:44:59.999Z",
        100.1,
        100.3,
        100,
        100.2,
      ),
      candle(
        "2025-12-31T23:45:00.000Z",
        "2025-12-31T23:59:59.999Z",
        100.2,
        100.35,
        100.05,
        100.2,
      ),
      candle(
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:14:59.999Z",
        100.2,
        102,
        99.5,
        101.6,
      ),
      candle(
        "2026-01-01T01:15:00.000Z",
        "2026-01-01T01:29:59.999Z",
        101.6,
        103.2,
        100.8,
        102.7,
      ),
    ],
  };

  const payload = buildDayStories(events, TEST_OPTIONS, { candlesBySymbol });
  assert.equal(payload.count, 1);
  assert.equal(
    payload.items[0].story_context_label,
    "Volatility expansion sequence",
  );
  assert.equal(payload.items[0].primary_story_family, "volatility_expansion");
  assert.ok(
    payload.items[0].story_window_context
      .volatility_expansion_sequence_score >=
      payload.options.storyWindowVolatilityScore,
  );
  assert.ok(
    payload.items[0].story_label_decision_reasons.includes(
      "story_window_volatility_expansion_score",
    ),
  );
});

test("Market Story classifier can select Inside-range impulse sequence from story-window score", () => {
  const events = [
    event({
      id: "inside_1",
      start: "2026-01-02T00:00:00.000Z",
      end: "2026-01-02T00:30:00.000Z",
      move: 0.8,
      type: "inside_range_impulse_up",
      label: "Strong chart context",
    }),
    event({
      id: "inside_2",
      start: "2026-01-02T01:00:00.000Z",
      end: "2026-01-02T01:30:00.000Z",
      move: 0.9,
      type: "inside_range_impulse_up",
      label: "Strong chart context",
    }),
  ];
  const candlesBySymbol = {
    BTCUSDT: [
      candle(
        "2026-01-01T23:15:00.000Z",
        "2026-01-01T23:29:59.999Z",
        100,
        106,
        94,
        100,
      ),
      candle(
        "2026-01-01T23:30:00.000Z",
        "2026-01-01T23:44:59.999Z",
        100,
        105.5,
        94.5,
        100.2,
      ),
      candle(
        "2026-01-02T00:00:00.000Z",
        "2026-01-02T00:14:59.999Z",
        100.2,
        102,
        99.8,
        101.4,
      ),
      candle(
        "2026-01-02T01:15:00.000Z",
        "2026-01-02T01:29:59.999Z",
        101.4,
        103,
        100.5,
        102.2,
      ),
    ],
  };

  const payload = buildDayStories(events, TEST_OPTIONS, { candlesBySymbol });
  assert.equal(payload.count, 1);
  assert.equal(
    payload.items[0].story_context_label,
    "Inside-range impulse sequence",
  );
  assert.equal(payload.items[0].primary_story_family, "inside_range_impulse");
  assert.ok(
    payload.items[0].story_window_context
      .inside_range_impulse_sequence_score >=
      payload.options.storyWindowInsideRangeScore,
  );
  assert.ok(
    payload.items[0].story_label_decision_reasons.includes(
      "story_window_inside_range_impulse_score",
    ),
  );
});
