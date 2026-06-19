#!/usr/bin/env node

import {
  OUTPUTS_DIR,
  buildEventSummary,
  isMain,
  nearestMinutes,
  readJson,
  readOption,
  roundNumber,
  writeJson,
  writeText,
} from "./shared.mjs";
import { VNEXT_B_EVENTS_PATH } from "./run-vnext-b.mjs";

export const VNEXT_AB_COMPARISON_JSON_PATH = `${OUTPUTS_DIR}/vnext_ab_comparison.json`;
export const VNEXT_AB_COMPARISON_MD_PATH = `${OUTPUTS_DIR}/vnext_ab_comparison.md`;
const VNEXT_A_EVENTS_PATH = `${OUTPUTS_DIR}/vnext_a_events.json`;
const DETECTOR_VALIDATION_PATH = `${OUTPUTS_DIR}/detector_validation.json`;

function payloadEvents(payload) {
  return Array.isArray(payload) ? payload : (payload.events ?? []);
}

function near(a, b, minutes = 30) {
  const delta = nearestMinutes(a.window_start, b.window_start);
  return (
    a.direction === b.direction && Number.isFinite(delta) && delta <= minutes
  );
}

function compact(event) {
  return {
    event_id: event.event_id,
    window_start: event.window_start,
    direction: event.direction,
    duration_min: event.duration_min,
    max_abs_window_move_pct: event.max_abs_window_move_pct,
    signal_strength_score: event.signal_strength_score,
    publish_candidate: event.publish_candidate,
    suppress_reason: event.suppress_reason,
    macro_aligned: event.macro_aligned,
  };
}

function suppressedByReason(events) {
  const counts = {};

  for (const event of events.filter((item) => !item.publish_candidate)) {
    counts[event.suppress_reason ?? "unknown"] =
      (counts[event.suppress_reason ?? "unknown"] ?? 0) + 1;
  }

  return counts;
}

function sourceSupportedValidation(validation) {
  return (validation.events ?? []).filter(
    (event) =>
      event.detector === "vnext_a" &&
      ["keep", "keep_but_adjust"].includes(event.event_quality),
  );
}

function validationDirection(validationEvent) {
  if (validationEvent.event_id.endsWith(" up")) return "observed_up";
  if (validationEvent.event_id.endsWith(" down")) return "observed_down";
  return null;
}

function validationRetained(validationEvents, vnextBEvents) {
  return validationEvents.map((validationEvent) => {
    const direction = validationDirection(validationEvent);
    const match = vnextBEvents.find(
      (event) =>
        event.window_start.slice(0, 16) ===
          validationEvent.window_start.slice(0, 16) &&
        (!direction || event.direction === direction),
    );

    return {
      validation_event_id: validationEvent.event_id,
      classification: validationEvent.classification,
      source_support: validationEvent.source_support,
      retained_public: Boolean(match?.publish_candidate),
      matched_event_id: match?.event_id ?? null,
      suppress_reason: match?.suppress_reason ?? null,
    };
  });
}

