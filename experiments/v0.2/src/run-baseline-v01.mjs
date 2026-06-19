#!/usr/bin/env node

import {
  BASELINE_EVENTS_PATH,
  BASELINE_SUMMARY_PATH,
  EXPERIMENT_VERSION,
  buildEventSummary,
  durationMinutes,
  isMain,
  loadCandleSnapshot,
  readOption,
  roundNumber,
  writeJson,
} from "./shared.mjs";
import { detectByteSirenSignals } from "../../../apps/worker/src/services/detector/index.ts";

function peakTime(candidate) {
  if (
    !Array.isArray(candidate.sub_events) ||
    candidate.sub_events.length === 0
  ) {
    return candidate.started_at;
  }

  return candidate.sub_events.reduce((peak, event) =>
    event.max_elevated_severity > peak.max_elevated_severity ? event : peak,
  ).detected_at;
}

function normalizeBaselineEvent(candidate) {
  const duration = durationMinutes(candidate.started_at, candidate.ended_at);

  return {
    detector: "baseline_v01",
    event_id: candidate.id,
    event_type: candidate.scope,
    direction: candidate.direction,
    window_start: candidate.started_at,
    window_end: candidate.ended_at,
    duration_min: duration,
    peak_time: peakTime(candidate),
    symbols_involved: candidate.symbols,
    breadth_count: candidate.breadth_count,
    n_tracked: 5,
    headline_severity: candidate.headline_severity,
    max_elevated_severity: candidate.max_elevated_severity,
    lead_mover: candidate.peak_symbol,
    avg_15m_change_pct: candidate.avg_15m_change_pct,
    query_hints: candidate.query_hints,
    sub_events: candidate.sub_events,
    per_symbol_evidence: candidate.symbol_evidence,
  };
}

export async function runBaseline(
  options,
  { now = new Date(), logger = console } = {},
) {
  const snapshot = await loadCandleSnapshot(options.inputPath);
  const result = detectByteSirenSignals({
    candlesBySymbol: snapshot.candles_by_symbol,
  });
  const events = result.candidates.map(normalizeBaselineEvent);
  const summary = {
    detector: "baseline_v01",
    experiment_version: EXPERIMENT_VERSION,
    generated_at: now.toISOString(),
    input_snapshot: options.inputPath,
    fetched_at: snapshot.fetched_at ?? null,
    symbols: snapshot.symbols,
    candle_counts_by_symbol: Object.fromEntries(
      snapshot.symbols.map((symbol) => [
        symbol,
        snapshot.candles_by_symbol[symbol]?.length ?? 0,
      ]),
    ),
    ...buildEventSummary(events, {
      rawSignalCount: result.raw_events.length,
    }),
    suppressed_signal_count: result.suppressed_events.length,
  };

  await writeJson(options.eventsOutputPath, {
    detector: "baseline_v01",
    experiment_version: EXPERIMENT_VERSION,
    generated_at: summary.generated_at,
    raw_signal_count: result.raw_events.length,
    suppressed_signal_count: result.suppressed_events.length,
    events,
    raw_events: result.raw_events,
    suppressed_events: result.suppressed_events,
  });
  await writeJson(options.summaryOutputPath, summary);
  logger.log(
    `Baseline complete: ${events.length} events, ${roundNumber(
      summary.avg_duration_min ?? 0,
      2,
    )} min average duration.`,
  );

  return { events, summary };
}

export function parseArgs(argv = process.argv.slice(2)) {
  return {
    inputPath: readOption(argv, "--input"),
    eventsOutputPath:
      readOption(argv, "--events-output") ?? BASELINE_EVENTS_PATH,
    summaryOutputPath:
      readOption(argv, "--summary-output") ?? BASELINE_SUMMARY_PATH,
  };
}

if (isMain(import.meta.url)) {
  runBaseline(parseArgs()).catch((error) => {
    console.error(error instanceof Error ? error.message : "Baseline failed.");
    process.exitCode = 1;
  });
}
