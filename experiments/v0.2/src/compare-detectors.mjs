#!/usr/bin/env node

import {
  BASELINE_EVENTS_PATH,
  COMPARISON_JSON_PATH,
  COMPARISON_MD_PATH,
  VNEXT_EVENTS_PATH,
  average,
  buildEventSummary,
  isMain,
  nearestMinutes,
  readJson,
  readOption,
  roundNumber,
  sourceLikelihoodDistribution,
  writeJson,
  writeText,
} from "./shared.mjs";

const NEAR_EVENT_MINUTES = 90;

function eventArray(payload) {
  return Array.isArray(payload) ? payload : (payload.events ?? []);
}

function eventCenterMs(event) {
  const start = Date.parse(event.window_start);
  const end = Date.parse(event.window_end);

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return Date.parse(event.window_start ?? event.peak_time);
  }

  return start + (end - start) / 2;
}

function overlapsOrNear(a, b, minutes = NEAR_EVENT_MINUTES) {
  const aStart = Date.parse(a.window_start);
  const aEnd = Date.parse(a.window_end);
  const bStart = Date.parse(b.window_start);
  const bEnd = Date.parse(b.window_end);

  if (
    [aStart, aEnd, bStart, bEnd].every((value) => Number.isFinite(value)) &&
    aStart <= bEnd &&
    bStart <= aEnd
  ) {
    return true;
  }

  return Math.abs(eventCenterMs(a) - eventCenterMs(b)) / 60000 <= minutes;
}

function compactEvent(event) {
  return {
    event_id: event.event_id,
    event_type: event.event_type,
    direction: event.direction,
    window_start: event.window_start,
    window_end: event.window_end,
    duration_min: event.duration_min,
    peak_time: event.peak_time,
    breadth_count: event.breadth_count,
    symbols_involved: event.symbols_involved,
    lead_mover: event.lead_mover,
    event_strength: event.event_strength ?? event.headline_severity ?? null,
    source_likelihood_score: event.source_likelihood_score ?? null,
  };
}

function likelyNoiseEvents(events, detector) {
  return events
    .filter((event) => {
      if (!Number.isFinite(event.duration_min)) {
        return true;
      }

      if (event.duration_min > 120) {
        return true;
      }

      if (detector === "vnext_a") {
        return (event.source_likelihood_score ?? 1) < 0.35;
      }

      return event.breadth_count <= 3 && event.duration_min <= 15;
    })
    .map(compactEvent);
}

function mapNearEvents(baselineEvents, vnextEvents) {
  const mappings = [];

  for (const vnext of vnextEvents) {
    const matches = baselineEvents
      .filter((baseline) => overlapsOrNear(baseline, vnext))
      .map((baseline) => ({
        ...compactEvent(baseline),
        nearest_minutes: roundNumber(
          nearestMinutes(baseline.peak_time, vnext.peak_time) ?? 0,
          2,
        ),
      }));

    if (matches.length > 0) {
      mappings.push({
        vnext_event: compactEvent(vnext),
        baseline_matches: matches,
      });
    }
  }

  return mappings;
}

function unmatchedEvents(primaryEvents, comparisonEvents) {
  return primaryEvents
    .filter(
      (primary) =>
        !comparisonEvents.some((comparison) =>
          overlapsOrNear(primary, comparison),
        ),
    )
    .map(compactEvent);
}

function sourceScoreStats(events) {
  const scores = events
    .map((event) => event.source_likelihood_score)
    .filter((value) => Number.isFinite(value));

  return {
    avg: scores.length === 0 ? null : roundNumber(average(scores), 4),
    min: scores.length === 0 ? null : roundNumber(Math.min(...scores), 4),
    max: scores.length === 0 ? null : roundNumber(Math.max(...scores), 4),
    distribution: sourceLikelihoodDistribution(events),
  };
}

function markdownReport(comparison) {
  const lines = [
    "# Detector Comparison",
    "",
    `Generated at: ${comparison.generated_at}`,
    "",
    "## Counts",
    "",
    `- v0.1 events: ${comparison.counts.baseline_v01_event_count}`,
    `- vNext-A events: ${comparison.counts.vnext_a_event_count}`,
    `- mapped vNext-A events near v0.1 events: ${comparison.events_that_map_near_v01.length}`,
    `- new vNext-A events: ${comparison.events_new_in_vnext_a.length}`,
    `- v0.1 events removed by vNext-A: ${comparison.events_removed_from_v01.length}`,
    "",
    "## Duration",
    "",
    `- v0.1 avg / median / max minutes: ${comparison.duration.baseline_v01.avg_duration_min} / ${comparison.duration.baseline_v01.median_duration_min} / ${comparison.duration.baseline_v01.max_duration_min}`,
    `- vNext-A avg / median / max minutes: ${comparison.duration.vnext_a.avg_duration_min} / ${comparison.duration.vnext_a.median_duration_min} / ${comparison.duration.vnext_a.max_duration_min}`,
    `- v0.1 long events >2h: ${comparison.duration.baseline_v01.long_event_count_over_2h}`,
    `- vNext-A long events >2h: ${comparison.duration.vnext_a.long_event_count_over_2h}`,
    "",
    "## Source Likelihood",
    "",
    `- vNext-A average score: ${comparison.source_likelihood.vnext_a.avg}`,
    `- vNext-A distribution: low ${comparison.source_likelihood.vnext_a.distribution.low_lt_0_4}, medium ${comparison.source_likelihood.vnext_a.distribution.medium_0_4_to_0_7}, high ${comparison.source_likelihood.vnext_a.distribution.high_gte_0_7}`,
    "",
    "## Top vNext-A Events",
    "",
    ...comparison.top_20_vnext_a_by_source_likelihood.map(
      (event, index) =>
        `${index + 1}. ${event.window_start} ${event.direction} score ${event.source_likelihood_score} breadth ${event.breadth_count} lead ${event.lead_mover}`,
    ),
    "",
    "## Notes",
    "",
    "- Likely noise is heuristic only: long duration, missing window fields, very short low-breadth events, or low vNext-A source-likelihood.",
    "- Missed potential events are vNext-A events with source-likelihood >= 0.65 that do not map near v0.1 events.",
  ];

  return lines.join("\n");
}

