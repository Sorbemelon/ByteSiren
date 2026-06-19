#!/usr/bin/env node

import {
  DATA_DIR,
  EXPERIMENT_VERSION,
  OUTPUTS_DIR,
  buildEventSummary,
  isMain,
  loadCandleSnapshot,
  readJson,
  readOption,
  roundNumber,
  writeJson,
  writeText,
} from "./shared.mjs";
import {
  detectVNextCEvents,
  summarizeVNextC,
} from "./detector-vnext-c/index.mjs";

export const VNEXT_C_EVENTS_PATH = `${OUTPUTS_DIR}/vnext_c_events.json`;
export const VNEXT_C_SUMMARY_PATH = `${OUTPUTS_DIR}/vnext_c_summary.json`;
export const VNEXT_C_PUBLIC_MD_PATH = `${OUTPUTS_DIR}/vnext_c_public_candidates.md`;
export const VNEXT_C_AUDIT_MD_PATH = `${OUTPUTS_DIR}/vnext_c_audit_events.md`;
export const VNEXT_C_GATE_JSON_PATH = `${OUTPUTS_DIR}/vnext_c_gate_decisions.json`;

const MACRO_CALENDAR_PATH = `${DATA_DIR}/macro_calendar_2026_window.json`;

async function loadMacroCalendar(path = MACRO_CALENDAR_PATH) {
  try {
    const payload = await readJson(path);
    return payload.items ?? [];
  } catch {
    return [];
  }
}

function signPct(value, digits = 1) {
  const rounded = roundNumber(value, digits);
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

function decisionRow(event) {
  return {
    event_id: event.event_id,
    source_vnext_b_event_id: event.source_vnext_b_event_id,
    date_time: event.window_start,
    evidence_window: {
      start: event.window_start,
      end: event.window_end,
      duration_min: event.duration_min,
    },
    direction: event.direction,
    avg_change_pct: event.window_move_pct,
    signals_count: event.signals_count,
    n_tracked: event.n_tracked,
    event_strength: event.event_strength_label,
    signal_strength_score: event.signal_strength_score,
    chart_context_score: event.chart_context_score,
    chart_context_label: event.chart_context_label,
    event_story_type: event.event_story_type,
    event_range_context: event.event_range_context,
    trend_context: event.trend_context,
    momentum_context: event.momentum_context,
    momentum_type: event.momentum_type,
    volatility_context: event.volatility_context,
    publish_candidate: event.publish_candidate,
    publish_reason: event.publish_reason,
    suppress_reason: event.suppress_reason,
    chart_context_reasons: event.chart_context_reasons,
    chart_context_warnings: event.chart_context_warnings,
  };
}

function markdownList(title, events) {
  const lines = [`# ${title}`, "", `Count: ${events.length}`, ""];

  for (const event of events) {
    lines.push(`## ${event.window_start} ${event.direction}`);
    lines.push(`- ID: ${event.event_id}`);
    lines.push(
      `- Evidence window: ${event.window_start} to ${event.window_end} (${event.duration_min} min)`,
    );
    lines.push(`- Avg Change: ${signPct(event.window_move_pct)}`);
    lines.push(`- Signals: ${event.signals_count} of ${event.n_tracked}`);
    lines.push(`- Event strength: ${event.event_strength_label}`);
    lines.push(
      `- Chart context: ${event.chart_context_label} (${event.chart_context_score})`,
    );
    lines.push(`- Story type: ${event.event_story_type}`);
    lines.push(`- Range context: ${event.event_range_context}`);
    lines.push(`- Trend context: ${event.trend_context.trend_context}`);
    lines.push(`- Momentum: ${event.momentum_type}`);
    lines.push(`- Volatility: ${event.volatility_context}`);
    lines.push(
      event.publish_candidate
        ? `- Publish reason: ${event.publish_reason}`
        : `- Suppress reason: ${event.suppress_reason}`,
    );
    lines.push("");
  }

  return lines.join("\n");
}

export async function runVNextC(
  options,
  { now = new Date(), logger = console } = {},
) {
  const snapshot = await loadCandleSnapshot(options.inputPath);
  const macroCalendar = await loadMacroCalendar(options.macroCalendarPath);
  const result = detectVNextCEvents({
    candlesBySymbol: snapshot.candles_by_symbol,
    macroCalendar,
  });
  const summary = {
    experiment_version: "v0.2R5",
    generated_at: now.toISOString(),
    input_snapshot:
      options.inputPath ?? "experiments/v0.2/data/candles_30d.json",
    fetched_at: snapshot.fetched_at ?? null,
    macro_calendar_items: macroCalendar.length,
    raw_window_count: result.source_detector_result.raw_windows_detected,
    filtered_below_min_bars_count:
      result.source_detector_result.raw_windows_filtered_below_min_bars,
    emitted_window_count: result.events.length,
    ...buildEventSummary(result.events, { rawSignalCount: null }),
    ...summarizeVNextC(result.events, result.options),
  };
  const publicEvents = result.events.filter((event) => event.publish_candidate);
  const auditEvents = result.events.filter((event) => !event.publish_candidate);

  await writeJson(options.eventsOutputPath, {
    detector: "vnext_c",
    experiment_version: EXPERIMENT_VERSION,
    generated_at: summary.generated_at,
    options: result.options,
    events: result.events,
    source_detector: result.source_detector,
  });
  await writeJson(options.summaryOutputPath, summary);
  await writeJson(options.gateOutputPath, {
    generated_at: summary.generated_at,
    detector: "vnext_c",
    publish_gate_version: result.options.publishGateVersion,
    detected_event_count: result.events.length,
    publish_candidate_count: publicEvents.length,
    audit_event_count: auditEvents.length,
    decisions: result.events.map(decisionRow),
  });
  await writeText(
    options.publicMarkdownPath,
    markdownList("vNext-C Public Candidates", publicEvents),
  );
  await writeText(
    options.auditMarkdownPath,
    markdownList("vNext-C Audit Events", auditEvents),
  );
  logger.log(
    `vNext-C complete: ${summary.detected_event_count} detected, ${summary.publish_candidate_count} publish candidates, ${summary.suppressed_count} audit-only.`,
  );

  return { events: result.events, summary };
}

export function parseArgs(argv = process.argv.slice(2)) {
  return {
    inputPath: readOption(argv, "--input"),
    macroCalendarPath:
      readOption(argv, "--macro-calendar") ?? MACRO_CALENDAR_PATH,
    eventsOutputPath:
      readOption(argv, "--events-output") ?? VNEXT_C_EVENTS_PATH,
    summaryOutputPath:
      readOption(argv, "--summary-output") ?? VNEXT_C_SUMMARY_PATH,
    publicMarkdownPath:
      readOption(argv, "--public-md-output") ?? VNEXT_C_PUBLIC_MD_PATH,
    auditMarkdownPath:
      readOption(argv, "--audit-md-output") ?? VNEXT_C_AUDIT_MD_PATH,
    gateOutputPath: readOption(argv, "--gate-output") ?? VNEXT_C_GATE_JSON_PATH,
  };
}

if (isMain(import.meta.url)) {
  runVNextC(parseArgs()).catch((error) => {
    console.error(error instanceof Error ? error.message : "vNext-C failed.");
    process.exitCode = 1;
  });
}
