import { createHash } from "node:crypto";

import {
  N_TRACKED,
  SYMBOLS,
  clamp,
  median,
  nearestMinutes,
  roundNumber,
} from "../shared.mjs";
import { detectVNextEvents } from "../detector-vnext-a/index.mjs";

export const DEFAULT_VNEXT_B_OPTIONS = {
  macroThresholdBars: 1,
  barMinutes: 15,
  rangeLookbackHours: 24,
  nearRangeEdgePct: 0.15,
  publishMovePctMin: 1.5,
  weakMovePct: 1.0,
  highStrengthMin: 88,
  highStrengthBreadthMin: 4,
  highStrengthConfirmationMin: 4,
  weekendMicroMovePct: 1.6,
  overnightMicroMovePct: 1.5,
  microRetraceBars: 1,
  longVagueMinutes: 120,
  windowMoveMethod: "median_participating_symbols",
};

function sha(input) {
  return createHash("sha1").update(input).digest("hex").slice(0, 8);
}

function marketDate(iso) {
  return iso.slice(0, 10);
}

function utcHour(iso) {
  return new Date(iso).getUTCHours();
}

function isWeekend(iso) {
  const day = new Date(iso).getUTCDay();
  return day === 0 || day === 6;
}

function isOvernightUtc(iso) {
  const hour = utcHour(iso);
  return hour >= 0 && hour < 6;
}

function sameDirectionSign(direction) {
  return direction === "observed_down" ? -1 : 1;
}

function candleTime(candle) {
  return Date.parse(candle.open_time);
}

function rangePositionLabel(position) {
  return {
    inside_range: "Inside range",
    near_high: "Near high",
    near_low: "Near low",
    broke_high: "Broke high",
    broke_low: "Broke low",
  }[position] ?? "Inside range";
}

function symbolRangeContext({ symbol, event, candlesBySymbol, options }) {
  const candles = candlesBySymbol?.[symbol] ?? [];
  const startMs = Date.parse(event.window_start);
  const endMs = Date.parse(event.window_end);
  const lookbackMs = options.rangeLookbackHours * 60 * 60 * 1000;

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return {
      prev_24h_high: null,
      prev_24h_low: null,
      range_position: "inside_range",
      range_position_label: rangePositionLabel("inside_range"),
    };
  }

  const previous = candles.filter((candle) => {
    const time = candleTime(candle);
    return Number.isFinite(time) && time < startMs && time >= startMs - lookbackMs;
  });
  const eventWindow = candles.filter((candle) => {
    const time = candleTime(candle);
    return Number.isFinite(time) && time >= startMs && time <= endMs;
  });

  if (previous.length === 0 || eventWindow.length === 0) {
    return {
      prev_24h_high: null,
      prev_24h_low: null,
      range_position: "inside_range",
      range_position_label: rangePositionLabel("inside_range"),
    };
  }

  const prevHigh = Math.max(...previous.map((candle) => Number(candle.high)));
  const prevLow = Math.min(...previous.map((candle) => Number(candle.low)));
  const eventHigh = Math.max(...eventWindow.map((candle) => Number(candle.high)));
  const eventLow = Math.min(...eventWindow.map((candle) => Number(candle.low)));
  const eventClose = Number(eventWindow.at(-1)?.close);
  const range = prevHigh - prevLow;
  let position = "inside_range";

  if (eventHigh > prevHigh) {
    position = "broke_high";
  } else if (eventLow < prevLow) {
    position = "broke_low";
  } else if (range > 0 && Number.isFinite(eventClose)) {
    const normalized = (eventClose - prevLow) / range;

    if (normalized >= 1 - options.nearRangeEdgePct) {
      position = "near_high";
    } else if (normalized <= options.nearRangeEdgePct) {
      position = "near_low";
    }
  }

  return {
    prev_24h_high: roundNumber(prevHigh, 8),
    prev_24h_low: roundNumber(prevLow, 8),
    range_position: position,
    range_position_label: rangePositionLabel(position),
  };
}

function eventRangeContext(perSymbolEvidence) {
  const included = perSymbolEvidence.filter((item) => item.included_in_event);
  const counts = included.reduce((acc, item) => {
    acc[item.range_position] = (acc[item.range_position] ?? 0) + 1;
    return acc;
  }, {});

  if ((counts.broke_high ?? 0) >= 3) return "broad_break_high";
  if ((counts.broke_low ?? 0) >= 3) return "broad_break_low";
  if (
    included.length > 0 &&
    included.every((item) =>
      ["inside_range", "near_high", "near_low"].includes(item.range_position),
    )
  ) {
    return "inside_range";
  }

  return "mixed_range_position";
}

