#!/usr/bin/env node

import {
  OUTPUTS_DIR,
  buildEventSummary,
  isMain,
  readJson,
  readOption,
  writeJson,
  writeText,
} from "./shared.mjs";
import { VNEXT_B_EVENTS_PATH } from "./run-vnext-b.mjs";
import { VNEXT_C_EVENTS_PATH } from "./run-vnext-c.mjs";

export const VNEXT_BC_COMPARISON_JSON_PATH = `${OUTPUTS_DIR}/vnext_bc_comparison.json`;
export const VNEXT_BC_COMPARISON_MD_PATH = `${OUTPUTS_DIR}/vnext_bc_comparison.md`;

function payloadEvents(payload) {
  return Array.isArray(payload) ? payload : (payload.events ?? []);
}

function compact(event) {
  if (!event) return null;
  return {
    event_id: event.event_id,
    source_vnext_b_event_id: event.source_vnext_b_event_id ?? event.event_id,
    window_start: event.window_start,
    direction: event.direction,
    avg_change_pct: event.window_move_pct,
    signals_count: event.signals_count,
    max_abs_window_move_pct: event.max_abs_window_move_pct,
    signal_strength_score: event.signal_strength_score,
    chart_context_score: event.chart_context_score,
    chart_context_label: event.chart_context_label,
    event_story_type: event.event_story_type,
    event_range_context: event.event_range_context,
    trend_context: event.trend_context,
    momentum_type: event.momentum_type,
    volatility_context: event.volatility_context,
    publish_candidate: event.publish_candidate,
    publish_reason: event.publish_reason,
    suppress_reason: event.suppress_reason,
  };
}

function eventMidpoint(event) {
  return (Date.parse(event.window_start) + Date.parse(event.window_end)) / 2;
}

function overlapMinutes(a, b) {
  const start = Math.max(
    Date.parse(a.window_start),
    Date.parse(b.window_start),
  );
  const end = Math.min(Date.parse(a.window_end), Date.parse(b.window_end));
  return Math.max(0, (end - start) / 60000);
}

function nearestBEvent(cEvent, bEvents, usedIds) {
  const candidates = bEvents
    .filter((event) => !usedIds.has(event.event_id))
    .map((event) => {
      const midpointDelta =
        Math.abs(eventMidpoint(cEvent) - eventMidpoint(event)) / 60000;
      const startDelta =
        Math.abs(
          Date.parse(cEvent.window_start) - Date.parse(event.window_start),
        ) / 60000;
      const overlap = overlapMinutes(cEvent, event);
      const directionPenalty = event.direction === cEvent.direction ? 0 : 60;
      const score =
        Math.min(midpointDelta, startDelta) - overlap + directionPenalty;
      return { event, score, midpointDelta, startDelta, overlap };
    })
    .filter(
      (item) =>
        item.overlap > 0 || item.midpointDelta <= 60 || item.startDelta <= 60,
    )
    .sort((a, b) => a.score - b.score);

  return candidates[0]?.event ?? null;
}

