// vnext_structural — catalyst-likely COMPACT structural Signal detector.
//
// Replaces the z-score spike window-finder with price-structure recognition:
// per symbol it reads a short trailing probe window via the existing structural
// context (range break, trend, compression/expansion, prior moves), classifies
// one of four compact chart shapes, then emits a market event only when the
// shape is shared across the basket (breadth) with a strong aligned move — the
// source-validated "probably catalyst-driven" OHLCV signature. Long multi-swing
// patterns are intentionally NOT detected here; that is the Market Story layer.
//
// Pattern classification, chart-context scoring and the publish gate are reused
// unchanged from detector-vnext-c (they are already structural); only the
// window-finding differs.

import { SYMBOLS, median, roundNumber } from "../shared.mjs";
import {
  DEFAULT_VNEXT_C_OPTIONS,
  computeIndicators,
  computeSymbolChartContext,
  indexCandlesByTime,
  commonTimes,
  windowToCandidateEvent,
  enrichVNextCEvents,
} from "../detector-vnext-c/index.mjs";

export const DEFAULT_STRUCTURAL_OPTIONS = {
  ...DEFAULT_VNEXT_C_OPTIONS,
  // Compact trailing window used for each per-symbol structural read.
  probeBars: 3,
  // Progressive signal lifecycle: a signal opens early and keeps updating while
  // new qualifying detections arrive within the update gap, up to the max span.
  structuralMinBars: 2,
  structuralUpdateGapBars: 2, // <= ~30 min between updates before finalizing
  structuralMaxSpanBars: 12, // ~3h max extension for a COMPACT unit (audit stays here)
  // Stage 2 public-only merge: stitch already-public compact units into longer
  // public signals (audit is never merged, so this stays narrower than Market
  // Story). Applied AFTER the gate, so it does not re-trigger long_vague_window.
  publicMergeGapBars: 24, // <= ~6h between public units before a new signal
  publicMergeMaxSpanBars: null, // no cap (null = unbounded)
  // Catalyst-likely emission floor: broad basket + strong aligned move.
  structuralMinBreadth: 3,
  structuralMinAlignedPct: 0.5,
  // Continuation flag needs a real prior impulse in the trend direction.
  structuralContinuationPriorImpulsePct: 0.5,
  publishGateVersion: "vnext_structural_r1",
};

// Recognized compact shape -> existing event_story_type family (keeps the
// reused gate paths and chart-context labels coherent).
const STRUCTURAL_STORY = {
  breakout_hold: (dir) => `range_break_${dir}`,
  failed_breakout_reversal: (dir) => `relief_reversal_${dir}`,
  continuation_flag: (dir) => `momentum_continuation_${dir}`,
  compression_expansion_break: (dir) => `volatility_expansion_${dir}`,
};

function dirWord(direction) {
  return direction === "observed_down" ? "down" : "up";
}

// Net basket direction over [startCursor, endCursor] — the headline direction
// reflects the dominant close-to-close move, not the last tick (so a big down
// move with a small late bounce stays "down"). Returns "down" | "up".
function netBasketDirection({
  startCursor,
  endCursor,
  times,
  indicesBySymbol,
  candlesBySymbol,
}) {
  const moves = [];
  for (const symbol of SYMBOLS) {
    const candles = candlesBySymbol[symbol] ?? [];
    const i0 = indicesBySymbol[symbol]?.get(times[startCursor]);
    const i1 = indicesBySymbol[symbol]?.get(times[endCursor]);
    if (i0 == null || i1 == null || i0 < 1) continue;
    const base = Number(candles[i0 - 1].close);
    const end = Number(candles[i1].close);
    if (base > 0) moves.push((end - base) / base);
  }
  return (median(moves) ?? 0) < 0 ? "down" : "up";
}