function enrichPerSymbolEvidence(event, context) {
  return (event.per_symbol_evidence ?? []).map((row) => {
    const rangeContext = symbolRangeContext({
      symbol: row.symbol,
      event,
      candlesBySymbol: context.candlesBySymbol,
      options: context.options,
    });

    return {
      ...row,
      window_change_pct: row.window_move_pct,
      ...rangeContext,
    };
  });
}

function strongestPeakSymbol(event) {
  const entries = Object.entries(event.peak_15m_move_pct_by_symbol ?? {}).filter(
    ([, value]) => Number.isFinite(value),
  );
  const strongest = entries.sort(
    ([, a], [, b]) => Math.abs(b) - Math.abs(a),
  )[0];

  return strongest?.[0] ?? null;
}

function tableHighlightMetadata({ leadMoverSymbol, strongestPeakSymbol }) {
  const cells = [];

  if (leadMoverSymbol) {
    cells.push({
      symbol: leadMoverSymbol,
      column: "symbol",
      reason: "lead_mover",
    });
  }

  if (strongestPeakSymbol) {
    cells.push({
      symbol: strongestPeakSymbol,
      column: "peak_15m",
      reason: "strongest_peak_15m",
    });
  }

  return {
    lead_mover_symbol: leadMoverSymbol,
    strongest_peak_symbol: strongestPeakSymbol,
    highlight_cells: cells,
  };
}

function routeHintForEvent(input) {
  const hints = [];

  if (input.macro_aligned) {
    hints.push("macro_aligned");
  }

  if (input.signals_count >= 4) {
    hints.push("broad_market");
  }

  if (input.isWeekendOrOvernight) {
    hints.push("weekend_overnight");
  }

  if (input.suppress_reason === "micro_retrace_after_parent") {
    hints.push("possible_relief_rally");
  }

  if (
    input.signal_strength_score >= 90 &&
    input.max_abs_window_move_pct >= 2 &&
    input.confirmationCount >= 4
  ) {
    hints.push("possible_liquidation_context");
  }

  if (input.publish_candidate) {
    return hints.length > 0 ? hints : ["broad_market"];
  }

  if (input.max_abs_window_move_pct < 1) {
    return ["weak_route"];
  }

  return hints.length > 0 ? hints : ["no_clear_route"];
}

function eventStrengthLabel(score) {
  if (score >= 75) return "High";
  if (score >= 50) return "Medium";
  return "Low";
}

function signedMedianMove(event) {
  const moves = event.symbols_involved
    .map((symbol) => event.window_move_pct_by_symbol?.[symbol])
    .filter((value) => Number.isFinite(value));
  const value = median(moves);

  return value === null ? 0 : roundNumber(value, 4);
}

function maxAbsWindowMove(event) {
  const moves = event.symbols_involved
    .map((symbol) => event.window_move_pct_by_symbol?.[symbol])
    .filter((value) => Number.isFinite(value));

  return moves.length === 0
    ? 0
    : roundNumber(Math.max(...moves.map((value) => Math.abs(value))), 4);
}

function confirmationCount(event) {
  return event.symbols_involved.filter(
    (symbol) =>
      event.volume_confirmation_by_symbol?.[symbol] ||
      event.range_confirmation_by_symbol?.[symbol],
  ).length;
}

