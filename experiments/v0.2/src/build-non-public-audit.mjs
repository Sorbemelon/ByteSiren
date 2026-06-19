#!/usr/bin/env node

import {
  OUTPUTS_DIR,
  isMain,
  nearestMinutes,
  readJson,
  readOption,
  roundNumber,
  writeJson,
  writeText,
} from "./shared.mjs";
import { VNEXT_B_EVENTS_PATH } from "./run-vnext-b.mjs";

export const NON_PUBLIC_AUDIT_JSON_PATH = `${OUTPUTS_DIR}/non_public_audit_events.json`;
export const NON_PUBLIC_AUDIT_MD_PATH = `${OUTPUTS_DIR}/non_public_audit_events.md`;

const SUPPRESS_REASON_TEXT = {
  below_publish_gate:
    "Did not pass the public publish gate for change, macro alignment, or very high breadth-confirmed strength.",
  weak_window_move_lt_1pct:
    "The event stayed below the weak-change floor, so it is retained for audit but not public review.",
  weak_weekend_overnight_micro_move:
    "Weekend or overnight UTC change stayed in the micro-change band and is likely poor public-feed signal.",
  micro_retrace_after_parent:
    "Opposite-direction retrace opened within one bar after a stronger public parent event.",
  long_vague_window:
    "Window was too long and vague for a compact public event.",
  volume_range_without_meaningful_price_move:
    "Volume or range confirmation was present without meaningful price change.",
};

function displayDateTime(iso) {
  const date = new Date(iso);
  return `${iso.slice(0, 10)} ${String(date.getUTCHours()).padStart(2, "0")}:${String(
    date.getUTCMinutes(),
  ).padStart(2, "0")} UTC`;
}

function nearbyPublicEvent(event, publicEvents) {
  const sameDay = publicEvents.filter(
    (candidate) => candidate.window_start.slice(0, 10) === event.window_start.slice(0, 10),
  );
  const candidates = sameDay.length > 0 ? sameDay : publicEvents;
  const nearest = candidates
    .map((candidate) => ({
      id: candidate.event_id,
      window_start: candidate.window_start,
      direction: candidate.direction,
      avg_change_pct: candidate.window_move_pct,
      delta_min: nearestMinutes(event.window_start, candidate.window_start),
    }))
    .filter((candidate) => Number.isFinite(candidate.delta_min))
    .sort((a, b) => a.delta_min - b.delta_min)[0];

  if (!nearest || nearest.delta_min > 240) {
    return null;
  }

  return nearest;
}

function auditEvent(event, publicEvents) {
  return {
    id: event.event_id,
    date_time: displayDateTime(event.window_start),
    evidence_window: {
      start: event.window_start,
      end: event.window_end,
      duration_min: event.duration_min,
    },
    direction: event.direction,
    avg_change_pct: roundNumber(event.window_move_pct, 4),
    avg_change_label: "Avg Change",
    signals_count: event.signals_count,
    n_tracked: event.n_tracked,
    suppress_reason: event.suppress_reason,
    why_suppressed:
      SUPPRESS_REASON_TEXT[event.suppress_reason] ??
      "Retained in detector output but not selected for public preview.",
    chart: {
      chart_highlight_type: "event_window",
      highlight_start: event.window_start,
      highlight_end: event.window_end,
      peak_marker_time: event.peak_time,
      feed_card_id: `audit_${event.event_id}`,
    },
    nearby_public_event: nearbyPublicEvent(event, publicEvents),
    reviewer_notes: "",
  };
}

export function buildNonPublicAuditEvents(signalEvents) {
  const publicEvents = signalEvents.filter((event) => event.publish_candidate);
  const auditEvents = signalEvents
    .filter((event) => !event.publish_candidate)
    .sort((a, b) => a.window_start.localeCompare(b.window_start))
    .map((event) => auditEvent(event, publicEvents));

  return {
    generated_at: new Date().toISOString(),
    count: auditEvents.length,
    items: auditEvents,
  };
}

function markdown(payload) {
  const lines = [
    "# Non-Public Audit Events",
    "",
    `Count: ${payload.count}`,
    "",
  ];

  for (const item of payload.items) {
    lines.push(`## ${item.date_time} - ${item.direction}`);
    lines.push(`- ID: ${item.id}`);
    lines.push(
      `- Evidence window: ${item.evidence_window.start} to ${item.evidence_window.end} (${item.evidence_window.duration_min} min)`,
    );
    lines.push(
      `- Avg Change: ${item.avg_change_pct >= 0 ? "+" : ""}${item.avg_change_pct}%`,
    );
    lines.push(`- Signals: ${item.signals_count} of ${item.n_tracked}`);
    lines.push(`- Suppress reason: ${item.suppress_reason}`);
    lines.push(`- Why suppressed: ${item.why_suppressed}`);
    lines.push(
      `- Chart: ${item.chart.chart_highlight_type}, ${item.chart.highlight_start} to ${item.chart.highlight_end}`,
    );
    lines.push(
      `- Nearby public event: ${
        item.nearby_public_event
          ? `${item.nearby_public_event.id} (${item.nearby_public_event.delta_min} min)`
          : "None within 240 minutes"
      }`,
    );
    lines.push("- Reviewer notes: ");
    lines.push("");
  }

  return lines.join("\n");
}

export async function runNonPublicAudit(options, { logger = console } = {}) {
  const signalEvents = (await readJson(options.signalEventsPath)).events ?? [];
  const payload = buildNonPublicAuditEvents(signalEvents);

  await writeJson(options.jsonOutputPath, payload);
  await writeText(options.markdownOutputPath, markdown(payload));
  logger.log(`Non-public audit complete: ${payload.count} events.`);

  return payload;
}

export function parseArgs(argv = process.argv.slice(2)) {
  return {
    signalEventsPath: readOption(argv, "--events") ?? VNEXT_B_EVENTS_PATH,
    jsonOutputPath: readOption(argv, "--json-output") ?? NON_PUBLIC_AUDIT_JSON_PATH,
    markdownOutputPath: readOption(argv, "--md-output") ?? NON_PUBLIC_AUDIT_MD_PATH,
  };
}

if (isMain(import.meta.url)) {
  runNonPublicAudit(parseArgs()).catch((error) => {
    console.error(error instanceof Error ? error.message : "Audit build failed.");
    process.exitCode = 1;
  });
}