function suppressedByReason(events) {
  return events
    .filter((event) => !event.publish_candidate)
    .reduce((acc, event) => {
      const key = event.suppress_reason ?? "unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
}

export async function compareVNextBC(
  options,
  { now = new Date(), logger = console } = {},
) {
  const vnextB = payloadEvents(await readJson(options.vnextBPath));
  const vnextC = payloadEvents(await readJson(options.vnextCPath));
  const bById = new Map(vnextB.map((event) => [event.event_id, event]));
  const usedBIds = new Set();
  const keptPublic = [];
  const demotedToAudit = [];
  const promotedToPublic = [];
  const stillAudit = [];

  for (const cEvent of vnextC) {
    const bEvent =
      bById.get(cEvent.source_vnext_b_event_id) ??
      nearestBEvent(cEvent, vnextB, usedBIds);
    if (bEvent) usedBIds.add(bEvent.event_id);
    if (bEvent?.publish_candidate && cEvent.publish_candidate) {
      keptPublic.push({ before: compact(bEvent), after: compact(cEvent) });
    } else if (bEvent?.publish_candidate && !cEvent.publish_candidate) {
      demotedToAudit.push({ before: compact(bEvent), after: compact(cEvent) });
    } else if (!bEvent?.publish_candidate && cEvent.publish_candidate) {
      promotedToPublic.push({
        before: compact(bEvent),
        after: compact(cEvent),
      });
    } else {
      stillAudit.push({ before: compact(bEvent), after: compact(cEvent) });
    }
  }

  const removedPublic = vnextB
    .filter((event) => event.publish_candidate && !usedBIds.has(event.event_id))
    .map((event) => ({ before: compact(event), after: null }));

  const comparison = {
    generated_at: now.toISOString(),
    detected_event_count: {
      vnext_b: vnextB.length,
      vnext_c: vnextC.length,
    },
    publish_candidate_count: {
      vnext_b: vnextB.filter((event) => event.publish_candidate).length,
      vnext_c: vnextC.filter((event) => event.publish_candidate).length,
    },
    audit_event_count: {
      vnext_b: vnextB.filter((event) => !event.publish_candidate).length,
      vnext_c: vnextC.filter((event) => !event.publish_candidate).length,
    },
    duration: {
      vnext_b: buildEventSummary(vnextB),
      vnext_c: buildEventSummary(vnextC),
    },
    suppressed_count_by_reason: {
      vnext_b: suppressedByReason(vnextB),
      vnext_c: suppressedByReason(vnextC),
    },
    kept_public_from_vnext_b: keptPublic,
    moved_public_to_audit: demotedToAudit,
    removed_vnext_b_public: removedPublic,
    moved_audit_to_public: promotedToPublic,
    still_audit_only: stillAudit,
    strongest_chart_context_events: vnextC
      .toSorted((a, b) => b.chart_context_score - a.chart_context_score)
      .slice(0, 10)
      .map(compact),
    weakest_chart_context_events: vnextC
      .toSorted((a, b) => a.chart_context_score - b.chart_context_score)
      .slice(0, 10)
      .map(compact),
    notes_for_claude_validation_prompt: [
      "Use chart_context_label and event_story_type as market-structure hints, not source proof.",
      "Range Position and Range break are descriptive chart context, not trading advice.",
      "Do not infer a cause from chart context alone.",
      "Use No Clear Cause or Market Backdrop when sources do not support a specific cause.",
    ],
  };

  await writeJson(options.jsonOutputPath, comparison);
  await writeText(options.markdownOutputPath, markdown(comparison));
  logger.log(
    `vNext B/C comparison complete: ${comparison.publish_candidate_count.vnext_b} B public vs ${comparison.publish_candidate_count.vnext_c} C public.`,
  );

  return comparison;
}

function markdown(comparison) {
  const lines = [
    "# vNext-B vs vNext-C Comparison",
    "",
    `Generated at: ${comparison.generated_at}`,
    "",
    `- vNext-B detected events: ${comparison.detected_event_count.vnext_b}`,
    `- vNext-C detected events: ${comparison.detected_event_count.vnext_c}`,
    `- vNext-B public candidates: ${comparison.publish_candidate_count.vnext_b}`,
    `- vNext-C public candidates: ${comparison.publish_candidate_count.vnext_c}`,
    `- vNext-B audit events: ${comparison.audit_event_count.vnext_b}`,
    `- vNext-C audit events: ${comparison.audit_event_count.vnext_c}`,
    "",
    "## Public/Audit Movement",
    "",
    `- Kept public: ${comparison.kept_public_from_vnext_b.length}`,
    `- Moved public to audit: ${comparison.moved_public_to_audit.length}`,
    `- Removed vNext-B public windows: ${comparison.removed_vnext_b_public.length}`,
    `- Moved audit to public: ${comparison.moved_audit_to_public.length}`,
    `- Still audit-only: ${comparison.still_audit_only.length}`,
    "",
    "## vNext-C Suppressed By Reason",
    "",
    ...Object.entries(comparison.suppressed_count_by_reason.vnext_c).map(
      ([reason, count]) => `- ${reason}: ${count}`,
    ),
    "",
    "## Strongest Chart-Context Events",
    "",
    ...comparison.strongest_chart_context_events.map(
      (event) =>
        `- ${event.window_start} ${event.direction}: ${event.chart_context_label} score ${event.chart_context_score}; ${event.event_story_type}; public=${event.publish_candidate}`,
    ),
    "",
    "## Weakest Chart-Context Events",
    "",
    ...comparison.weakest_chart_context_events.map(
      (event) =>
        `- ${event.window_start} ${event.direction}: ${event.chart_context_label} score ${event.chart_context_score}; suppress=${event.suppress_reason}`,
    ),
    "",
    "## Moved Public To Audit",
    "",
    ...comparison.moved_public_to_audit.map(
      ({ before, after }) =>
        `- ${before.window_start} ${before.direction}: ${before.event_id} -> ${after.event_id}; ${after.suppress_reason}; ${after.chart_context_label} ${after.chart_context_score}`,
    ),
    ...comparison.removed_vnext_b_public.map(
      ({ before }) =>
        `- ${before.window_start} ${before.direction}: ${before.event_id} removed by vNext-C window builder`,
    ),
    "",
    "## Moved Audit To Public",
    "",
    ...comparison.moved_audit_to_public.map(
      ({ before, after }) =>
        `- ${after.window_start} ${after.direction}: ${before?.event_id ?? "unmatched"} -> ${after.event_id}; ${after.publish_reason}; ${after.chart_context_label} ${after.chart_context_score}`,
    ),
    "",
    "## Claude Validation Notes",
    "",
    ...comparison.notes_for_claude_validation_prompt.map((note) => `- ${note}`),
  ];

  return lines.join("\n");
}

export function parseArgs(argv = process.argv.slice(2)) {
  return {
    vnextBPath: readOption(argv, "--vnext-b") ?? VNEXT_B_EVENTS_PATH,
    vnextCPath: readOption(argv, "--vnext-c") ?? VNEXT_C_EVENTS_PATH,
    jsonOutputPath:
      readOption(argv, "--json-output") ?? VNEXT_BC_COMPARISON_JSON_PATH,
    markdownOutputPath:
      readOption(argv, "--md-output") ?? VNEXT_BC_COMPARISON_MD_PATH,
  };
}

if (isMain(import.meta.url)) {
  compareVNextBC(parseArgs()).catch((error) => {
    console.error(error instanceof Error ? error.message : "Compare failed.");
    process.exitCode = 1;
  });
}