function nearestMacro(event, macroCalendar, options) {
  const candidates = macroCalendar
    .map((item) => {
      const openDelta = nearestMinutes(event.window_start, item.scheduled_at);
      const peakDelta = nearestMinutes(event.peak_time, item.scheduled_at);
      const deltas = [openDelta, peakDelta].filter((value) =>
        Number.isFinite(value),
      );

      if (deltas.length === 0) {
        return null;
      }

      return {
        id: item.id,
        type: item.type,
        title: item.title,
        scheduled_at: item.scheduled_at,
        source_query_hint: item.source_query_hint,
        delta_min: Math.min(...deltas),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.delta_min - b.delta_min);
  const nearest = candidates[0] ?? null;
  const threshold = options.macroThresholdBars * options.barMinutes;

  return {
    nearest_macro_event: nearest,
    macro_delta_min: nearest?.delta_min ?? null,
    macro_aligned: Boolean(nearest && nearest.delta_min <= threshold),
  };
}

function publishDecision(input) {
  const {
    event,
    previousPublished,
    options,
    maxAbsMove,
    macroAligned,
    signalStrength,
    confirmations,
  } = input;
  const gapFromPreviousMin =
    previousPublished && previousPublished.window_end
      ? nearestMinutes(event.window_start, previousPublished.window_end)
      : null;
  const isOppositeRetrace =
    previousPublished &&
    previousPublished.direction !== event.direction &&
    Number.isFinite(gapFromPreviousMin) &&
    gapFromPreviousMin <= options.microRetraceBars * options.barMinutes &&
    maxAbsMove < previousPublished.max_abs_window_move_pct;
  const weekendOrOvernight = isWeekend(event.window_start) || isOvernightUtc(event.window_start);

  if (isOppositeRetrace) {
    return {
      publish_candidate: false,
      publish_reason: null,
      suppress_reason: "micro_retrace_after_parent",
      isWeekendOrOvernight: weekendOrOvernight,
    };
  }

  if (macroAligned) {
    return {
      publish_candidate: true,
      publish_reason: "macro_aligned",
      suppress_reason: null,
      isWeekendOrOvernight: weekendOrOvernight,
    };
  }

  if (maxAbsMove < options.weakMovePct) {
    return {
      publish_candidate: false,
      publish_reason: null,
      suppress_reason: "weak_window_move_lt_1pct",
      isWeekendOrOvernight: weekendOrOvernight,
    };
  }

  if (weekendOrOvernight && maxAbsMove < options.weekendMicroMovePct) {
    return {
      publish_candidate: false,
      publish_reason: null,
      suppress_reason: "weak_weekend_overnight_micro_move",
      isWeekendOrOvernight: weekendOrOvernight,
    };
  }

  if (
    event.duration_min > options.longVagueMinutes &&
    maxAbsMove < options.publishMovePctMin
  ) {
    return {
      publish_candidate: false,
      publish_reason: null,
      suppress_reason: "long_vague_window",
      isWeekendOrOvernight: weekendOrOvernight,
    };
  }

  if (
    event.symbols_involved.length === 0 ||
    (maxAbsMove < options.weakMovePct && confirmations > 0)
  ) {
    return {
      publish_candidate: false,
      publish_reason: null,
      suppress_reason: "volume_range_without_meaningful_price_move",
      isWeekendOrOvernight: weekendOrOvernight,
    };
  }

  if (maxAbsMove >= options.publishMovePctMin) {
    return {
      publish_candidate: true,
      publish_reason: "window_move_gte_1_5pct",
      suppress_reason: null,
      isWeekendOrOvernight: weekendOrOvernight,
    };
  }

  if (
    signalStrength >= options.highStrengthMin &&
    event.breadth_count >= options.highStrengthBreadthMin &&
    confirmations >= options.highStrengthConfirmationMin
  ) {
    return {
      publish_candidate: true,
      publish_reason: "high_strength_breadth_confirmation",
      suppress_reason: null,
      isWeekendOrOvernight: weekendOrOvernight,
    };
  }

  return {
    publish_candidate: false,
    publish_reason: null,
    suppress_reason: "below_publish_gate",
    isWeekendOrOvernight: weekendOrOvernight,
  };
}

function toVNextBEvent(event, context) {
  const { macroCalendar, options, previousPublished } = context;
  const windowMovePct = signedMedianMove(event);
  const maxAbsMove = maxAbsWindowMove(event);
  const signalStrength = roundNumber(event.event_strength ?? 0, 4);
  const confirmations = confirmationCount(event);
  const macro = nearestMacro(event, macroCalendar, options);
  const decision = publishDecision({
    event,
    previousPublished,
    options,
    maxAbsMove,
    macroAligned: macro.macro_aligned,
    signalStrength,
    confirmations,
  });
  const sourceRouteHint = routeHintForEvent({
    publish_candidate: decision.publish_candidate,
    suppress_reason: decision.suppress_reason,
    max_abs_window_move_pct: maxAbsMove,
    signals_count: event.breadth_count,
    signal_strength_score: signalStrength,
    confirmationCount: confirmations,
    macro_aligned: macro.macro_aligned,
    isWeekendOrOvernight: decision.isWeekendOrOvernight,
  });
  const tags = macro.macro_aligned ? ["macro_aligned"] : [];
  const showPeakDetails =
    macro.macro_aligned ||
    (maxAbsMove >= 2 && event.duration_min <= 30 && confirmations >= 4);
  const perSymbolEvidence = enrichPerSymbolEvidence(event, context);
  const leadMoverSymbol = event.lead_mover ?? null;
  const strongestPeak = strongestPeakSymbol(event);
  const tableHighlights = tableHighlightMetadata({
    leadMoverSymbol,
    strongestPeakSymbol: strongestPeak,
  });

  return {
    event_id: `vnext_b_${sha(event.event_id)}_${event.window_start.replace(/[-:]/g, "").slice(0, 13).toLowerCase()}`,
    item_type: "signal_event",
    direction: event.direction,
    window_start: event.window_start,
    window_end: event.window_end,
    duration_min: event.duration_min,
    peak_time: event.peak_time,
    signals_count: event.breadth_count,
    n_tracked: event.n_tracked ?? N_TRACKED,
    window_move_pct: roundNumber(windowMovePct, 4),
    window_move_pct_by_symbol: event.window_move_pct_by_symbol,
    max_abs_window_move_pct: maxAbsMove,
    event_strength_label: eventStrengthLabel(signalStrength),
    signal_strength_score: signalStrength,
    source_route_hint: sourceRouteHint,
    publish_candidate: decision.publish_candidate,
    publish_reason: decision.publish_reason,
    suppress_reason: decision.suppress_reason,
    macro_aligned: macro.macro_aligned,
    nearest_macro_event: macro.nearest_macro_event,
    macro_delta_min: macro.macro_delta_min,
    event_range_context: eventRangeContext(perSymbolEvidence),
    per_symbol_evidence: perSymbolEvidence,
    table_highlights: tableHighlights,
    diagnostics: {
      source_event_id: event.event_id,
      window_move_method: options.windowMoveMethod,
      peak_15m_move_pct_by_symbol: event.peak_15m_move_pct_by_symbol,
      lead_mover: event.lead_mover,
      volume_confirmation_by_symbol: event.volume_confirmation_by_symbol,
      range_confirmation_by_symbol: event.range_confirmation_by_symbol,
      vnext_a_suppression_notes: event.suppression_notes ?? [],
      weekend: isWeekend(event.window_start),
      overnight_utc: isOvernightUtc(event.window_start),
      direction_sign: sameDirectionSign(event.direction),
    },
    tags,
    show_peak_details: showPeakDetails,
  };
}

export function calibrateVNextAEvents(events, options = {}) {
  const mergedOptions = { ...DEFAULT_VNEXT_B_OPTIONS, ...options };
  const macroCalendar = options.macroCalendar ?? [];
  const candlesBySymbol = options.candlesBySymbol ?? {};
  const calibrated = [];
  let previousPublished = null;

  for (const event of [...events].sort((a, b) => a.window_start.localeCompare(b.window_start))) {
    const calibratedEvent = toVNextBEvent(event, {
      options: mergedOptions,
      macroCalendar,
      previousPublished,
      candlesBySymbol,
    });
    calibrated.push(calibratedEvent);

    if (calibratedEvent.publish_candidate) {
      previousPublished = calibratedEvent;
    }
  }

  return calibrated;
}

export function detectVNextBEvents({ candlesBySymbol, macroCalendar = [], options = {} }) {
  const vnextA = detectVNextEvents({ candlesBySymbol });
  const events = calibrateVNextAEvents(vnextA.events, {
    ...options,
    macroCalendar,
    candlesBySymbol,
  });

  return {
    detector: "vnext_b",
    source_detector: "vnext_a",
    events,
    source_events: vnextA.events,
    suppressed_candidates: vnextA.suppressed_candidates,
    options: { ...DEFAULT_VNEXT_B_OPTIONS, ...options },
  };
}

export function summarizeVNextB(events, options = {}) {
  const durations = events.map((event) => event.duration_min);
  const suppressedByReason = {};

  for (const event of events.filter((item) => !item.publish_candidate)) {
    suppressedByReason[event.suppress_reason ?? "unknown"] =
      (suppressedByReason[event.suppress_reason ?? "unknown"] ?? 0) + 1;
  }

  return {
    detector: "vnext_b",
    detected_event_count: events.length,
    publish_candidate_count: events.filter((event) => event.publish_candidate)
      .length,
    suppressed_count: events.filter((event) => !event.publish_candidate).length,
    suppressed_by_reason: suppressedByReason,
    avg_duration_min: roundNumber(
      durations.reduce((sum, value) => sum + value, 0) / (durations.length || 1),
      2,
    ),
    median_duration_min: median(durations),
    max_duration_min: durations.length ? Math.max(...durations) : 0,
    events_over_90_min: events.filter((event) => event.duration_min > 90).length,
    events_over_120_min: events.filter((event) => event.duration_min > 120).length,
    macro_aligned_event_count: events.filter((event) => event.macro_aligned).length,
    window_move_method:
      options.windowMoveMethod ?? DEFAULT_VNEXT_B_OPTIONS.windowMoveMethod,
  };
}