export async function compareVNextAB(
  options,
  { now = new Date(), logger = console } = {},
) {
  const vnextA = payloadEvents(await readJson(options.vnextAPath));
  const vnextB = payloadEvents(await readJson(options.vnextBPath));
  let validation = { events: [] };

  try {
    validation = await readJson(options.validationPath);
  } catch {
    validation = { events: [] };
  }

  const bSummary = buildEventSummary(vnextB);
  const removedFromPublic = vnextA
    .filter((aEvent) => {
      const match = vnextB.find((bEvent) => near(aEvent, bEvent));
      return !match || !match.publish_candidate;
    })
    .map((event) => {
      const match = vnextB.find((bEvent) => near(event, bEvent));
      return {
        vnext_a_event_id: event.event_id,
        window_start: event.window_start,
        direction: event.direction,
        vnext_b_event_id: match?.event_id ?? null,
        suppress_reason: match?.suppress_reason ?? "not_detected_or_unmatched",
      };
    });
  const validationEvents = sourceSupportedValidation(validation);
  const comparison = {
    generated_at: now.toISOString(),
    detected_event_count: {
      vnext_a: vnextA.length,
      vnext_b: vnextB.length,
    },
    publish_candidate_count: {
      vnext_b: vnextB.filter((event) => event.publish_candidate).length,
    },
    suppressed_count_by_reason: suppressedByReason(vnextB),
    duration: {
      vnext_b: {
        avg_duration_min: bSummary.avg_duration_min,
        median_duration_min: bSummary.median_duration_min,
        max_duration_min: bSummary.max_duration_min,
        events_over_90_min: vnextB.filter((event) => event.duration_min > 90)
          .length,
        events_over_120_min: vnextB.filter((event) => event.duration_min > 120)
          .length,
      },
    },
    macro_aligned_event_list: vnextB.filter((event) => event.macro_aligned).map(compact),
    micro_retrace_suppressed_list: vnextB
      .filter((event) => event.suppress_reason === "micro_retrace_after_parent")
      .map(compact),
    weak_suppressed_list: vnextB
      .filter((event) => (event.suppress_reason ?? "").includes("weak"))
      .map(compact),
    top_public_candidates: vnextB
      .filter((event) => event.publish_candidate)
      .sort((a, b) => b.signal_strength_score - a.signal_strength_score)
      .slice(0, 20)
      .map(compact),
    vnext_a_events_removed_from_public_output: removedFromPublic,
    vnext_b_events_retained_from_source_supported_validation:
      validationRetained(validationEvents, vnextB),
    notes_for_claude_validation_prompt: [
      "Use signal_strength_score as detector magnitude only; do not treat it as source availability.",
      "Use macro_aligned and nearest_macro_event as route hints, not proof of cause.",
      "Prefer No Clear Cause for weekend or overnight micro-moves without dated, time-aligned sources.",
      "Daily Overview source work should use day-level context labels, not Focused Cause or Likely Cause.",
    ],
  };

  await writeJson(options.jsonOutputPath, comparison);
  await writeText(options.markdownOutputPath, markdown(comparison));
  logger.log(
    `vNext A/B comparison complete: ${vnextA.length} A events vs ${vnextB.length} B events.`,
  );

  return comparison;
}

function markdown(comparison) {
  return [
    "# vNext-A vs vNext-B Comparison",
    "",
    `Generated at: ${comparison.generated_at}`,
    "",
    `- vNext-A detected events: ${comparison.detected_event_count.vnext_a}`,
    `- vNext-B detected events: ${comparison.detected_event_count.vnext_b}`,
    `- vNext-B publish candidates: ${comparison.publish_candidate_count.vnext_b}`,
    `- vNext-B events >90 min: ${comparison.duration.vnext_b.events_over_90_min}`,
    `- vNext-B events >120 min: ${comparison.duration.vnext_b.events_over_120_min}`,
    "",
    "## Suppressed By Reason",
    "",
    ...Object.entries(comparison.suppressed_count_by_reason).map(
      ([reason, count]) => `- ${reason}: ${count}`,
    ),
    "",
    "## Macro-Aligned Events",
    "",
    ...comparison.macro_aligned_event_list.map(
      (event) =>
        `- ${event.window_start} ${event.direction} ${event.event_id} strength ${event.signal_strength_score}`,
    ),
    "",
    "## Top Public Candidates",
    "",
    ...comparison.top_public_candidates.map(
      (event) =>
        `- ${event.window_start} ${event.direction} move ${event.max_abs_window_move_pct}% strength ${event.signal_strength_score}`,
    ),
    "",
    "## Claude Validation Notes",
    "",
    ...comparison.notes_for_claude_validation_prompt.map((note) => `- ${note}`),
  ].join("\n");
}

export function parseArgs(argv = process.argv.slice(2)) {
  return {
    vnextAPath: readOption(argv, "--vnext-a") ?? VNEXT_A_EVENTS_PATH,
    vnextBPath: readOption(argv, "--vnext-b") ?? VNEXT_B_EVENTS_PATH,
    validationPath: readOption(argv, "--validation") ?? DETECTOR_VALIDATION_PATH,
    jsonOutputPath:
      readOption(argv, "--json-output") ?? VNEXT_AB_COMPARISON_JSON_PATH,
    markdownOutputPath:
      readOption(argv, "--md-output") ?? VNEXT_AB_COMPARISON_MD_PATH,
  };
}

if (isMain(import.meta.url)) {
  compareVNextAB(parseArgs()).catch((error) => {
    console.error(error instanceof Error ? error.message : "Compare failed.");
    process.exitCode = 1;
  });
}