// Classify the compact structural shape for one symbol at cursor `c`, using a
// short trailing probe window read through the existing structural context.
function symbolShapeAt({ symbol, candles, indicators, times, c, options }) {
  const probe = options.probeBars;
  if (c < probe) return null;
  const event = {
    window_start: times[c - probe + 1],
    window_end: times[c],
  };
  const ctx = computeSymbolChartContext({ symbol, event, candles, indicators, options });
  if (!ctx.valid_chart_context) return null;

  const change = ctx.window_change_pct ?? 0;
  const up = change > 0;

  // 1. Breakout-and-hold: confirmed prior-range break that held.
  if (
    ctx.range_break_confirmed &&
    (ctx.range_position === "broke_high" || ctx.range_position === "broke_low")
  ) {
    // Compression+expansion break is the more specific shape when present.
    if (ctx.squeeze_break_flag) {
      return { pattern: "compression_expansion_break", direction: ctx.range_break_direction };
    }
    return { pattern: "breakout_hold", direction: ctx.range_break_direction };
  }

  // 2. Compression -> expansion break even if range break is borderline.
  if (ctx.squeeze_break_flag && ctx.range_break_direction !== "none") {
    return { pattern: "compression_expansion_break", direction: ctx.range_break_direction };
  }

  // 3. Failed breakout / reversal: breached the prior level but closed back
  //    inside and reversed within the probe window.
  const breachedHigh =
    ctx.event_high >= ctx.prev_24h_high && ctx.event_close < ctx.prev_24h_high;
  const breachedLow =
    ctx.event_low <= ctx.prev_24h_low && ctx.event_close > ctx.prev_24h_low;
  if (breachedHigh && change < 0) {
    return { pattern: "failed_breakout_reversal", direction: "down" };
  }
  if (breachedLow && change > 0) {
    return { pattern: "failed_breakout_reversal", direction: "up" };
  }

  // 4. Compact continuation flag: aligned trend + prior impulse + resumption.
  const trendAligned =
    (ctx.trend_direction === "up" && up) ||
    (ctx.trend_direction === "down" && !up);
  const priorImpulse =
    (up ? ctx.prior_4h_move_pct : -ctx.prior_4h_move_pct) >=
    options.structuralContinuationPriorImpulsePct;
  if (trendAligned && priorImpulse && Math.abs(change) >= 0.25) {
    return { pattern: "continuation_flag", direction: up ? "up" : "down" };
  }

  return null;
}

