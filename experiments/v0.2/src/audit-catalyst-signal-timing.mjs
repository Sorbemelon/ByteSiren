import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXPERIMENT_ROOT = path.resolve(__dirname, "..");
const OUTPUTS_DIR = path.join(EXPERIMENT_ROOT, "outputs");
const CLAUDE_OUTPUTS_DIR = path.join(
  EXPERIMENT_ROOT,
  "claude-validation",
  "outputs",
);

const FEED_CONTRACT_PATH = path.join(OUTPUTS_DIR, "feed_contract_v02.json");
const AUDIT_EVENTS_PATH = path.join(OUTPUTS_DIR, "non_public_audit_events.json");
const CATALYSTS_PATH = path.join(
  CLAUDE_OUTPUTS_DIR,
  "independent_catalyst_events_30d.json",
);
const REFINEMENTS_PATH = path.join(OUTPUTS_DIR, "catalyst_time_refinements.json");
const AUDIT_JSON_PATH = path.join(
  OUTPUTS_DIR,
  "catalyst_signal_timing_audit.json",
);
const AUDIT_MD_PATH = path.join(
  OUTPUTS_DIR,
  "catalyst_signal_timing_audit.md",
);

const SUPPORT_LEVELS = ["high", "medium"];
const LEAD_WINDOWS_MIN = [360, 720, 1440];

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(filePath, value) {
  await writeFile(filePath, `${value.trimEnd()}\n`, "utf8");
}