export async function compareDetectors(
  options,
  { now = new Date(), logger = console } = {},
) {
  const baselinePayload = await readJson(options.baselinePath);
  const vnextPayload = await readJson(options.vnextPath);
  const baselineEvents = eventArray(baselinePayload);
  const vnextEvents = eventArray(vnextPayload);
  const baselineSummary = buildEventSummary(baselineEvents, {
    rawSignalCount: baselinePayload.raw_signal_count ?? null,
  });
  const vnextSummary = buildEventSummary(vnextEvents, {
    rawSignalCount: null,
  });
  const mapped = mapNearEvents(baselineEvents, vnextEvents);
  const newInVNext = unmatchedEvents(vnextEvents, baselineEvents);
  const removedFromV01 = unmatchedEvents(baselineEvents, vnextEvents);
  const comparison = {
    generated_at: now.toISOString(),
    inputs: {
      baseline: options.baselinePath,
      vnext: options.vnextPath,
    },
    counts: {
      baseline_v01_event_count: baselineEvents.length,
      vnext_a_event_count: vnextEvents.length,
    },
    duration: {
      baseline_v01: {
        avg_duration_min: baselineSummary.avg_duration_min,
        median_duration_min: baselineSummary.median_duration_min,
        max_duration_min: baselineSummary.max_duration_min,
        long_event_count_over_2h: baselineEvents.filter(
          (event) => event.duration_min > 120,
        ).length,
        short_event_count_lte_15m: baselineEvents.filter(
          (event) => event.duration_min <= 15,
        ).length,
      },
      vnext_a: {
        avg_duration_min: vnextSummary.avg_duration_min,
        median_duration_min: vnextSummary.median_duration_min,
        max_duration_min: vnextSummary.max_duration_min,
        long_event_count_over_2h: vnextEvents.filter(
          (event) => event.duration_min > 120,
        ).length,
        short_event_count_lte_15m: vnextEvents.filter(
          (event) => event.duration_min <= 15,
        ).length,
      },
    },
    likely_noise_events: {
      baseline_v01: likelyNoiseEvents(baselineEvents, "baseline_v01"),
      vnext_a: likelyNoiseEvents(vnextEvents, "vnext_a"),
    },
    missed_potential_events_if_heuristically_visible: newInVNext.filter(
      (event) => (event.source_likelihood_score ?? 0) >= 0.65,
    ),
    source_likelihood: {
      vnext_a: sourceScoreStats(vnextEvents),
    },
    top_20_vnext_a_by_source_likelihood: [...vnextEvents]
      .sort(
        (a, b) =>
          (b.source_likelihood_score ?? 0) - (a.source_likelihood_score ?? 0),
      )
      .slice(0, 20)
      .map(compactEvent),
    events_that_map_near_v01: mapped,
    events_new_in_vnext_a: newInVNext,
    events_removed_from_v01: removedFromV01,
  };

  await writeJson(options.jsonOutputPath, comparison);
  await writeText(options.markdownOutputPath, markdownReport(comparison));
  logger.log(
    `Comparison complete: ${baselineEvents.length} baseline events vs ${vnextEvents.length} vNext-A events.`,
  );

  return comparison;
}

export function parseArgs(argv = process.argv.slice(2)) {
  return {
    baselinePath: readOption(argv, "--baseline") ?? BASELINE_EVENTS_PATH,
    vnextPath: readOption(argv, "--vnext") ?? VNEXT_EVENTS_PATH,
    jsonOutputPath: readOption(argv, "--json-output") ?? COMPARISON_JSON_PATH,
    markdownOutputPath: readOption(argv, "--md-output") ?? COMPARISON_MD_PATH,
  };
}

if (isMain(import.meta.url)) {
  compareDetectors(parseArgs()).catch((error) => {
    console.error(error instanceof Error ? error.message : "Compare failed.");
    process.exitCode = 1;
  });
}
