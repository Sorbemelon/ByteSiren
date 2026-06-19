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
  writeJson,
} from "./shared.mjs";
import { detectVNextBEvents, summarizeVNextB } from "./detector-vnext-b/index.mjs";

export const VNEXT_B_EVENTS_PATH = `${OUTPUTS_DIR}/vnext_b_events.json`;
export const VNEXT_B_SUMMARY_PATH = `${OUTPUTS_DIR}/vnext_b_summary.json`;
const MACRO_CALENDAR_PATH = `${DATA_DIR}/macro_calendar_2026_window.json`;

async function loadMacroCalendar(path = MACRO_CALENDAR_PATH) {
  try {
    const payload = await readJson(path);
    return payload.items ?? [];
  } catch {
    return [];
  }
}

export async function runVNextB(
  options,
  { now = new Date(), logger = console } = {},
) {
  const snapshot = await loadCandleSnapshot(options.inputPath);
  const macroCalendar = await loadMacroCalendar(options.macroCalendarPath);
  const result = detectVNextBEvents({
    candlesBySymbol: snapshot.candles_by_symbol,
    macroCalendar,
  });
  const summary = {
    experiment_version: "v0.2B",
    generated_at: now.toISOString(),
    input_snapshot: options.inputPath ?? "experiments/v0.2/data/candles_30d.json",
    fetched_at: snapshot.fetched_at ?? null,
    macro_calendar_items: macroCalendar.length,
    ...buildEventSummary(result.events, { rawSignalCount: null }),
    ...summarizeVNextB(result.events, result.options),
  };

  await writeJson(options.eventsOutputPath, {
    detector: "vnext_b",
    experiment_version: EXPERIMENT_VERSION,
    generated_at: summary.generated_at,
    options: result.options,
    events: result.events,
    source_detector: result.source_detector,
  });
  await writeJson(options.summaryOutputPath, summary);
  logger.log(
    `vNext-B complete: ${summary.detected_event_count} detected, ${summary.publish_candidate_count} publish candidates.`,
  );

  return { events: result.events, summary };
}

export function parseArgs(argv = process.argv.slice(2)) {
  return {
    inputPath: readOption(argv, "--input"),
    macroCalendarPath: readOption(argv, "--macro-calendar") ?? MACRO_CALENDAR_PATH,
    eventsOutputPath: readOption(argv, "--events-output") ?? VNEXT_B_EVENTS_PATH,
    summaryOutputPath: readOption(argv, "--summary-output") ?? VNEXT_B_SUMMARY_PATH,
  };
}

if (isMain(import.meta.url)) {
  runVNextB(parseArgs()).catch((error) => {
    console.error(error instanceof Error ? error.message : "vNext-B failed.");
    process.exitCode = 1;
  });
}
