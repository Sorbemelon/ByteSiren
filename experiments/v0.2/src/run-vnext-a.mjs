#!/usr/bin/env node

import {
  EXPERIMENT_VERSION,
  VNEXT_EVENTS_PATH,
  VNEXT_SUMMARY_PATH,
  buildEventSummary,
  isMain,
  loadCandleSnapshot,
  readOption,
  sourceLikelihoodDistribution,
  writeJson,
} from "./shared.mjs";
import { detectVNextEvents } from "./detector-vnext-a/index.mjs";

export async function runVNextA(
  options,
  { now = new Date(), logger = console } = {},
) {
  const snapshot = await loadCandleSnapshot(options.inputPath);
  const result = detectVNextEvents({
    candlesBySymbol: snapshot.candles_by_symbol,
  });
  const summary = {
    detector: "vnext_a",
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
    ...buildEventSummary(result.events, {
      rawSignalCount: null,
    }),
    suppressed_candidate_count: result.suppressed_candidates.length,
    source_likelihood_distribution: sourceLikelihoodDistribution(result.events),
  };

  await writeJson(options.eventsOutputPath, {
    detector: "vnext_a",
    experiment_version: EXPERIMENT_VERSION,
    generated_at: summary.generated_at,
    options: result.options,
    events: result.events,
    suppressed_candidates: result.suppressed_candidates,
  });
  await writeJson(options.summaryOutputPath, summary);
  logger.log(
    `vNext-A complete: ${result.events.length} events, ${result.suppressed_candidates.length} suppressed candidates.`,
  );

  return { events: result.events, summary };
}

export function parseArgs(argv = process.argv.slice(2)) {
  return {
    inputPath: readOption(argv, "--input"),
    eventsOutputPath: readOption(argv, "--events-output") ?? VNEXT_EVENTS_PATH,
    summaryOutputPath:
      readOption(argv, "--summary-output") ?? VNEXT_SUMMARY_PATH,
  };
}

if (isMain(import.meta.url)) {
  runVNextA(parseArgs()).catch((error) => {
    console.error(error instanceof Error ? error.message : "vNext-A failed.");
    process.exitCode = 1;
  });
}