// Dominant (pattern, direction) shared across the basket at cursor c.
function dominantShapeAt(signals, options) {
  const counts = new Map();
  for (const sig of signals) {
    if (!sig || sig.direction === "none") continue;
    const key = `${sig.pattern}|${sig.direction}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = null;
  for (const [key, count] of counts) {
    if (count < options.structuralMinBreadth) continue;
    if (!best || count > best.count) {
      const [pattern, direction] = key.split("|");
      best = { pattern, direction, count };
    }
  }
  return best;
}

export function detectStructuralWindows({ candlesBySymbol, options }) {
  const indicesBySymbol = indexCandlesByTime(candlesBySymbol);
  const times = commonTimes(candlesBySymbol, indicesBySymbol);
  const indicatorsBySymbol = Object.fromEntries(
    SYMBOLS.map((symbol) => [
      symbol,
      computeIndicators(candlesBySymbol[symbol] ?? [], options),
    ]),
  );

  // Per-cursor dominant compact shape across the basket.
  const dominantByCursor = times.map((_time, c) => {
    const signals = SYMBOLS.map((symbol) =>
      symbolShapeAt({
        symbol,
        candles: candlesBySymbol[symbol] ?? [],
        indicators: indicatorsBySymbol[symbol],
        times,
        c,
        options,
      }),
    );
    return dominantShapeAt(signals, options);
  });

  // Progressive forward lifecycle: open a signal early, then update/extend it in
  // place while new qualifying detections arrive within the update gap (flipping
  // direction if the move reverses), until a gap or the max span finalizes it.
  const windows = [];
  let active = null;
  const dominant = (components) => {
    const counts = new Map();
    for (const p of components) counts.set(p, (counts.get(p) ?? 0) + 1);
    let best = components[0];
    let bestN = 0;
    for (const [p, n] of counts) {
      if (n > bestN) {
        best = p;
        bestN = n;
      }
    }
    return best;
  };
  const finalize = () => {
    if (!active) return;
    const start = active.startCursor;
    const end = active.endCursor;
    if (end - start + 1 >= options.structuralMinBars) {
      const netDir = netBasketDirection({
        startCursor: start,
        endCursor: end,
        times,
        indicesBySymbol,
        candlesBySymbol,
      });
      const distinctDirs = new Set(
        active.directionHistory.map((step) => step.direction),
      );
      windows.push({
        start_cursor: start,
        end_cursor: end,
        direction: netDir === "down" ? "observed_down" : "observed_up",
        peak_cursor: active.peakCursor,
        peak_strength: active.peakCount,
        structural_pattern: dominant(active.components),
        structural_pattern_components: [...new Set(active.components)],
        first_detected_cursor: active.firstC,
        update_count: active.updateCount,
        direction_changed: distinctDirs.size > 1,
        direction_history: active.directionHistory,
        states: [],
        flash_event: false,
      });
    }
    active = null;
  };
  const openSignal = (c, dom) => {
    active = {
      direction: dom.direction,
      firstC: c,
      startCursor: Math.max(0, c - (options.probeBars - 1)),
      endCursor: c,
      lastUpdateC: c,
      peakCursor: c,
      peakCount: dom.count,
      components: [dom.pattern],
      updateCount: 0,
      directionChanged: false,
      directionHistory: [{ direction: dom.direction, cursor: c }],
    };
  };

  for (let c = 0; c < times.length; c += 1) {
    // Finalize a stale active signal whose update gap has lapsed.
    if (active && c - active.lastUpdateC > options.structuralUpdateGapBars) {
      finalize();
    }
    const dom = dominantByCursor[c];
    if (!dom) continue;

    if (active && c - active.startCursor + 1 <= options.structuralMaxSpanBars) {
      // Update in place: extend, record component, flip direction if reversed.
      active.endCursor = c;
      active.lastUpdateC = c;
      active.updateCount += 1;
      active.components.push(dom.pattern);
      if (dom.count > active.peakCount) {
        active.peakCount = dom.count;
        active.peakCursor = c;
      }
      if (dom.direction !== active.direction) {
        active.direction = dom.direction;
        active.directionChanged = true;
        active.directionHistory.push({ direction: dom.direction, cursor: c });
      }
      continue;
    }

    if (active) finalize();
    openSignal(c, dom);
  }
  finalize();

  return { windows, times, indicesBySymbol };
}

export function detectStructuralEvents({
  candlesBySymbol,
  macroCalendar = [],
  options = {},
}) {
  const mergedOptions = { ...DEFAULT_STRUCTURAL_OPTIONS, ...options };
  const { windows, times, indicesBySymbol } = detectStructuralWindows({
    candlesBySymbol,
    options: mergedOptions,
  });

  const candidates = windows.map((window) => {
    const candidate = windowToCandidateEvent({
      window,
      times,
      indicesBySymbol,
      candlesBySymbol,
      macroCalendar,
      options: mergedOptions,
    });
    const direction = dirWord(window.direction);
    // Carry cursors so Stage 2 (public merge) can recompute span-level stats.
    candidate.start_cursor = window.start_cursor;
    candidate.end_cursor = window.end_cursor;
    candidate.peak_cursor = window.peak_cursor;
    candidate.peak_strength = window.peak_strength;
    candidate.structural_pattern = window.structural_pattern;
    candidate.structural_pattern_components = window.structural_pattern_components;
    candidate.detection_method = "structural";
    // Progressive lifecycle metadata (detected early, refined over time).
    candidate.initial_detected_at = times[window.first_detected_cursor];
    candidate.last_updated_at = candidate.window_end;
    candidate.update_count = window.update_count;
    candidate.direction_changed = window.direction_changed;
    candidate.direction_history = (window.direction_history ?? []).map((step) => ({
      direction: step.direction === "down" ? "observed_down" : "observed_up",
      at: times[step.cursor],
    }));
    candidate.diagnostics = {
      ...candidate.diagnostics,
      detection_method: "structural",
      structural_pattern: window.structural_pattern,
      merged_signal: (window.update_count ?? 0) > 0,
      update_count: window.update_count,
      direction_changed: window.direction_changed,
    };
    // Pre-seed the recognized shape; enrich recomputes context but keeps these.
    candidate.event_story_type = STRUCTURAL_STORY[window.structural_pattern](
      direction,
    );
    return candidate;
  });

  // Catalyst-likely emission floor: broad basket + strong aligned move, over a
  // compact-to-extended span. Uses the max single-symbol move so direction-flip
  // (whipsaw) signals are not dropped by a small net move.
  const qualified = candidates.filter((candidate) => {
    const bars = candidate.diagnostics?.evidence_bar_count ?? 1;
    const maxAbsMove = Math.max(
      Math.abs(candidate.window_move_pct ?? 0),
      candidate.evidence_window_stats?.window_change_abs_max ?? 0,
    );
    return (
      bars >= mergedOptions.structuralMinBars &&
      bars <= mergedOptions.structuralMaxSpanBars &&
      (candidate.breadth_count ?? 0) >= mergedOptions.structuralMinBreadth &&
      maxAbsMove >= mergedOptions.structuralMinAlignedPct
    );
  });

  const enriched = enrichVNextCEvents(qualified, {
    candlesBySymbol,
    options: mergedOptions,
  }).map((event, index) => ({
    ...event,
    structural_pattern: qualified[index]?.structural_pattern ?? null,
  }));

  // Stage 2: merge already-public compact units into longer public signals
  // (audit is left compact and un-merged).
  const finalEvents = mergePublicSignals(enriched, {
    times,
    indicesBySymbol,
    candlesBySymbol,
    macroCalendar,
    options: mergedOptions,
  });

  const patternCounts = finalEvents.reduce((acc, event) => {
    acc[event.structural_pattern] = (acc[event.structural_pattern] ?? 0) + 1;
    return acc;
  }, {});

  return {
    detector: "vnext_structural",
    source_detector: "vnext_structural_pattern_builder",
    events: finalEvents,
    source_events: qualified,
    source_detector_result: {
      detector: "vnext_structural_pattern_builder",
      raw_structural_windows: windows.length,
      qualified_event_count: qualified.length,
      public_merged_event_count: finalEvents.filter(
        (event) => event.diagnostics?.merged_public,
      ).length,
      final_event_count: finalEvents.length,
      structural_pattern_counts: patternCounts,
      bar_state_count: times.length,
    },
    options: mergedOptions,
  };
}

// Stage 2 — public-only wide merge. Stitches consecutive PUBLIC compact units
// that fall within `publicMergeGapBars` (~6h) into one long public signal (no
// span cap), flipping the headline to the net move and aggregating the update
// lifecycle. Audit (non-public) events are returned untouched and compact, so
// the result stays narrower than Market Story (which also folds in audit).
export function mergePublicSignals(
  events,
  { times, indicesBySymbol, candlesBySymbol, macroCalendar = [], options },
) {
  const publicEvents = events
    .filter((event) => event.publish_candidate)
    .sort((a, b) => a.window_start.localeCompare(b.window_start));
  const auditEvents = events.filter((event) => !event.publish_candidate);

  const gapMin = options.publicMergeGapBars * options.barMinutes;
  const spanCap = options.publicMergeMaxSpanBars; // null => unbounded

  // Forward-group public units by time proximity (and optional span cap).
  const groups = [];
  let group = null;
  for (const event of publicEvents) {
    if (!group) {
      group = { members: [event], runningEnd: event.window_end };
      continue;
    }
    const sinceLastMin =
      (Date.parse(event.window_start) - Date.parse(group.runningEnd)) / 60000;
    const spanBars =
      (event.end_cursor ?? 0) - (group.members[0].start_cursor ?? 0) + 1;
    const withinCap = spanCap == null || spanBars <= spanCap;
    if (sinceLastMin <= gapMin && withinCap) {
      group.members.push(event);
      if (event.window_end > group.runningEnd) group.runningEnd = event.window_end;
    } else {
      groups.push(group);
      group = { members: [event], runningEnd: event.window_end };
    }
  }
  if (group) groups.push(group);

  const merged = groups.map((entry) =>
    entry.members.length === 1
      ? entry.members[0]
      : buildMergedPublicSignal(entry.members, {
          times,
          indicesBySymbol,
          candlesBySymbol,
          macroCalendar,
          options,
        }),
  );

  return [...merged, ...auditEvents].sort((a, b) =>
    a.window_start.localeCompare(b.window_start),
  );
}

function buildMergedPublicSignal(
  members,
  { times, indicesBySymbol, candlesBySymbol, macroCalendar, options },
) {
  const moveStrength = (event) =>
    Math.max(
      Math.abs(event.window_move_pct ?? 0),
      event.evidence_window_stats?.window_change_abs_max ?? 0,
    );
  const dominant = members.reduce((best, event) =>
    moveStrength(event) > moveStrength(best) ? event : best,
  );
  const peakMember = members.reduce((best, event) =>
    (event.peak_strength ?? 0) > (best.peak_strength ?? 0) ? event : best,
  );
  const startCursor = Math.min(...members.map((event) => event.start_cursor));
  const endCursor = Math.max(...members.map((event) => event.end_cursor));

  const netWord = netBasketDirection({
    startCursor,
    endCursor,
    times,
    indicesBySymbol,
    candlesBySymbol,
  });
  const netDirection = netWord === "down" ? "observed_down" : "observed_up";

  const dominantPattern = (() => {
    const counts = new Map();
    for (const event of members) {
      counts.set(
        event.structural_pattern,
        (counts.get(event.structural_pattern) ?? 0) + 1,
      );
    }
    let best = dominant.structural_pattern;
    let bestN = 0;
    for (const [pattern, n] of counts) {
      if (n > bestN) {
        best = pattern;
        bestN = n;
      }
    }
    return best;
  })();
  const components = [
    ...new Set(
      members.flatMap((event) => event.structural_pattern_components ?? []),
    ),
  ];

  // Recompute span-level stats over the full merged window.
  const span = windowToCandidateEvent({
    window: {
      start_cursor: startCursor,
      end_cursor: endCursor,
      peak_cursor: peakMember.peak_cursor ?? startCursor,
      peak_strength: peakMember.peak_strength ?? 0,
      direction: netDirection,
      states: [],
      flash_event: false,
    },
    times,
    indicesBySymbol,
    candlesBySymbol,
    macroCalendar,
    options,
  });

  const directionHistory = members
    .flatMap((event) => event.direction_history ?? [])
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const distinctDirections = new Set(members.map((event) => event.direction));
  const directionChanged =
    distinctDirections.size > 1 ||
    members.some((event) => event.direction_changed);
  const updateCount =
    members.reduce((sum, event) => sum + (event.update_count ?? 0), 0) +
    (members.length - 1);
  const initialDetectedAt = members
    .map((event) => event.initial_detected_at)
    .filter(Boolean)
    .sort()[0];

  const dir = dirWord(netDirection);
  const stamp = span.window_start.replace(/[^0-9]/g, "").slice(0, 14);

  return {
    ...dominant,
    event_id: `vnext_structural_merged_${stamp}_${dir}`,
    source_event_id: dominant.event_id,
    direction: span.direction,
    event_direction: span.event_direction,
    window_start: span.window_start,
    window_end: span.window_end,
    duration_min: span.duration_min,
    peak_time: span.peak_time,
    window_move_pct: span.window_move_pct,
    window_move_pct_by_symbol: span.window_move_pct_by_symbol,
    max_abs_window_move_pct: span.max_abs_window_move_pct,
    breadth_count: span.breadth_count,
    signals_count: span.signals_count,
    symbols_involved: span.symbols_involved,
    evidence_window_stats: span.evidence_window_stats,
    table_highlights: span.table_highlights,
    start_cursor: startCursor,
    end_cursor: endCursor,
    peak_cursor: peakMember.peak_cursor ?? startCursor,
    peak_strength: peakMember.peak_strength ?? 0,
    structural_pattern: dominantPattern,
    structural_pattern_components: components,
    event_story_type: STRUCTURAL_STORY[dominantPattern](dir),
    initial_detected_at: initialDetectedAt,
    last_updated_at: span.window_end,
    update_count: updateCount,
    direction_changed: directionChanged,
    direction_history: directionHistory,
    publish_candidate: true,
    diagnostics: {
      ...dominant.diagnostics,
      detection_method: "structural",
      structural_pattern: dominantPattern,
      evidence_bar_count: span.diagnostics.evidence_bar_count,
      merged_signal: true,
      merged_public: true,
      public_merge_member_count: members.length,
      update_count: updateCount,
      direction_changed: directionChanged,
    },
  };
}

export function summarizeStructural(events) {
  const byPattern = events.reduce((acc, event) => {
    acc[event.structural_pattern ?? "unknown"] =
      (acc[event.structural_pattern ?? "unknown"] ?? 0) + 1;
    return acc;
  }, {});
  const suppressedByReason = {};
  for (const event of events.filter((item) => !item.publish_candidate)) {
    suppressedByReason[event.suppress_reason ?? "unknown"] =
      (suppressedByReason[event.suppress_reason ?? "unknown"] ?? 0) + 1;
  }
  return {
    detector: "vnext_structural",
    detected_event_count: events.length,
    publish_candidate_count: events.filter((event) => event.publish_candidate)
      .length,
    suppressed_count: events.filter((event) => !event.publish_candidate).length,
    suppressed_by_reason: suppressedByReason,
    structural_pattern_counts: byPattern,
    chart_context_score_avg: roundNumber(
      median(events.map((event) => event.chart_context_score)) ?? 0,
      2,
    ),
    publish_gate_version: DEFAULT_STRUCTURAL_OPTIONS.publishGateVersion,
  };
}
