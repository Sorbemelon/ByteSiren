#!/usr/bin/env node

// Runner for the vnext_structural compact structural detector. Writes events in
// the same JSON shape as run-vnext-c so the existing feed/preview/audit pipeline
// is detector-agnostic.

import {
  DATA_DIR,
  EXPERIMENT_VERSION,
  OUTPUTS_DIR,
  isMain,
  loadCandleSnapshot,
  readJson,
  readOption,
  writeJson,
} from "./shared.mjs";
import {
  detectStructuralEvents,
  summarizeStructural,
} from "./detector-structural/index.mjs";

export const VNEXT_STRUCTURAL_EVENTS_PATH = `${OUTPUTS_DIR}/vnext_structural_events.json`;
export const VNEXT_STRUCTURAL_SUMMARY_PATH = `${OUTPUTS_DIR}/vnext_structural_summary.json`;
export const VNEXT_STRUCTURAL_GATE_JSON_PATH = `${OUTPUTS_DIR}/vnext_structural_gate_decisions.json`;

const MACRO_CALENDAR_PATH = `${DATA_DIR}/macro_calendar_2026_window.json`;

async function loadMacroCalendar(path = MACRO_CALENDAR_PATH) {
  try {
    return (await readJson(path)).items ?? [];
  } catch {
    return [];
  }
}

function decisionRow(event) {
  return {
    event_id: event.event_id,
    date_time: event.window_start,
    window: { start: event.window_start, end: event.window_end },
    direction: event.direction,
    structural_pattern: event.structural_pattern,
    event_story_type: event.event_story_type,
    avg_change_pct: event.window_move_pct,
    evidence_bar_count: event.diagnostics?.evidence_bar_count,
    breadth_count: event.breadth_count,
    chart_context_score: event.chart_context_score,
    chart_context_label: event.chart_context_label,
    history_support_type: event.history_support_type,
    publish_candidate: event.publish_candidate,
    publish_reason: event.publish_reason,
    suppress_reason: event.suppress_reason,
  };
}

export async function runStructural(
  options,
  { now = new Date(), logger = console } = {},
) {
  const snapshot = await loadCandleSnapshot(options.inputPath);
  const macroCalendar = await loadMacroCalendar(options.macroCalendarPath);
  const result = detectStructuralEvents({
    candlesBySymbol: snapshot.candles_by_symbol,
    macroCalendar,
    options: options.detectorOptions ?? {},
  });
  const summary = {
    experiment_version: "v0.2R5",
    detector: "vnext_structural",
    generated_at: now.toISOString(),
    input_snapshot:
      options.inputPath ?? "experiments/v0.2/data/candles_30d.json",
    fetched_at: snapshot.fetched_at ?? null,
    macro_calendar_items: macroCalendar.length,
    raw_structural_windows: result.source_detector_result.raw_structural_windows,
    ...summarizeStructural(result.events),
  };
  const publicEvents = result.events.filter((event) => event.publish_candidate);
  const auditEvents = result.events.filter((event) => !event.publish_candidate);

  await writeJson(options.eventsOutputPath, {
    detector: "vnext_structural",
    experiment_version: EXPERIMENT_VERSION,
    generated_at: summary.generated_at,
    options: result.options,
    events: result.events,
    source_detector: result.source_detector,
    source_detector_result: result.source_detector_result,
  });
  await writeJson(options.summaryOutputPath, summary);
  await writeJson(options.gateOutputPath, {
    generated_at: summary.generated_at,
    detector: "vnext_structural",
    publish_gate_version: result.options.publishGateVersion,
    detected_event_count: result.events.length,
    publish_candidate_count: publicEvents.length,
    audit_event_count: auditEvents.length,
    structural_pattern_counts:
      result.source_detector_result.structural_pattern_counts,
    decisions: result.events.map(decisionRow),
  });
  logger.log(
    `vNext-Structural complete: ${summary.detected_event_count} detected, ${summary.publish_candidate_count} publish candidates, ${summary.suppressed_count} audit-only. Patterns: ${JSON.stringify(summary.structural_pattern_counts)}`,
  );

  return { events: result.events, summary };
}

export function parseArgs(argv = process.argv.slice(2)) {
  return {
    inputPath: readOption(argv, "--input"),
    macroCalendarPath:
      readOption(argv, "--macro-calendar") ?? MACRO_CALENDAR_PATH,
    eventsOutputPath:
      readOption(argv, "--events-output") ?? VNEXT_STRUCTURAL_EVENTS_PATH,
    summaryOutputPath:
      readOption(argv, "--summary-output") ?? VNEXT_STRUCTURAL_SUMMARY_PATH,
    gateOutputPath:
      readOption(argv, "--gate-output") ?? VNEXT_STRUCTURAL_GATE_JSON_PATH,
  };
}

if (isMain(import.meta.url)) {
  runStructural(parseArgs()).catch((error) => {
    console.error(
      error instanceof Error ? error.message : "vNext-Structural failed.",
    );
    process.exitCode = 1;
  });
}
