#!/usr/bin/env node

import {
  CANDLES_SNAPSHOT_PATH,
  OUTPUTS_DIR,
  SYMBOLS,
  isMain,
  loadCandleSnapshot,
  median,
  readJson,
  readOption,
  roundNumber,
  writeJson,
  writeText,
} from "./shared.mjs";
import { SOURCE_AUDIT_JSON_PATH } from "./audit-catalyst-sources.mjs";
import { VNEXT_C_EVENTS_PATH } from "./run-vnext-c.mjs";

export const AUDIT_SOURCE_RECHECK_JSON_PATH = `${OUTPUTS_DIR}/audit_evidence_source_recheck.json`;
export const AUDIT_SOURCE_RECHECK_MD_PATH = `${OUTPUTS_DIR}/audit_evidence_source_recheck.md`;

const ACCEPTED_SOURCE_DECISIONS = new Set(["keep", "conditional_keep"]);
const DEFAULT_MAX_LEAD_MIN = 360;
const FALLBACK_MAX_LEAD_MIN = 720;

function numberOption(argv, name, fallback) {
  const raw = readOption(argv, name);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function eventSign(event) {
  if (event.direction === "observed_down") return -1;
  if (event.direction === "observed_up") return 1;
  return 0;
}

function timeMs(iso) {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function sourceTime(row) {
  const iso = row.event_timestamp?.timestamp_utc;
  const ms = timeMs(iso);
  return ms === null ? null : { iso, ms };
}

function candleStartMs(candle) {
  return timeMs(candle.open_time);
}

function firstCandleAtOrAfter(candles, ms) {
  return candles.find((candle) => (candleStartMs(candle) ?? Infinity) >= ms);
}

function candlesBetween(candles, startMs, endMs) {
  return candles.filter((candle) => {
    const ms = candleStartMs(candle);
    return ms !== null && ms >= startMs && ms <= endMs;
  });
}

function pctChange(start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0) {
    return null;
  }
  return ((end - start) / start) * 100;
}

function closeToCloseMove(candles, sourceMs, endMs) {
  const start = firstCandleAtOrAfter(candles, sourceMs);
  const window = candlesBetween(candles, sourceMs, endMs);
  const end = window.at(-1);
  if (!start || !end) return null;
  return pctChange(Number(start.close), Number(end.close));
}

function maxAlignedExcursion(candles, sourceMs, endMs, sign) {
  const start = firstCandleAtOrAfter(candles, sourceMs);
  const window = candlesBetween(candles, sourceMs, endMs);
  if (!start || window.length === 0 || sign === 0) return null;

  const startClose = Number(start.close);
  const targetClose =
    sign > 0
      ? Math.max(...window.map((candle) => Number(candle.close)))
      : Math.min(...window.map((candle) => Number(candle.close)));
  const move = pctChange(startClose, targetClose);
  return move === null ? null : move * sign;
}

function medianAligned(values, sign) {
  const value = median(values);
  return value === null ? null : value * sign;
}

function responseMetrics(event, sourceRow, candlesBySymbol) {
  const source = sourceTime(sourceRow);
  const sign = eventSign(event);
  const eventStartMs = timeMs(event.window_start);
  const eventEndMs = timeMs(event.window_end);
  if (!source || eventStartMs === null || eventEndMs === null || sign === 0) {
    return null;
  }

  const closeToEventEnd = {};
  const excursionToEventEnd = {};
  const excursion6h = {};
  const excursion12h = {};

  for (const symbol of SYMBOLS) {
    const candles = candlesBySymbol[symbol] ?? [];
    closeToEventEnd[symbol] = closeToCloseMove(candles, source.ms, eventEndMs);
    excursionToEventEnd[symbol] = maxAlignedExcursion(
      candles,
      source.ms,
      eventEndMs,
      sign,
    );
    excursion6h[symbol] = maxAlignedExcursion(
      candles,
      source.ms,
      source.ms + 360 * 60000,
      sign,
    );
    excursion12h[symbol] = maxAlignedExcursion(
      candles,
      source.ms,
      source.ms + 720 * 60000,
      sign,
    );
  }

  return {
    source_time_utc: source.iso,
    source_to_window_start_min: roundNumber((eventStartMs - source.ms) / 60000, 2),
    source_to_window_end_min: roundNumber((eventEndMs - source.ms) / 60000, 2),
    event_window_aligned_move_pct: roundNumber(
      Math.abs(Number(event.window_move_pct ?? 0)),
      4,
    ),
    median_source_to_event_end_aligned_close_pct: roundNumber(
      medianAligned(Object.values(closeToEventEnd), sign) ?? 0,
      4,
    ),
    median_max_aligned_excursion_to_event_end_pct: roundNumber(
      median(Object.values(excursionToEventEnd)) ?? 0,
      4,
    ),
    median_max_aligned_excursion_6h_pct: roundNumber(
      median(Object.values(excursion6h)) ?? 0,
      4,
    ),
    median_max_aligned_excursion_12h_pct: roundNumber(
      median(Object.values(excursion12h)) ?? 0,
      4,
    ),
    source_to_event_end_aligned_close_pct_by_symbol: Object.fromEntries(
      Object.entries(closeToEventEnd).map(([symbol, value]) => [
        symbol,
        roundNumber((value ?? 0) * sign, 4),
      ]),
    ),
    max_aligned_excursion_to_event_end_pct_by_symbol: Object.fromEntries(
      Object.entries(excursionToEventEnd).map(([symbol, value]) => [
        symbol,
        roundNumber(value ?? 0, 4),
      ]),
    ),
  };
}

function timingForRow(row) {
  const timing = row.all_detected_timing;
  const nearest = timing?.nearest_signal;
  if (!nearest) return null;

  const relation = nearest.relation;
  const leadMin =
    relation === "source_inside_window" || relation === "inside_evidence_window"
      ? 0
      : Number(nearest.lead_min ?? nearest.distance_min ?? 0);

  return {
    timing_decision: timing.timing_decision,
    relation,
    lead_min: roundNumber(leadMin, 2),
    signal_event_id: nearest.signal_event_id,
    detection_scope: nearest.detection_scope,
  };
}

function sourceBrief(row, timing, metrics = null) {
  return {
    catalyst_event_id: row.catalyst_event_id,
    catalyst_headline: row.catalyst_headline,
    catalyst_type: row.catalyst_type,
    context_decision: row.context_decision,
    context_quality: row.context_quality,
    context_reason: row.context_reason,
    source_support: row.source_support,
    confidence: row.confidence,
    broad_asset_coverage: row.broad_asset_coverage,
    source_time_utc: row.event_timestamp?.timestamp_utc ?? null,
    timestamp_basis: row.event_timestamp?.timestamp_basis ?? null,
    timestamp_reliability: row.event_timestamp?.timestamp_reliability ?? null,
    timing,
    source: {
      title: row.source?.title ?? null,
      publisher: row.source?.publisher ?? null,
      url: row.source?.url ?? null,
    },
    response_metrics: metrics,
  };
}

function uniqueByUrl(rows) {
  const byUrl = new Map();
  for (const row of rows) {
    const url = row.source?.url;
    if (!url || byUrl.has(url)) continue;
    byUrl.set(url, row);
  }
  return [...byUrl.values()];
}

function mappedRowsForEvent(event, sourceRows) {
  return sourceRows
    .filter((row) => {
      const timing = timingForRow(row);
      return timing?.signal_event_id === event.event_id && sourceTime(row);
    })
    .sort((a, b) => {
      const aTiming = timingForRow(a);
      const bTiming = timingForRow(b);
      return Math.abs(aTiming?.lead_min ?? 999999) - Math.abs(bTiming?.lead_min ?? 999999);
    });
}

function fallbackAcceptedRowsForEvent(event, sourceRows, maxLeadMin) {
  const eventStartMs = timeMs(event.window_start);
  const eventEndMs = timeMs(event.window_end);
  if (eventStartMs === null || eventEndMs === null) return [];

  return sourceRows
    .filter((row) => {
      const source = sourceTime(row);
      if (!source || !ACCEPTED_SOURCE_DECISIONS.has(row.context_decision)) {
        return false;
      }
      const isBeforeOrInside = source.ms <= eventEndMs;
      const leadMin = Math.max(0, (eventStartMs - source.ms) / 60000);
      return isBeforeOrInside && leadMin <= maxLeadMin;
    })
    .sort((a, b) => {
      const aDelta = Math.abs(eventStartMs - sourceTime(a).ms);
      const bDelta = Math.abs(eventStartMs - sourceTime(b).ms);
      return aDelta - bDelta;
    });
}

function isAcceptedLead(row, maxLeadMin) {
  const timing = timingForRow(row);
  if (!timing || !ACCEPTED_SOURCE_DECISIONS.has(row.context_decision)) return false;
  if (
    timing.relation !== "source_before_signal" &&
    timing.relation !== "source_inside_window" &&
    timing.relation !== "inside_evidence_window"
  ) {
    return false;
  }
  return timing.lead_min <= maxLeadMin;
}

function assessmentForEvent(event, acceptedSources, bestMetrics) {
  if (acceptedSources.length === 0) return "no_accepted_source_within_6h";

  const bars = Number(event.diagnostics?.evidence_bar_count ?? 1);
  const eventMove = Math.abs(Number(event.window_move_pct ?? 0));
  const chartScore = Number(event.chart_context_score ?? 0);
  const excursionEnd =
    bestMetrics?.median_max_aligned_excursion_to_event_end_pct ?? 0;
  const excursion6h = bestMetrics?.median_max_aligned_excursion_6h_pct ?? 0;
  const highSupportCount = acceptedSources.filter(
    (row) => row.source_support === "high",
  ).length;

  if (
    bars >= 2 &&
    chartScore >= 72 &&
    highSupportCount > 0 &&
    eventMove >= 0.45 &&
    Math.max(excursionEnd, eventMove) >= 0.45
  ) {
    return "public_review_candidate_multibar_source_backed";
  }

  if (
    bars === 1 &&
    chartScore >= 90 &&
    highSupportCount > 0 &&
    event.event_story_type?.includes("range_break") &&
    eventMove >= 0.65 &&
    Math.max(excursion6h, eventMove) >= 0.65
  ) {
    return "conditional_public_review_candidate_one_bar_range_break";
  }

  return "keep_audit_after_recheck";
}

function recheckEvent(event, sourceRows, candlesBySymbol, maxLeadMin) {
  const mappedRows = mappedRowsForEvent(event, sourceRows);
  const acceptedMappedRows = uniqueByUrl(
    mappedRows.filter((row) => isAcceptedLead(row, maxLeadMin)),
  );
  const fallbackAcceptedRows = uniqueByUrl(
    fallbackAcceptedRowsForEvent(event, sourceRows, FALLBACK_MAX_LEAD_MIN),
  );
  const selectedAcceptedRows =
    acceptedMappedRows.length > 0 ? acceptedMappedRows : fallbackAcceptedRows;
  const closestMapped = mappedRows[0] ?? null;
  const closestAccepted = selectedAcceptedRows[0] ?? null;
  const acceptedWithMetrics = selectedAcceptedRows.map((row) => {
    const timing = timingForRow(row) ?? {
      timing_decision: "fallback_time_proximity",
      relation: "source_before_signal",
      lead_min: roundNumber(
        Math.max(0, (timeMs(event.window_start) - sourceTime(row).ms) / 60000),
        2,
      ),
      signal_event_id: event.event_id,
      detection_scope: "audit_event",
    };
    return sourceBrief(row, timing, responseMetrics(event, row, candlesBySymbol));
  });
  const bestAccepted = [...acceptedWithMetrics].sort(
    (a, b) =>
      (b.response_metrics?.median_max_aligned_excursion_6h_pct ?? 0) -
      (a.response_metrics?.median_max_aligned_excursion_6h_pct ?? 0),
  )[0];
  const bestMetrics = bestAccepted?.response_metrics ?? null;
  const closestMappedBrief = closestMapped
    ? sourceBrief(closestMapped, timingForRow(closestMapped), responseMetrics(event, closestMapped, candlesBySymbol))
    : null;

  return {
    event_id: event.event_id,
    window_start: event.window_start,
    window_end: event.window_end,
    direction: event.direction,
    avg_change_pct: roundNumber(event.window_move_pct ?? 0, 4),
    evidence_bar_count: Number(event.diagnostics?.evidence_bar_count ?? 1),
    chart_context_score: event.chart_context_score ?? null,
    chart_context_label: event.chart_context_label ?? null,
    event_story_type: event.event_story_type ?? null,
    event_range_context: event.event_range_context ?? null,
    history_support_type: event.history_support_type ?? null,
    suppress_reason: event.suppress_reason,
    closest_mapped_source: closestMappedBrief,
    accepted_source_count_within_6h: acceptedMappedRows.length,
    accepted_source_count_within_12h_fallback: fallbackAcceptedRows.length,
    accepted_sources: acceptedWithMetrics,
    best_accepted_source: bestAccepted ?? null,
    recheck_assessment: assessmentForEvent(
      event,
      acceptedMappedRows,
      bestMetrics,
    ),
  };
}

function countBy(items, key) {
  const out = {};
  for (const item of items) {
    const value = typeof key === "function" ? key(item) : item[key];
    out[value ?? "unknown"] = (out[value ?? "unknown"] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(out).sort((a, b) => a[0].localeCompare(b[0])),
  );
}

function signPct(value) {
  const rounded = roundNumber(value, 2);
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

function sourceLine(source) {
  if (!source) return "None";
  const timing = source.timing;
  return `${source.source_time_utc ?? "unknown time"}; ${timing?.relation ?? "n/a"}; lead ${timing?.lead_min ?? "n/a"}m; ${source.context_decision}; ${source.source_support}; ${source.source.title ?? source.source.url}`;
}

function markdown(payload) {
  const lines = [
    "# Audit Evidence Closest Catalyst Source Recheck",
    "",
    `Generated: ${payload.generated_at}`,
    `Audit events checked: ${payload.summary.audit_event_count}`,
    `Accepted source lead window: <= ${payload.max_lead_min} minutes`,
    "",
    "This local report rechecks every current audit-only Signal Event against its closest mapped catalyst source and any accepted keep/conditional source before or inside the event window. It adds max aligned excursion so short reactions are not missed by close-to-close response only.",
    "",
    "## Assessment Counts",
    "",
    ...Object.entries(payload.summary.by_recheck_assessment).map(
      ([key, value]) => `- ${key}: ${value}`,
    ),
    "",
    "## Public Review Candidates",
    "",
  ];

  const candidates = payload.items.filter((item) =>
    item.recheck_assessment.includes("public_review_candidate"),
  );
  if (candidates.length === 0) {
    lines.push("- None");
  } else {
    for (const item of candidates) {
      const best = item.best_accepted_source;
      const metrics = best?.response_metrics;
      lines.push(`### ${item.window_start} to ${item.window_end}`);
      lines.push(`- ID: ${item.event_id}`);
      lines.push(`- Direction: ${item.direction}`);
      lines.push(`- Avg Change: ${signPct(item.avg_change_pct)}`);
      lines.push(`- Evidence bars: ${item.evidence_bar_count}`);
      lines.push(`- Chart context: ${item.chart_context_label} (${item.chart_context_score})`);
      lines.push(`- Suppress reason: ${item.suppress_reason}`);
      lines.push(`- Assessment: ${item.recheck_assessment}`);
      lines.push(`- Best source: ${sourceLine(best)}`);
      if (metrics) {
        lines.push(
          `- Response: event ${signPct(metrics.event_window_aligned_move_pct)}, max excursion to event end ${signPct(metrics.median_max_aligned_excursion_to_event_end_pct)}, max 6h excursion ${signPct(metrics.median_max_aligned_excursion_6h_pct)}`,
        );
      }
      lines.push("");
    }
  }

  lines.push("## All Audit Events");
  lines.push("");
  for (const item of payload.items) {
    lines.push(`### ${item.window_start.slice(0, 16)} ${item.direction}`);
    lines.push(`- ID: ${item.event_id}`);
    lines.push(`- Evidence window: ${item.window_start} to ${item.window_end}`);
    lines.push(`- Avg Change: ${signPct(item.avg_change_pct)}`);
    lines.push(`- Bars: ${item.evidence_bar_count}`);
    lines.push(`- Chart context: ${item.chart_context_label} (${item.chart_context_score})`);
    lines.push(`- Suppress reason: ${item.suppress_reason}`);
    lines.push(`- Closest mapped source: ${sourceLine(item.closest_mapped_source)}`);
    lines.push(`- Accepted sources within 6h: ${item.accepted_source_count_within_6h}`);
    lines.push(`- Assessment: ${item.recheck_assessment}`);
    if (item.best_accepted_source?.response_metrics) {
      const metrics = item.best_accepted_source.response_metrics;
      lines.push(
        `- Best accepted response: event ${signPct(metrics.event_window_aligned_move_pct)}, max-to-end ${signPct(metrics.median_max_aligned_excursion_to_event_end_pct)}, max-6h ${signPct(metrics.median_max_aligned_excursion_6h_pct)}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function runAuditSourceRecheck(options, { logger = console } = {}) {
  const [eventsPayload, sourceAudit, snapshot] = await Promise.all([
    readJson(options.eventsPath),
    readJson(options.sourceAuditPath),
    loadCandleSnapshot(options.candlesPath),
  ]);
  const auditEvents = (eventsPayload.events ?? [])
    .filter((event) => !event.publish_candidate)
    .sort((a, b) => a.window_start.localeCompare(b.window_start));
  const items = auditEvents.map((event) =>
    recheckEvent(
      event,
      sourceAudit.rows ?? [],
      snapshot.candles_by_symbol,
      options.maxLeadMin,
    ),
  );
  const payload = {
    generated_at: new Date().toISOString(),
    detector: eventsPayload.detector ?? "unknown",
    max_lead_min: options.maxLeadMin,
    fallback_max_lead_min: FALLBACK_MAX_LEAD_MIN,
    no_claude_used: true,
    summary: {
      audit_event_count: auditEvents.length,
      accepted_source_matched_event_count: items.filter(
        (item) => item.accepted_source_count_within_6h > 0,
      ).length,
      public_review_candidate_count: items.filter((item) =>
        item.recheck_assessment.includes("public_review_candidate"),
      ).length,
      by_recheck_assessment: countBy(items, "recheck_assessment"),
      by_suppress_reason: countBy(items, "suppress_reason"),
    },
    items,
  };

  await writeJson(options.jsonOutputPath, payload);
  await writeText(options.markdownOutputPath, markdown(payload));
  logger.log(
    `Audit source recheck complete: ${items.length} audit events, ${payload.summary.public_review_candidate_count} review candidates.`,
  );
  return payload;
}

export function parseArgs(argv = process.argv.slice(2)) {
  return {
    eventsPath: readOption(argv, "--events") ?? VNEXT_C_EVENTS_PATH,
    sourceAuditPath: readOption(argv, "--source-audit") ?? SOURCE_AUDIT_JSON_PATH,
    candlesPath: readOption(argv, "--candles") ?? CANDLES_SNAPSHOT_PATH,
    maxLeadMin: numberOption(argv, "--max-lead-min", DEFAULT_MAX_LEAD_MIN),
    jsonOutputPath:
      readOption(argv, "--json-output") ?? AUDIT_SOURCE_RECHECK_JSON_PATH,
    markdownOutputPath:
      readOption(argv, "--md-output") ?? AUDIT_SOURCE_RECHECK_MD_PATH,
  };
}

if (isMain(import.meta.url)) {
  runAuditSourceRecheck(parseArgs()).catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Audit source recheck failed.",
    );
    process.exitCode = 1;
  });
}
