#!/usr/bin/env node

import {
  CANDLES_SNAPSHOT_PATH,
  OUTPUTS_DIR,
  SYMBOLS,
  buildEventSummary,
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

export const SOURCE_CALIBRATION_RESPONSE_JSON_PATH = `${OUTPUTS_DIR}/source_calibration_chart_response.json`;
export const SOURCE_CALIBRATION_RESPONSE_MD_PATH = `${OUTPUTS_DIR}/source_calibration_chart_response.md`;
export const SOURCE_TUNED_EVENTS_PATH = `${OUTPUTS_DIR}/vnext_c_source_tuned_events.json`;
export const SOURCE_TUNED_SUMMARY_PATH = `${OUTPUTS_DIR}/vnext_c_source_tuned_summary.json`;
export const SOURCE_TUNED_GATE_JSON_PATH = `${OUTPUTS_DIR}/vnext_c_source_tuned_gate_decisions.json`;
export const SOURCE_TUNED_COMPARISON_MD_PATH = `${OUTPUTS_DIR}/vnext_c_source_tuned_comparison.md`;

const KEEP_DECISIONS = new Set(["keep", "conditional_keep"]);
const STRONG_TIMING_DECISIONS = new Set([
  "strong_timing_match",
  "reasonable_timing_match",
]);
const DEFAULT_MAX_LEAD_MIN = 360;
const RESPONSE_HORIZONS_MIN = [60, 180, 360, 720];

function hasFlag(argv, name) {
  return argv.includes(name);
}

function numberOption(argv, name, fallback) {
  const raw = readOption(argv, name);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function signForDirection(direction) {
  if (direction === "observed_down") return -1;
  if (direction === "observed_up") return 1;
  return 0;
}

function sourceTime(row) {
  const iso = row.event_timestamp?.timestamp_utc;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? { iso, ms } : null;
}

function isLeadAllowed(nearest, maxLeadMin) {
  if (!nearest) return false;
  if (nearest.relation === "source_inside_window") return true;
  if (nearest.relation !== "source_before_signal") return false;

  const leadMin = Number(nearest.lead_min ?? nearest.distance_min);
  return Number.isFinite(leadMin) && leadMin <= maxLeadMin;
}

function sourceEvidenceTargets(row, maxLeadMin) {
  const targets = [];

  for (const [scopeKey, timing] of [
    ["public_signal_timing", row.public_signal_timing],
    ["all_detected_timing", row.all_detected_timing],
  ]) {
    const nearest = timing?.nearest_signal;
    if (!timing?.catalyst_candidate_within_12h || !nearest?.signal_event_id) {
      continue;
    }
    if (!isLeadAllowed(nearest, maxLeadMin)) continue;

    const detectionScope = nearest.detection_scope ?? "unknown";
    const shouldUse =
      scopeKey === "public_signal_timing" ||
      detectionScope === "audit_event";
    if (!shouldUse) continue;

    targets.push({
      event_id: nearest.signal_event_id,
      timing_scope: detectionScope,
      timing_decision: timing.timing_decision,
      relation: nearest.relation,
      lead_min:
        nearest.relation === "source_inside_window"
          ? 0
          : Number(nearest.lead_min ?? nearest.distance_min ?? 0),
      nearest_signal: nearest,
    });
  }

  return targets;
}

function compactSourceRow(row, target) {
  return {
    catalyst_event_id: row.catalyst_event_id,
    catalyst_headline: row.catalyst_headline,
    catalyst_type: row.catalyst_type,
    context_decision: row.context_decision,
    context_quality: row.context_quality,
    context_reason: row.context_reason,
    source_support: row.source_support,
    confidence: row.confidence,
    expected_market_direction: row.expected_market_direction,
    broad_asset_coverage: row.broad_asset_coverage,
    source: row.source,
    source_url_hash: row.source_url_hash,
    source_host: row.source_host,
    source_authority: row.source_authority,
    event_timestamp: row.event_timestamp,
    timing_scope: target.timing_scope,
    timing_decision: target.timing_decision,
    relation: target.relation,
    lead_min: roundNumber(target.lead_min, 2),
  };
}

function buildSourceEvidenceByEvent(rows, maxLeadMin) {
  const byEvent = new Map();

  for (const row of rows) {
    if (!KEEP_DECISIONS.has(row.context_decision)) continue;
    if (!row.source?.url) continue;
    if (!sourceTime(row)) continue;

    for (const target of sourceEvidenceTargets(row, maxLeadMin)) {
      const bucket = byEvent.get(target.event_id) ?? new Map();
      const existing = bucket.get(row.source.url);
      const candidate = compactSourceRow(row, target);

      if (
        !existing ||
        sourceEvidenceRank(candidate) > sourceEvidenceRank(existing)
      ) {
        bucket.set(row.source.url, candidate);
      }
      byEvent.set(target.event_id, bucket);
    }
  }

  return new Map(
    [...byEvent.entries()].map(([eventId, sourceMap]) => [
      eventId,
      [...sourceMap.values()].sort((a, b) => {
        const aTime = a.event_timestamp?.timestamp_utc ?? "";
        const bTime = b.event_timestamp?.timestamp_utc ?? "";
        return aTime.localeCompare(bTime) || a.source.url.localeCompare(b.source.url);
      }),
    ]),
  );
}

function sourceEvidenceRank(row) {
  let score = 0;
  if (row.context_decision === "keep") score += 5;
  if (row.source_support === "high") score += 4;
  if (row.timing_decision === "strong_timing_match") score += 3;
  if (row.context_quality === "direct_catalyst") score += 2;
  if (row.context_quality === "market_mechanics_catalyst") score += 2;
  return score;
}

function candleTime(candle) {
  return Date.parse(candle.open_time);
}

function candleCloseAtOrAfter(candles, timestampMs) {
  return candles.find((candle) => candleTime(candle) >= timestampMs) ?? null;
}

function candleCloseAtOrBefore(candles, timestampMs) {
  for (let index = candles.length - 1; index >= 0; index -= 1) {
    const candle = candles[index];
    if (candleTime(candle) <= timestampMs) return candle;
  }
  return null;
}

function horizonMove(candles, sourceMs, horizonMin) {
  const start = candleCloseAtOrAfter(candles, sourceMs);
  const end = candleCloseAtOrBefore(candles, sourceMs + horizonMin * 60000);
  if (!start || !end || !Number.isFinite(start.close) || !Number.isFinite(end.close)) {
    return null;
  }
  if (start.close === 0) return null;

  return ((end.close - start.close) / start.close) * 100;
}

function chartResponseForSource(row, event, candlesBySymbol) {
  const source = sourceTime(row);
  const eventSign = signForDirection(event.direction);
  const horizons = {};

  for (const horizonMin of RESPONSE_HORIZONS_MIN) {
    const moves = Object.fromEntries(
      SYMBOLS.map((symbol) => [
        symbol,
        roundNumber(
          horizonMove(candlesBySymbol[symbol] ?? [], source.ms, horizonMin) ?? 0,
          4,
        ),
      ]),
    );
    const medianMove = median(Object.values(moves));
    const alignedMove =
      Number.isFinite(medianMove) && eventSign !== 0
        ? medianMove * eventSign
        : Math.abs(medianMove ?? 0);

    horizons[`${horizonMin}m`] = {
      horizon_min: horizonMin,
      median_move_pct: roundNumber(medianMove ?? 0, 4),
      aligned_move_pct: roundNumber(alignedMove, 4),
      direction_aligned:
        eventSign === 0 ? null : Number.isFinite(medianMove) && medianMove * eventSign > 0,
      move_pct_by_symbol: moves,
    };
  }

  const best = Object.values(horizons).sort(
    (a, b) => b.aligned_move_pct - a.aligned_move_pct,
  )[0];

  return {
    source_url: row.source.url,
    source_title: row.source.title ?? null,
    source_time_utc: source.iso,
    timing_decision: row.timing_decision,
    relation: row.relation,
    lead_min: row.lead_min,
    horizons,
    best_aligned_horizon_min: best?.horizon_min ?? null,
    best_aligned_move_pct: best?.aligned_move_pct ?? 0,
  };
}

function countsForEvidence(evidence) {
  return {
    matched_unique_url_count: evidence.length,
    keep_unique_url_count: evidence.filter((row) => row.context_decision === "keep")
      .length,
    conditional_keep_unique_url_count: evidence.filter(
      (row) => row.context_decision === "conditional_keep",
    ).length,
    high_support_unique_url_count: evidence.filter(
      (row) => row.source_support === "high",
    ).length,
    medium_support_unique_url_count: evidence.filter(
      (row) => row.source_support === "medium",
    ).length,
    strong_timing_unique_url_count: evidence.filter(
      (row) => row.timing_decision === "strong_timing_match",
    ).length,
    reasonable_timing_unique_url_count: evidence.filter((row) =>
      STRONG_TIMING_DECISIONS.has(row.timing_decision),
    ).length,
  };
}

function calibrationScore(counts, bestAlignedMovePct, event) {
  let score = 0;
  score += Math.min(0.3, counts.keep_unique_url_count * 0.15);
  score += Math.min(0.2, counts.conditional_keep_unique_url_count * 0.08);
  score += Math.min(0.2, counts.high_support_unique_url_count * 0.1);
  score += Math.min(0.2, counts.strong_timing_unique_url_count * 0.1);
  if (bestAlignedMovePct >= 1.5) score += 0.2;
  else if (bestAlignedMovePct >= 0.75) score += 0.12;
  else if (bestAlignedMovePct >= 0.35) score += 0.06;
  if ((event.chart_context_score ?? 0) >= 90) score += 0.08;
  else if ((event.chart_context_score ?? 0) >= 72) score += 0.04;
  return roundNumber(Math.min(1, score), 4);
}

function sourceCalibrationForEvent(event, evidence, candlesBySymbol, maxLeadMin) {
  const source_responses = evidence.map((row) =>
    chartResponseForSource(row, event, candlesBySymbol),
  );
  const bestResponse = [...source_responses].sort(
    (a, b) => b.best_aligned_move_pct - a.best_aligned_move_pct,
  )[0];
  const counts = countsForEvidence(evidence);
  const bestAlignedMovePct = bestResponse?.best_aligned_move_pct ?? 0;

  return {
    max_lead_min: maxLeadMin,
    ...counts,
    source_calibration_score: calibrationScore(counts, bestAlignedMovePct, event),
    best_aligned_response_pct: roundNumber(bestAlignedMovePct, 4),
    best_aligned_response_horizon_min:
      bestResponse?.best_aligned_horizon_min ?? null,
    has_post_source_chart_response: bestAlignedMovePct >= 0.35,
    evidence,
    source_responses,
  };
}

function publicGateDecision(event, calibration) {
  const alreadyPublic = Boolean(event.publish_candidate);
  const counts = calibration ?? {};
  const bars = Number(event.diagnostics?.evidence_bar_count ?? 1);
  const avgAbs = Math.abs(event.window_move_pct ?? 0);
  const chartScore = Number(event.chart_context_score ?? 0);
  const hasStrongSource =
    (counts.keep_unique_url_count ?? 0) >= 1 &&
    (counts.strong_timing_unique_url_count ?? 0) >= 1;
  const hasHighSupport = (counts.high_support_unique_url_count ?? 0) >= 1;
  const responseAligned = (counts.best_aligned_response_pct ?? 0) >= 0.35;
  const historyType = event.history_support_type ?? "none";
  const isRangeBreak =
    event.event_story_type === "range_break_up" ||
    event.event_story_type === "range_break_down" ||
    event.event_range_context === "broad_broke_high" ||
    event.event_range_context === "broad_broke_low";
  const isMomentumOrRelief =
    event.event_story_type?.startsWith("momentum_continuation") ||
    event.event_story_type?.startsWith("relief_reversal");

  if (alreadyPublic) {
    return {
      publish_candidate: true,
      publish_reason: event.publish_reason,
      suppress_reason: null,
      source_tuned_reason: "already_public_under_vnext_c",
      promoted_by_source_calibration: false,
    };
  }

  if (!calibration || counts.matched_unique_url_count === 0) {
    return {
      publish_candidate: false,
      publish_reason: null,
      suppress_reason: event.suppress_reason,
      source_tuned_reason: "no_keep_or_conditional_source_within_lead_window",
      promoted_by_source_calibration: false,
    };
  }

  if (
    bars >= 2 &&
    hasStrongSource &&
    responseAligned &&
    chartScore >= 72 &&
    historyType !== "none" &&
    (isMomentumOrRelief || isRangeBreak)
  ) {
    return {
      publish_candidate: true,
      publish_reason: "source_calibrated_multibar_chart_response",
      suppress_reason: null,
      source_tuned_reason:
        "accepted_source_within_6h_plus_multibar_chart_context_response",
      promoted_by_source_calibration: true,
    };
  }

  if (
    bars === 1 &&
    hasStrongSource &&
    hasHighSupport &&
    responseAligned &&
    avgAbs >= 1.5 &&
    chartScore >= 90 &&
    isRangeBreak &&
    historyType === "range_break"
  ) {
    return {
      publish_candidate: true,
      publish_reason: "source_calibrated_one_bar_range_break_review",
      suppress_reason: null,
      source_tuned_reason:
        "accepted_source_within_6h_plus_large_one_bar_range_break_response",
      promoted_by_source_calibration: true,
    };
  }

  return {
    publish_candidate: false,
    publish_reason: null,
    suppress_reason: event.suppress_reason,
    source_tuned_reason:
      bars === 1
        ? "source_match_but_one_bar_or_modest_response_kept_audit"
        : "source_match_but_gate_requirements_not_met",
    promoted_by_source_calibration: false,
  };
}

function applySourceTunedGate(events, calibrationsByEvent) {
  return events.map((event) => {
    const calibration = calibrationsByEvent.get(event.event_id) ?? null;
    const decision = publicGateDecision(event, calibration);
    const tunedEvent = {
      ...event,
      detector_version: "vnext_c_source_tuned",
      publish_gate_version: "vnext_c_source_calibrated_6h",
      source_calibration: calibration,
      source_tuned_gate: decision,
      publish_candidate: decision.publish_candidate,
      publish_reason: decision.publish_reason,
      suppress_reason: decision.suppress_reason,
      publish_gate: {
        ...(event.publish_gate ?? {}),
        decision: decision.publish_candidate ? "public" : "audit",
        publish_candidate: decision.publish_candidate,
        publish_reason: decision.publish_reason,
        suppress_reason: decision.suppress_reason,
        source_tuned_reason: decision.source_tuned_reason,
        promoted_by_source_calibration: decision.promoted_by_source_calibration,
        previous_publish_candidate: event.publish_candidate,
        previous_publish_reason: event.publish_reason,
        previous_suppress_reason: event.suppress_reason,
      },
    };

    return tunedEvent;
  });
}

function countBy(items, fn) {
  const out = {};
  for (const item of items) {
    const key = fn(item) ?? "unknown";
    out[key] = (out[key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(out).sort((a, b) => a[0].localeCompare(b[0])),
  );
}

function buildSummary({ sourceEvents, tunedEvents, calibrationsByEvent, maxLeadMin }) {
  const sourcePublic = sourceEvents.filter((event) => event.publish_candidate);
  const sourceAudit = sourceEvents.filter((event) => !event.publish_candidate);
  const tunedPublic = tunedEvents.filter((event) => event.publish_candidate);
  const tunedAudit = tunedEvents.filter((event) => !event.publish_candidate);
  const promoted = tunedEvents.filter(
    (event) => event.source_tuned_gate?.promoted_by_source_calibration,
  );
  const matchedEvents = tunedEvents.filter(
    (event) => (event.source_calibration?.matched_unique_url_count ?? 0) > 0,
  );

  return {
    generated_at: new Date().toISOString(),
    detector: "vnext_c_source_tuned",
    source_detector: "vnext_c",
    publish_gate_version: "vnext_c_source_calibrated_6h",
    source_lead_window_min: maxLeadMin,
    detected_event_count: tunedEvents.length,
    previous_public_signal_count: sourcePublic.length,
    previous_audit_event_count: sourceAudit.length,
    publish_candidate_count: tunedPublic.length,
    audit_event_count: tunedAudit.length,
    promoted_from_audit_count: promoted.length,
    demoted_from_public_count: tunedEvents.filter(
      (event) => event.source_tuned_gate?.previous_publish_candidate && !event.publish_candidate,
    ).length,
    matched_event_count: matchedEvents.length,
    matched_public_event_count: matchedEvents.filter((event) => event.publish_candidate)
      .length,
    matched_audit_event_count: matchedEvents.filter((event) => !event.publish_candidate)
      .length,
    by_source_tuned_reason: countBy(
      tunedEvents,
      (event) => event.source_tuned_gate?.source_tuned_reason,
    ),
    by_suppress_reason: countBy(tunedAudit, (event) => event.suppress_reason),
    promoted_event_ids: promoted.map((event) => event.event_id),
    source_matched_event_ids: [...calibrationsByEvent.keys()].sort(),
    ...buildEventSummary(tunedEvents, { rawSignalCount: null }),
  };
}

function gateRows(sourceEvents, tunedEvents) {
  const sourceById = new Map(sourceEvents.map((event) => [event.event_id, event]));
  return tunedEvents.map((event) => {
    const sourceEvent = sourceById.get(event.event_id);
    return {
      event_id: event.event_id,
      window_start: event.window_start,
      window_end: event.window_end,
      direction: event.direction,
      avg_change_pct: event.window_move_pct,
      evidence_bar_count: event.diagnostics?.evidence_bar_count ?? null,
      chart_context_score: event.chart_context_score,
      chart_context_label: event.chart_context_label,
      event_story_type: event.event_story_type,
      history_support_type: event.history_support_type,
      previous_publish_candidate: Boolean(sourceEvent?.publish_candidate),
      previous_publish_reason: sourceEvent?.publish_reason ?? null,
      previous_suppress_reason: sourceEvent?.suppress_reason ?? null,
      publish_candidate: event.publish_candidate,
      publish_reason: event.publish_reason,
      suppress_reason: event.suppress_reason,
      source_tuned_reason: event.source_tuned_gate?.source_tuned_reason ?? null,
      promoted_by_source_calibration: Boolean(
        event.source_tuned_gate?.promoted_by_source_calibration,
      ),
      source_calibration: event.source_calibration
        ? {
            max_lead_min: event.source_calibration.max_lead_min,
            matched_unique_url_count:
              event.source_calibration.matched_unique_url_count,
            keep_unique_url_count: event.source_calibration.keep_unique_url_count,
            conditional_keep_unique_url_count:
              event.source_calibration.conditional_keep_unique_url_count,
            high_support_unique_url_count:
              event.source_calibration.high_support_unique_url_count,
            strong_timing_unique_url_count:
              event.source_calibration.strong_timing_unique_url_count,
            source_calibration_score:
              event.source_calibration.source_calibration_score,
            best_aligned_response_pct:
              event.source_calibration.best_aligned_response_pct,
            best_aligned_response_horizon_min:
              event.source_calibration.best_aligned_response_horizon_min,
          }
        : null,
    };
  });
}

function signPct(value, digits = 2) {
  const rounded = roundNumber(value, digits);
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

function markdown({ responsePayload, summary, gateDecisions }) {
  const promoted = gateDecisions.decisions.filter(
    (row) => row.promoted_by_source_calibration,
  );
  const sourceMatchedAudit = gateDecisions.decisions.filter(
    (row) =>
      !row.previous_publish_candidate &&
      row.source_calibration?.matched_unique_url_count > 0 &&
      !row.promoted_by_source_calibration,
  );

  const lines = [
    "# Source-Calibrated Detector Gate",
    "",
    `Generated: ${summary.generated_at}`,
    `Lead window: <= ${summary.source_lead_window_min} minutes`,
    "",
    "This is a local offline calibration pass. It uses only accepted `keep` and `conditional_keep` source URLs whose timestamp is inside or before a current public/audit Signal Event by the configured lead window. It then checks the chart response after the source timestamp using existing 15m OHLCV data.",
    "",
    "## Counts",
    "",
    `- vNext-C public signals: ${summary.previous_public_signal_count}`,
    `- vNext-C audit events: ${summary.previous_audit_event_count}`,
    `- Source-tuned public signals: ${summary.publish_candidate_count}`,
    `- Source-tuned audit events: ${summary.audit_event_count}`,
    `- Promoted from audit: ${summary.promoted_from_audit_count}`,
    `- Source-matched events: ${summary.matched_event_count}`,
    "",
    "## Promoted From Audit",
    "",
  ];

  if (promoted.length === 0) {
    lines.push("- None");
  } else {
    for (const row of promoted) {
      lines.push(
        `- ${row.event_id}: ${row.window_start} to ${row.window_end}; ${row.direction}; Avg Change ${signPct(row.avg_change_pct)}; ${row.chart_context_label}; previous suppress ${row.previous_suppress_reason}; reason ${row.publish_reason}; best post-source aligned response ${signPct(row.source_calibration.best_aligned_response_pct)} over ${row.source_calibration.best_aligned_response_horizon_min}m`,
      );
    }
  }

  lines.push("", "## Source-Matched Audit Kept Audit", "");
  if (sourceMatchedAudit.length === 0) {
    lines.push("- None");
  } else {
    for (const row of sourceMatchedAudit) {
      lines.push(
        `- ${row.event_id}: ${row.window_start} to ${row.window_end}; ${row.direction}; Avg Change ${signPct(row.avg_change_pct)}; previous suppress ${row.previous_suppress_reason}; source reason ${row.source_tuned_reason}; best response ${signPct(row.source_calibration.best_aligned_response_pct)}`,
      );
    }
  }

  lines.push("", "## Matched Event Source Response", "");
  for (const event of responsePayload.events) {
    lines.push(`### ${event.event_id}`);
    lines.push(
      `- Signal: ${event.window_start} to ${event.window_end}; ${event.direction}; previous public ${event.previous_publish_candidate}; tuned public ${event.publish_candidate}`,
    );
    lines.push(
      `- Sources: ${event.source_calibration.matched_unique_url_count} unique; keep ${event.source_calibration.keep_unique_url_count}; conditional ${event.source_calibration.conditional_keep_unique_url_count}; high support ${event.source_calibration.high_support_unique_url_count}`,
    );
    lines.push(
      `- Best post-source aligned response: ${signPct(event.source_calibration.best_aligned_response_pct)} over ${event.source_calibration.best_aligned_response_horizon_min}m`,
    );
    for (const source of event.source_calibration.source_responses) {
      lines.push(
        `  - ${source.source_time_utc}; lead ${source.lead_min}m; ${source.timing_decision}; best ${signPct(source.best_aligned_move_pct)} over ${source.best_aligned_horizon_min}m; ${source.source_title}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function runSourceCalibration(options, { logger = console } = {}) {
  const [eventsPayload, sourceAudit, snapshot] = await Promise.all([
    readJson(options.eventsPath),
    readJson(options.sourceAuditPath),
    loadCandleSnapshot(options.candlesPath),
  ]);
  const sourceEvents = eventsPayload.events ?? [];
  const sourceEvidenceByEvent = buildSourceEvidenceByEvent(
    sourceAudit.rows ?? [],
    options.maxLeadMin,
  );
  const calibrationsByEvent = new Map();

  for (const event of sourceEvents) {
    const evidence = sourceEvidenceByEvent.get(event.event_id) ?? [];
    if (evidence.length === 0) continue;
    calibrationsByEvent.set(
      event.event_id,
      sourceCalibrationForEvent(
        event,
        evidence,
        snapshot.candles_by_symbol,
        options.maxLeadMin,
      ),
    );
  }

  const tunedEvents = applySourceTunedGate(sourceEvents, calibrationsByEvent);
  const summary = buildSummary({
    sourceEvents,
    tunedEvents,
    calibrationsByEvent,
    maxLeadMin: options.maxLeadMin,
  });
  const gateDecisions = {
    generated_at: summary.generated_at,
    detector: "vnext_c_source_tuned",
    source_detector: eventsPayload.detector ?? "vnext_c",
    publish_gate_version: summary.publish_gate_version,
    max_lead_min: options.maxLeadMin,
    decisions: gateRows(sourceEvents, tunedEvents),
  };
  const responsePayload = {
    generated_at: summary.generated_at,
    detector: "vnext_c_source_tuned",
    source_detector: eventsPayload.detector ?? "vnext_c",
    max_lead_min: options.maxLeadMin,
    no_claude_used: true,
    horizons_min: RESPONSE_HORIZONS_MIN,
    events: tunedEvents
      .filter((event) => event.source_calibration)
      .map((event) => ({
        event_id: event.event_id,
        window_start: event.window_start,
        window_end: event.window_end,
        direction: event.direction,
        previous_publish_candidate:
          sourceEvents.find((candidate) => candidate.event_id === event.event_id)
            ?.publish_candidate ?? false,
        publish_candidate: event.publish_candidate,
        publish_reason: event.publish_reason,
        suppress_reason: event.suppress_reason,
        source_calibration: event.source_calibration,
      })),
  };

  await writeJson(options.responseOutputPath, responsePayload);
  await writeJson(options.eventsOutputPath, {
    detector: "vnext_c_source_tuned",
    source_detector: eventsPayload.detector ?? "vnext_c",
    generated_at: summary.generated_at,
    max_lead_min: options.maxLeadMin,
    source_events_path: options.eventsPath,
    source_audit_path: options.sourceAuditPath,
    events: tunedEvents,
  });
  await writeJson(options.summaryOutputPath, summary);
  await writeJson(options.gateOutputPath, gateDecisions);
  await writeText(
    options.responseMarkdownPath,
    markdown({ responsePayload, summary, gateDecisions }),
  );
  await writeText(
    options.comparisonMarkdownPath,
    markdown({ responsePayload, summary, gateDecisions }),
  );

  logger.log(
    `Source calibration complete: ${summary.previous_public_signal_count} -> ${summary.publish_candidate_count} public, ${summary.promoted_from_audit_count} promoted, lead <= ${options.maxLeadMin}m.`,
  );

  return { summary, responsePayload, gateDecisions, tunedEvents };
}

export function parseArgs(argv = process.argv.slice(2)) {
  return {
    eventsPath: readOption(argv, "--events") ?? VNEXT_C_EVENTS_PATH,
    sourceAuditPath: readOption(argv, "--source-audit") ?? SOURCE_AUDIT_JSON_PATH,
    candlesPath: readOption(argv, "--candles") ?? CANDLES_SNAPSHOT_PATH,
    maxLeadMin: numberOption(argv, "--max-lead-min", DEFAULT_MAX_LEAD_MIN),
    responseOutputPath:
      readOption(argv, "--response-output") ??
      SOURCE_CALIBRATION_RESPONSE_JSON_PATH,
    responseMarkdownPath:
      readOption(argv, "--response-md-output") ??
      SOURCE_CALIBRATION_RESPONSE_MD_PATH,
    eventsOutputPath:
      readOption(argv, "--events-output") ?? SOURCE_TUNED_EVENTS_PATH,
    summaryOutputPath:
      readOption(argv, "--summary-output") ?? SOURCE_TUNED_SUMMARY_PATH,
    gateOutputPath:
      readOption(argv, "--gate-output") ?? SOURCE_TUNED_GATE_JSON_PATH,
    comparisonMarkdownPath:
      readOption(argv, "--comparison-md-output") ??
      SOURCE_TUNED_COMPARISON_MD_PATH,
    dryRun: hasFlag(argv, "--dry-run"),
  };
}

if (isMain(import.meta.url)) {
  runSourceCalibration(parseArgs()).catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Source calibration failed.",
    );
    process.exitCode = 1;
  });
}

export { runSourceCalibration };