function parseTime(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function minutesBetween(fromMs, toMs) {
  return Math.round((toMs - fromMs) / 60000);
}

function flattenFeedItems(feedContract) {
  return (feedContract.day_groups ?? []).flatMap((dayGroup) =>
    (dayGroup.items ?? []).map((item) => ({
      ...item,
      date_utc: item.date_utc ?? dayGroup.date_utc,
      day_post_id: dayGroup.day_post_id,
    })),
  );
}

function normalizePublicSignal(item) {
  if (item.item_type !== "signal_event") return null;
  const start = item.evidence_window?.start ?? item.chart?.highlight_start;
  const end = item.evidence_window?.end ?? item.chart?.highlight_end;
  const startMs = parseTime(start);
  const endMs = parseTime(end);
  if (startMs === null || endMs === null) return null;

  return {
    detection_scope: "public_signal",
    id: item.id ?? item.event_id,
    item_type: item.item_type,
    date_utc: item.date_utc,
    start,
    end,
    start_ms: startMs,
    end_ms: endMs,
    display_window:
      item.display_window ??
      item.evidence_window_display ??
      item.evidence_window?.display ??
      `${start} - ${end}`,
    direction: item.direction,
    avg_change_pct: item.avg_change_pct ?? item.change_pct ?? null,
    signals_count: item.signals_count ?? null,
    chart_context_label: item.chart_context_label ?? null,
    event_story_type: item.event_story_type ?? null,
  };
}

function normalizeAuditSignal(item) {
  const start = item.evidence_window?.start ?? item.chart?.highlight_start;
  const end = item.evidence_window?.end ?? item.chart?.highlight_end;
  const startMs = parseTime(start);
  const endMs = parseTime(end);
  if (startMs === null || endMs === null) return null;

  return {
    detection_scope: "audit_event",
    id: item.id,
    item_type: "audit_event",
    date_utc: start.slice(0, 10),
    start,
    end,
    start_ms: startMs,
    end_ms: endMs,
    display_window:
      item.evidence_window_display ??
      item.evidence_window?.display ??
      `${start} - ${end}`,
    direction: item.direction,
    avg_change_pct: item.avg_change_pct ?? null,
    signals_count: item.signals_count ?? null,
    chart_context_label: item.chart_context_label ?? null,
    event_story_type: item.event_story_type ?? null,
    suppress_reason: item.suppress_reason ?? null,
  };
}

function buildRefinementMap(refinements) {
  return new Map((refinements.items ?? []).map((item) => [item.event_id, item]));
}

function timestampForCatalyst(catalyst, refinementById) {
  // User preference: if the independent catalyst already has exact/hour
  // granularity, use that event time before using source-published refinement.
  if (
    catalyst.event_time_utc &&
    ["exact", "hour"].includes(catalyst.time_granularity)
  ) {
    return {
      timestamp_utc: catalyst.event_time_utc,
      timestamp_ms: parseTime(catalyst.event_time_utc),
      timestamp_source: "catalog_event_time",
      time_granularity: catalyst.time_granularity,
      refined_time_kind: null,
      refined_source_url: null,
      refined_source_title: null,
      refined_publisher: null,
    };
  }

  const refinement = refinementById.get(catalyst.event_id);
  if (refinement?.refined_time_utc) {
    return {
      timestamp_utc: refinement.refined_time_utc,
      timestamp_ms: parseTime(refinement.refined_time_utc),
      timestamp_source: "source_time_refinement",
      time_granularity: "source_exact",
      refined_time_kind: refinement.refined_time_kind ?? null,
      refined_source_url: refinement.source_url ?? null,
      refined_source_title: refinement.source_title ?? null,
      refined_publisher: refinement.publisher ?? null,
    };
  }

  return {
    timestamp_utc: null,
    timestamp_ms: null,
    timestamp_source: "missing_exact_time",
    time_granularity: catalyst.time_granularity ?? null,
    refined_time_kind: null,
    refined_source_url: null,
    refined_source_title: null,
    refined_publisher: null,
  };
}

function relationToSignal(catalystTimeMs, signal) {
  const inside =
    catalystTimeMs >= signal.start_ms && catalystTimeMs <= signal.end_ms;
  if (inside) {
    return {
      relation: "inside_evidence_window",
      lead_min: 0,
      lag_min: 0,
      distance_min: 0,
    };
  }

  if (catalystTimeMs < signal.start_ms) {
    const leadMin = minutesBetween(catalystTimeMs, signal.start_ms);
    return {
      relation: "source_before_signal",
      lead_min: leadMin,
      lag_min: null,
      distance_min: leadMin,
    };
  }

  const lagMin = minutesBetween(signal.end_ms, catalystTimeMs);
  return {
    relation: "source_after_signal",
    lead_min: null,
    lag_min: lagMin,
    distance_min: lagMin,
  };
}

function nearestDetectedEvent(catalystTimeMs, detectedEvents) {
  let best = null;
  for (const signal of detectedEvents) {
    const relation = relationToSignal(catalystTimeMs, signal);
    const row = {
      ...relation,
      detection_scope: signal.detection_scope,
      signal_event_id: signal.id,
      signal_start: signal.start,
      signal_end: signal.end,
      signal_window: signal.display_window,
      signal_direction: signal.direction,
      signal_avg_change_pct: signal.avg_change_pct,
      signal_chart_context_label: signal.chart_context_label,
      signal_event_story_type: signal.event_story_type,
      signal_suppress_reason: signal.suppress_reason ?? null,
    };
    if (!best || row.distance_min < best.distance_min) {
      best = row;
    }
  }
  return best;
}

function classifyTimingMatch(nearest) {
  if (!nearest) return "no_signal_to_compare";
  if (nearest.relation === "source_after_signal") return "backdrop_after_signal";
  if (nearest.relation === "inside_evidence_window") return "strong_timing_match";
  if (nearest.lead_min <= 360) return "strong_timing_match";
  if (nearest.lead_min <= 720) return "reasonable_timing_match";
  if (nearest.lead_min <= 1440) return "loose_timing_match";
  return "too_early_backdrop";
}

function isCatalystCandidateForWindow(nearest, maxLeadMin) {
  if (!nearest) return false;
  if (nearest.relation === "inside_evidence_window") return true;
  return (
    nearest.relation === "source_before_signal" && nearest.lead_min <= maxLeadMin
  );
}

function compactSource(source) {
  return {
    title: source.title ?? null,
    publisher: source.publisher ?? null,
    url: source.url ?? null,
    published_at: source.published_at ?? null,
    tag: source.tag ?? null,
    why_relevant: source.why_relevant ?? null,
  };
}

function rowForCatalyst(catalyst, timestamp, detectedEvents, scopeLabel) {
  const nearest = timestamp.timestamp_ms
    ? nearestDetectedEvent(timestamp.timestamp_ms, detectedEvents)
    : null;
  const timingDecision = classifyTimingMatch(nearest);
  const acceptedSources = (catalyst.sources ?? []).map(compactSource);

  return {
    catalyst_event_id: catalyst.event_id,
    headline: catalyst.headline,
    catalyst_type: catalyst.catalyst_type,
    source_support: catalyst.source_support,
    confidence: catalyst.confidence,
    expected_market_direction: catalyst.expected_market_direction,
    affected_assets: catalyst.affected_assets ?? [],
    event_date_utc: catalyst.event_date_utc,
    original_event_time_utc: catalyst.event_time_utc ?? null,
    original_time_granularity: catalyst.time_granularity ?? null,
    exact_timestamp_utc: timestamp.timestamp_utc,
    exact_timestamp_source: timestamp.timestamp_source,
    refined_time_kind: timestamp.refined_time_kind,
    refined_source_url: timestamp.refined_source_url,
    refined_source_title: timestamp.refined_source_title,
    refined_publisher: timestamp.refined_publisher,
    nearest_signal: nearest,
    timing_decision: timingDecision,
    timing_interpretation: interpretationForDecision(timingDecision),
    catalyst_candidate_within_6h: isCatalystCandidateForWindow(nearest, 360),
    catalyst_candidate_within_12h: isCatalystCandidateForWindow(nearest, 720),
    catalyst_candidate_within_24h: isCatalystCandidateForWindow(nearest, 1440),
    checked_against: scopeLabel,
    accepted_sources: acceptedSources,
  };
}

function interpretationForDecision(decision) {
  switch (decision) {
    case "strong_timing_match":
      return "timestamp is inside the evidence window or leads it by 6h or less";
    case "reasonable_timing_match":
      return "timestamp leads the evidence window by 6-12h; plausible but needs content review";
    case "loose_timing_match":
      return "timestamp leads the evidence window by 12-24h; weak timing, manual review only";
    case "backdrop_after_signal":
      return "timestamp is after the evidence window, so treat as backdrop/explanation for that signal";
    case "too_early_backdrop":
      return "timestamp is more than 24h before the nearest evidence window";
    default:
      return "no comparable signal window";
  }
}

function emptySupportSummary() {
  return Object.fromEntries(
    SUPPORT_LEVELS.map((support) => [
      support,
      {
        total_exact: 0,
        real_catalyst_candidate: 0,
        after_signal_backdrop: 0,
        too_early_or_not_tied: 0,
      },
    ]),
  );
}

function summarizeRows(rows) {
  const bySupport = Object.fromEntries(
    SUPPORT_LEVELS.map((support) => [
      support,
      {
        total_exact: 0,
        decision_counts: {},
      },
    ]),
  );

  const leadWindows = Object.fromEntries(
    LEAD_WINDOWS_MIN.map((windowMin) => [`${windowMin}m`, emptySupportSummary()]),
  );

  for (const row of rows) {
    const supportSummary = bySupport[row.source_support];
    if (!supportSummary) continue;
    supportSummary.total_exact += 1;
    supportSummary.decision_counts[row.timing_decision] =
      (supportSummary.decision_counts[row.timing_decision] ?? 0) + 1;

    for (const windowMin of LEAD_WINDOWS_MIN) {
      const windowSummary = leadWindows[`${windowMin}m`][row.source_support];
      windowSummary.total_exact += 1;
      if (row.nearest_signal?.relation === "source_after_signal") {
        windowSummary.after_signal_backdrop += 1;
      } else if (isCatalystCandidateForWindow(row.nearest_signal, windowMin)) {
        windowSummary.real_catalyst_candidate += 1;
      } else {
        windowSummary.too_early_or_not_tied += 1;
      }
    }
  }

  const recommendedCatalystCandidateCount = rows.filter(
    (row) =>
      row.timing_decision === "strong_timing_match" ||
      row.timing_decision === "reasonable_timing_match",
  ).length;

  return {
    total_exact_high_medium: rows.length,
    by_support: bySupport,
    lead_windows: leadWindows,
    recommended_catalyst_candidate_rule:
      "inside evidence window or source timestamp leads Signal Event by <=12h",
    recommended_catalyst_candidate_count: recommendedCatalystCandidateCount,
  };
}

function sortRows(rows) {
  const decisionRank = {
    strong_timing_match: 0,
    reasonable_timing_match: 1,
    loose_timing_match: 2,
    backdrop_after_signal: 3,
    too_early_backdrop: 4,
    no_signal_to_compare: 5,
  };
  return [...rows].sort((a, b) => {
    const rankDelta =
      (decisionRank[a.timing_decision] ?? 99) -
      (decisionRank[b.timing_decision] ?? 99);
    if (rankDelta) return rankDelta;
    const aTime = Date.parse(a.exact_timestamp_utc ?? "");
    const bTime = Date.parse(b.exact_timestamp_utc ?? "");
    return (aTime || 0) - (bTime || 0);
  });
}

function mdEscape(value) {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ")
    .trim();
}

function formatWindow(nearest) {
  if (!nearest) return "-";
  const signalType =
    nearest.detection_scope === "audit_event" ? "audit" : "public";
  return `${signalType} ${nearest.signal_event_id} ${nearest.signal_window ?? ""}`;
}

function formatDelta(nearest) {
  if (!nearest) return "-";
  if (nearest.relation === "inside_evidence_window") return "inside";
  if (nearest.relation === "source_before_signal") {
    return `${nearest.lead_min} min before`;
  }
  return `${nearest.lag_min} min after`;
}

function rowsTable(rows, limit = 200) {
  const selected = sortRows(rows).slice(0, limit);
  return [
    "| Support | Decision | Catalyst | Exact time | Nearest window | Delta | Source |",
    "|---|---|---|---|---|---:|---|",
    ...selected.map((row) => {
      const sourceTitle =
        row.refined_source_title ?? row.accepted_sources[0]?.title ?? "";
      const sourceUrl =
        row.refined_source_url ?? row.accepted_sources[0]?.url ?? null;
      const sourceDisplay = sourceUrl
        ? `[${mdEscape(sourceTitle || sourceUrl)}](${sourceUrl})`
        : mdEscape(sourceTitle);
      return [
        row.source_support,
        row.timing_decision,
        mdEscape(row.headline),
        row.exact_timestamp_utc ?? "-",
        mdEscape(formatWindow(row.nearest_signal)),
        formatDelta(row.nearest_signal),
        sourceDisplay,
      ].join(" | ");
    }),
    rows.length > limit ? `\n_Omitted ${rows.length - limit} rows._` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function decisionBulletRows(summary) {
  return SUPPORT_LEVELS.flatMap((support) => {
    const supportSummary = summary.by_support[support];
    const decisions = supportSummary.decision_counts;
    return [
      `- ${support}: ${supportSummary.total_exact} exact-time sources`,
      `  - strong <=6h/inside: ${decisions.strong_timing_match ?? 0}`,
      `  - reasonable 6-12h lead: ${decisions.reasonable_timing_match ?? 0}`,
      `  - loose 12-24h lead: ${decisions.loose_timing_match ?? 0}`,
      `  - after-signal backdrop: ${decisions.backdrop_after_signal ?? 0}`,
      `  - too early/not tied: ${decisions.too_early_backdrop ?? 0}`,
    ];
  }).join("\n");
}

function leadWindowBullets(summary) {
  return LEAD_WINDOWS_MIN.map((windowMin) => {
    const key = `${windowMin}m`;
    const label = windowMin === 360 ? "6h" : windowMin === 720 ? "12h" : "24h";
    const high = summary.lead_windows[key].high;
    const medium = summary.lead_windows[key].medium;
    return [
      `- ${label} lead allowance:`,
      `  - high: ${high.real_catalyst_candidate} timing-supported, ${high.after_signal_backdrop} after-signal backdrop, ${high.too_early_or_not_tied} too early/not tied`,
      `  - medium: ${medium.real_catalyst_candidate} timing-supported, ${medium.after_signal_backdrop} after-signal backdrop, ${medium.too_early_or_not_tied} too early/not tied`,
    ].join("\n");
  }).join("\n");
}

function buildMarkdown(audit) {
  const publicRows = audit.scopes.public_signals.rows;
  const allRows = audit.scopes.all_detected_events.rows;
  const publicSummary = audit.scopes.public_signals.summary;
  const allSummary = audit.scopes.all_detected_events.summary;

  const publicCandidates = publicRows.filter((row) =>
    ["strong_timing_match", "reasonable_timing_match"].includes(
      row.timing_decision,
    ),
  );
  const afterRows = publicRows.filter(
    (row) => row.timing_decision === "backdrop_after_signal",
  );
  const looseRows = publicRows.filter(
    (row) => row.timing_decision === "loose_timing_match",
  );

  return [
    "# Catalyst / Signal Timing Audit",
    "",
    `Generated: ${audit.generated_at}`,
    "",
    "No Claude was used for this audit. It checks accepted high/medium source-support catalyst candidates with exact timestamps against current vNext-C evidence windows.",
    "",
    "## Method",
    "",
    "- Prefer the independent catalyst `event_time_utc` when `time_granularity` is `exact` or `hour`.",
    "- Otherwise use the source timestamp refinement from `catalyst_time_refinements.json`.",
    "- A source can be catalyst-like only when the timestamp is inside the Signal Event evidence window or before it.",
    "- A source timestamp after the evidence window is classified as backdrop/explanation for that Signal Event.",
    "- Recommended catalyst candidate rule for this audit: inside the evidence window or leading it by <=12h.",
    "",
    "## Public Signal Events Scope",
    "",
    `Public Signal Events compared: ${audit.scopes.public_signals.detected_event_count}`,
    "",
    decisionBulletRows(publicSummary),
    "",
    "Lead-window rollup:",
    "",
    leadWindowBullets(publicSummary),
    "",
    `Recommended timing-supported catalyst candidates (<=12h): ${publicSummary.recommended_catalyst_candidate_count}`,
    "",
    "## All Detected Events Scope",
    "",
    "This secondary scope includes public Signal Events plus audit-only detected events.",
    "",
    `Detected events compared: ${audit.scopes.all_detected_events.detected_event_count}`,
    "",
    decisionBulletRows(allSummary),
    "",
    "Lead-window rollup:",
    "",
    leadWindowBullets(allSummary),
    "",
    `Recommended timing-supported catalyst candidates (<=12h): ${allSummary.recommended_catalyst_candidate_count}`,
    "",
    "## Public-Scope Timing-Supported Candidates",
    "",
    rowsTable(publicCandidates),
    "",
    "## Public-Scope Loose 12-24h Candidates",
    "",
    rowsTable(looseRows),
    "",
    "## Public-Scope After-Signal Backdrops",
    "",
    rowsTable(afterRows),
    "",
    "## Interpretation",
    "",
    "- High/medium source support is a source-quality score, not proof that the source caused a specific Signal Event.",
    "- Exact timestamp alignment matters: source before/inside signal = catalyst-like; source after signal = backdrop/explanation.",
    "- The 12-24h bucket can still be useful for day-level context, but should not be treated as a strong event catalyst without manual review.",
  ].join("\n");
}

async function main() {
  const [feedContract, auditEvents, catalystsData, refinements] = await Promise.all([
    readJson(FEED_CONTRACT_PATH),
    readJson(AUDIT_EVENTS_PATH),
    readJson(CATALYSTS_PATH),
    readJson(REFINEMENTS_PATH),
  ]);

  const publicSignals = flattenFeedItems(feedContract)
    .map(normalizePublicSignal)
    .filter(Boolean);
  const auditSignals = (auditEvents.items ?? []).map(normalizeAuditSignal).filter(Boolean);
  const allDetected = [...publicSignals, ...auditSignals];
  const refinementById = buildRefinementMap(refinements);
  const exactHighMediumCatalysts = (catalystsData.items ?? [])
    .filter((catalyst) => SUPPORT_LEVELS.includes(catalyst.source_support))
    .map((catalyst) => ({
      catalyst,
      timestamp: timestampForCatalyst(catalyst, refinementById),
    }))
    .filter(({ timestamp }) => timestamp.timestamp_ms !== null);

  const publicRows = exactHighMediumCatalysts.map(({ catalyst, timestamp }) =>
    rowForCatalyst(catalyst, timestamp, publicSignals, "public_signal_events"),
  );
  const allRows = exactHighMediumCatalysts.map(({ catalyst, timestamp }) =>
    rowForCatalyst(
      catalyst,
      timestamp,
      allDetected,
      "public_signal_events_plus_audit_events",
    ),
  );

  const audit = {
    generated_at: new Date().toISOString(),
    inputs: {
      feed_contract: FEED_CONTRACT_PATH,
      audit_events: AUDIT_EVENTS_PATH,
      independent_catalysts: CATALYSTS_PATH,
      catalyst_time_refinements: REFINEMENTS_PATH,
    },
    no_claude_used: true,
    lead_windows_min: LEAD_WINDOWS_MIN,
    exact_high_medium_catalyst_count: exactHighMediumCatalysts.length,
    support_levels_checked: SUPPORT_LEVELS,
    scopes: {
      public_signals: {
        detected_event_count: publicSignals.length,
        summary: summarizeRows(publicRows),
        rows: sortRows(publicRows),
      },
      all_detected_events: {
        detected_event_count: allDetected.length,
        public_signal_count: publicSignals.length,
        audit_event_count: auditSignals.length,
        summary: summarizeRows(allRows),
        rows: sortRows(allRows),
      },
    },
  };

  await mkdir(OUTPUTS_DIR, { recursive: true });
  await writeJson(AUDIT_JSON_PATH, audit);
  await writeText(AUDIT_MD_PATH, buildMarkdown(audit));

  const publicSummary = audit.scopes.public_signals.summary;
  const high = publicSummary.by_support.high.decision_counts;
  const medium = publicSummary.by_support.medium.decision_counts;
  console.log("Catalyst timing audit written:");
  console.log(`- ${AUDIT_JSON_PATH}`);
  console.log(`- ${AUDIT_MD_PATH}`);
  console.log(
    `Public scope exact high/medium sources: ${publicSummary.total_exact_high_medium}`,
  );
  console.log(
    `High <=12h catalyst-like: ${(high.strong_timing_match ?? 0) + (high.reasonable_timing_match ?? 0)}`,
  );
  console.log(
    `Medium <=12h catalyst-like: ${(medium.strong_timing_match ?? 0) + (medium.reasonable_timing_match ?? 0)}`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
