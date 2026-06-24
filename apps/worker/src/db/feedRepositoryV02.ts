import { VISIBLE_RANGE_DAYS, isoDaysAgo } from "../config.ts";
import { MAX_PUBLIC_SOURCES_PER_BRIEF_V02 } from "../services/claudeV02/sourcePolicy.ts";

const UTC_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

type V02ClaudeTargetType = "signal_event_v02" | "daily_overview_v02";

interface DailyOverviewV02Row {
  id: string;
  date_utc: string;
  day_start: string;
  day_end: string;
  market_tone: string | null;
  daily_change_pct: number | null;
  daily_change_label: string;
  market_range_pct: number | null;
  notable_symbols_json: string;
  top_symbol_moves_json: string;
  signal_event_ids_json: string;
  market_story_ids_json: string;
  audit_event_count: number;
  daily_chart_context_summary_json: string;
  claude_status: string;
  claude_brief_id: string | null;
  created_at: string;
  updated_at: string;
}

interface SignalEventV02FeedRow {
  id: string;
  date_utc: string;
  event_start: string;
  event_end: string;
  duration_min: number;
  peak_time: string | null;
  direction: string;
  signals_count: number;
  n_tracked: number;
  avg_change_pct: number | null;
  avg_change_method: string | null;
  event_strength_score: number | null;
  impact_label: string | null;
  chart_context_score: number | null;
  chart_context_label: string | null;
  event_story_type: string | null;
  trend_context: string | null;
  momentum_context: string | null;
  volatility_context: string | null;
  event_range_context: string | null;
  chart_context_reasons_json: string;
  chart_context_warnings_json: string;
  publish_reason: string | null;
  source_route_hint: string | null;
  direction_changed: number;
  direction_history_json: string;
  created_at: string;
  updated_at: string;
}

interface SignalEventSymbolV02FeedRow {
  id: string;
  signal_event_id: string;
  symbol: string;
  window_change_pct: number | null;
  peak_15m_change_pct: number | null;
  volume_ratio: number | null;
  range_position: string | null;
  prev_24h_high: number | null;
  prev_24h_low: number | null;
  range_break_direction: string | null;
  range_break_pct: number | null;
  range_break_strength: number | null;
  distance_to_range_high_pct: number | null;
  distance_to_range_low_pct: number | null;
  is_lead_mover: number;
  is_peak_15m_highlight: number;
  participated: number;
  evidence_json: string;
}

interface MarketStoryV02FeedRow {
  id: string;
  date_utc: string;
  story_start: string;
  story_end: string;
  duration_min: number;
  story_label: string;
  story_family: string | null;
  direction: string | null;
  swing_change_pct: number | null;
  chart_context_score: number | null;
  range_context_json: string;
  trend_context_json: string;
  momentum_context_json: string;
  volatility_context_json: string;
  decision_reasons_json: string;
  included_signal_event_ids_json: string;
  included_audit_event_ids_json: string;
  publish_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface ClaudeBriefV02FeedRow {
  id: string;
  target_type: V02ClaudeTargetType;
  target_id: string;
  prompt_mode: string;
  status: string;
  public_label: string | null;
  classification: string | null;
  confidence: string | null;
  headline: string | null;
  collapsed_summary: string | null;
  context_details: string | null;
  source_support: string | null;
  source_timing_alignment: string | null;
  validation_flags_json: string;
  detector_feedback_json: string;
  prompt_version: string | null;
  model: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface SourceReferenceV02FeedRow {
  id: string;
  target_type: V02ClaudeTargetType;
  target_id: string;
  brief_id: string | null;
  source_role: string;
  source_strength: string | null;
  publisher: string | null;
  title: string | null;
  url: string;
  published_at: string | null;
  used_for: string | null;
  metadata_json: string;
  created_at: string;
}

interface BaseFeedItemV02 {
  item_type: "daily_overview" | "market_story" | "signal_event";
  id: string;
  date_utc: string;
  _sort_time?: string;
}

export interface PublicSourceV02 {
  publisher: string | null;
  title: string | null;
  url: string;
  published_at: string | null;
  catalyst_time_utc: string | null;
  tag: string;
  source_strength: string | null;
  used_for: string | null;
}

export interface ClaudeBriefPublicV02 {
  id: string;
  status: string;
  public_label: string | null;
  classification: string | null;
  confidence: string | null;
  headline: string | null;
  collapsed_summary: string | null;
  context_details: string | null;
  source_support: string | null;
  source_timing_alignment: string | null;
  prompt_version: string | null;
  updated_at: string;
}

export interface DailyOverviewFeedItemV02 extends BaseFeedItemV02 {
  item_type: "daily_overview";
  display_time: "Full UTC day";
  daily_label: string;
  daily_change_label: "24h Change";
  daily_change_pct: number | null;
  market_tone: string | null;
  market_range_pct: number | null;
  notable_symbols: unknown[];
  top_symbol_moves: unknown[];
  public_context_status: string;
  sources: PublicSourceV02[];
  chart: {
    chart_highlight_type: "day_window";
    highlight_start: string;
    highlight_end: string;
    included_signal_event_ids: string[];
    included_market_story_ids: string[];
    hide_other_days_on_select: true;
  };
  expanded: {
    daily_market_summary_fields: {
      market_tone: string | null;
      market_range_pct: number | null;
      notable_symbols: unknown[];
      top_symbol_moves: unknown[];
      audit_event_count: number;
    };
    daily_chart_context_summary: Record<string, unknown>;
  };
  brief?: ClaudeBriefPublicV02;
}

export interface MarketStoryFeedItemV02 extends BaseFeedItemV02 {
  item_type: "market_story";
  display_time: string;
  story_window_label: "Story window";
  avg_change_label: "Avg Change";
  avg_change_pct: number | null;
  swing_score_label: "Volatility Score";
  swing_score: number | null;
  story_label: string;
  story_family: string | null;
  direction: string | null;
  chart_context_score: number | null;
  per_symbol_evidence: Array<{
    symbol: string;
    avg_change_label: "Avg Change";
    avg_change_pct: number | null;
    range_pct: number | null;
    swing_score_label: "Volatility Score";
    swing_score: number | null;
    volume_ratio: number | null;
    movement_status_label: "Movement Status";
    movement_status: string | null;
    bar_count: number | null;
  }>;
  range_context: Record<string, unknown>;
  trend_context: Record<string, unknown>;
  momentum_context: Record<string, unknown>;
  volatility_context: Record<string, unknown>;
  decision_reasons: unknown[];
  publish_reason: string | null;
  chart: {
    chart_highlight_type: "story_window";
    highlight_start: string;
    highlight_end: string;
    included_signal_event_ids: string[];
    included_audit_event_ids: string[];
  };
  deterministic_context: {
    story_label: string;
    story_family: string | null;
    chart_context_score: number | null;
    decision_reasons: unknown[];
  };
}

export interface SignalEventFeedItemV02 extends BaseFeedItemV02 {
  item_type: "signal_event";
  display_time: string;
  display_window: string;
  direction: string;
  signals_count: number;
  n_tracked: number;
  avg_change_label: "Avg Change";
  avg_change_pct: number | null;
  impact_label: string | null;
  event_strength_score: number | null;
  chart_context_score: number | null;
  chart_context_label: string | null;
  event_story_type: string | null;
  direction_changed: boolean;
  direction_history: unknown[];
  trend_context: string | null;
  momentum_context: string | null;
  volatility_context: string | null;
  event_range_context: string | null;
  public_context_status: string;
  sources: PublicSourceV02[];
  evidence_window: {
    start: string;
    end: string;
    duration_min: number;
    peak_time: string | null;
  };
  per_symbol_evidence: Array<{
    symbol: string;
    window_change_label: "Window Change";
    window_change_pct: number | null;
    peak_15m_label: "Peak 15m";
    peak_15m_change_pct: number | null;
    range_pct: number | null;
    volume_ratio: number | null;
    range_position_label: "Range Position";
    range_position: string | null;
    range_position_display: string | null;
    prev_24h_high: number | null;
    prev_24h_low: number | null;
    range_break_direction: string | null;
    range_break_pct: number | null;
    range_break_strength: number | null;
    distance_to_range_high_pct: number | null;
    distance_to_range_low_pct: number | null;
    is_lead_mover: boolean;
    is_peak_15m_highlight: boolean;
    participated: boolean;
    evidence: Record<string, unknown>;
  }>;
  lead_mover_symbol: string | null;
  strongest_peak_symbol: string | null;
  highlight_cells: Array<{
    symbol: string;
    column: "symbol" | "peak_15m";
    reason: "lead_mover" | "strongest_peak_15m";
  }>;
  chart: {
    chart_highlight_type: "event_window";
    highlight_start: string;
    highlight_end: string;
    peak_marker_time: string | null;
    feed_card_id: string;
  };
  expanded: {
    chart_context_reasons: unknown[];
    chart_context_warnings: unknown[];
    avg_change_method: string | null;
    source_route_hint: string | null;
    publish_reason: string | null;
  };
  brief?: ClaudeBriefPublicV02;
}

export type FeedItemV02 =
  | DailyOverviewFeedItemV02
  | MarketStoryFeedItemV02
  | SignalEventFeedItemV02;

export interface DayGroupV02 {
  day_post_id: string;
  date_utc: string;
  display_date: string;
  is_current_utc_day: boolean;
  item_count: number;
  hidden_item_count_when_collapsed: number;
  default_collapsed_item_id: string | null;
  has_extra_items: boolean;
  expanded_control_label: string | null;
  collapsed_control_label: string | null;
  items: FeedItemV02[];
}

export interface FeedResponseBodyV02 {
  ok: true;
  version: "v02";
  updated_at: string;
  range_days: number;
  grouping: "utc_day";
  days_expanded_default: true;
  global_control_label_when_expanded: "Collapse days";
  global_control_label_when_collapsed: "Expand days";
  day_groups: DayGroupV02[];
}

function parseJsonArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseStringArray(value: string): string[] {
  return parseJsonArray(value).filter(
    (item): item is string => typeof item === "string",
  );
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function numberFromRecord(
  object: Record<string, unknown>,
  key: string,
): number | null {
  const value = object[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function rangePctFromHighLow(
  high: number | null,
  low: number | null,
): number | null {
  if (high === null || low === null || low <= 0) {
    return null;
  }

  return Math.round(((high - low) / low) * 100 * 10000) / 10000;
}

function stringFromRecord(
  object: Record<string, unknown>,
  key: string,
): string | null {
  const value = object[key];
  return typeof value === "string" ? value : null;
}

function arrayFromRecord(
  object: Record<string, unknown>,
  key: string,
): unknown[] {
  const value = object[key];
  return Array.isArray(value) ? value : [];
}

function normalizeMarketStoryPerSymbolEvidence(
  rangeContext: Record<string, unknown>,
): MarketStoryFeedItemV02["per_symbol_evidence"] {
  return arrayFromRecord(rangeContext, "per_symbol_evidence").map((item) => {
    const row =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : {};

    return {
      symbol: stringFromRecord(row, "symbol") ?? "Unknown",
      avg_change_label: "Avg Change",
      avg_change_pct: numberFromRecord(row, "avg_change_pct"),
      range_pct: numberFromRecord(row, "range_pct"),
      swing_score_label: "Volatility Score",
      swing_score: numberFromRecord(row, "swing_score"),
      volume_ratio: numberFromRecord(row, "volume_ratio"),
      movement_status_label: "Movement Status",
      movement_status: stringFromRecord(row, "movement_status"),
      bar_count: numberFromRecord(row, "bar_count"),
    };
  });
}

function displayDateUtc(dateUtc: string): string {
  const date = new Date(`${dateUtc}T00:00:00.000Z`);

  if (!Number.isFinite(date.getTime())) {
    return `${dateUtc} UTC`;
  }

  return `${UTC_MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()} UTC`;
}

function displayTimeRange(start: string, end: string): string {
  return `${start.slice(11, 16)}-${end.slice(11, 16)} UTC`;
}

function rangePositionDisplay(value: string | null): string | null {
  if (value === "inside_range") {
    return "Inside range";
  }

  if (value === "near_high") {
    return "Near high";
  }

  if (value === "near_low") {
    return "Near low";
  }

  if (value === "broke_high") {
    return "Broke high";
  }

  if (value === "broke_low") {
    return "Broke low";
  }

  return null;
}

function dailyLabel(): string {
  return "Daily Overview";
}

const PUBLIC_OPERATIONAL_LIMIT_PATTERNS_V02 = [
  /\bexternal source validation\b/i,
  /\bweb search tool limit\b/i,
  /\bsearch tool limit\b/i,
  /\bsearch limit error\b/i,
  /\btool limit error\b/i,
  /\bmax[_\s-]?uses\b/i,
  /\bsearches?\s+(?:were\s+)?exhausted\b/i,
  /\bcould not be completed\b.*\b(?:web\s+)?search\b/i,
] as const;

const SOURCELESS_SIGNAL_COPY_PATTERNS_V02 = [
  /\bno (?:accepted )?(?:time[- ]aligned )?public source\b/i,
  /\btime[- ]aligned (?:public )?source\b/i,
  /\baccepted (?:public )?source\b/i,
  /\breturned (?:public )?source\b/i,
  /\brejected(?: or ignored)? (?:public )?source\b/i,
  /\bsource(?:s)?\b/i,
  /\barticle(?:s)?\b/i,
  /\bpublisher(?:s)?\b/i,
  /\breuters\b/i,
  /\bcoindesk\b/i,
  /\bcointelegraph\b/i,
  /\bbloomberg\b/i,
  /\bcnbc\b/i,
  /\bthe block\b/i,
  /\bdecrypt\b/i,
] as const;

const PUBLIC_UNRESOLVED_CLAUDE_STATUSES_V02 = new Set([
  "queued_for_analysis",
  "processing",
  "failed_retryable",
  "failed_terminal",
]);

function publicClaudeStatus(status: string | null | undefined): string {
  if (!status || PUBLIC_UNRESOLVED_CLAUDE_STATUSES_V02.has(status)) {
    return "queued_for_analysis";
  }

  return status;
}

function stripPublicCitationMarkup(value: string): string {
  return value
    .replace(/<\/?cite\b[^>]*>/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function publicBriefText(value: string | null): string | null {
  if (!value) {
    return value;
  }

  const cleaned = stripPublicCitationMarkup(value);

  return PUBLIC_OPERATIONAL_LIMIT_PATTERNS_V02.some((pattern) =>
    pattern.test(cleaned),
  )
    ? null
    : cleaned || null;
}

function publicBrief(row: ClaudeBriefV02FeedRow): ClaudeBriefPublicV02 {
  return {
    id: row.id,
    status: publicClaudeStatus(row.status),
    public_label: row.public_label,
    classification: row.classification,
    confidence: row.confidence,
    headline: publicBriefText(row.headline),
    collapsed_summary: publicBriefText(row.collapsed_summary),
    context_details: publicBriefText(row.context_details),
    source_support: row.source_support,
    source_timing_alignment: row.source_timing_alignment,
    prompt_version: row.prompt_version,
    updated_at: row.updated_at,
  };
}

function publicSources(rows: SourceReferenceV02FeedRow[]): PublicSourceV02[] {
  return rows.slice(0, MAX_PUBLIC_SOURCES_PER_BRIEF_V02).map((row) => {
    const metadata = parseJsonObject(row.metadata_json);
    const catalystTimeUtc =
      typeof metadata.catalyst_time_utc === "string"
        ? metadata.catalyst_time_utc
        : null;
    return {
      publisher: row.publisher,
      title: row.title,
      url: row.url,
      published_at: row.published_at,
      catalyst_time_utc: catalystTimeUtc,
      tag: row.source_role,
      source_strength: row.source_strength,
      used_for: row.used_for,
    };
  });
}

function noSourceSignalCopyNeedsReplacement(
  brief: ClaudeBriefPublicV02,
): boolean {
  const text = [
    brief.headline ?? "",
    brief.collapsed_summary ?? "",
    brief.context_details ?? "",
  ].join("\n");

  return SOURCELESS_SIGNAL_COPY_PATTERNS_V02.some((pattern) =>
    pattern.test(text),
  );
}

function signalBriefWithoutAcceptedSources(
  brief: ClaudeBriefPublicV02,
): ClaudeBriefPublicV02 {
  // This is only reached when zero public source rows survive the window filter,
  // so any source-backed copy in the stored brief is now unsupported and must be
  // replaced. A genuine "Claude Limited" error state keeps its own label/copy
  // (it is not source-backed news), but it still drops to no source support.
  if (brief.classification === "Claude Limited") {
    return {
      ...brief,
      source_support: "none",
      source_timing_alignment: "none",
    };
  }

  if (PUBLIC_UNRESOLVED_CLAUDE_STATUSES_V02.has(brief.status)) {
    return {
      ...brief,
      status: "queued_for_analysis",
      public_label: null,
      classification: null,
      headline: null,
      collapsed_summary: null,
      context_details: null,
      source_support: "none",
      source_timing_alignment: "none",
    };
  }

  if (
    brief.classification === "No Clear Cause" &&
    !noSourceSignalCopyNeedsReplacement(brief)
  ) {
    return {
      ...brief,
      source_support: "none",
      source_timing_alignment: "none",
    };
  }

  if (brief.classification === "No Clear Cause") {
    return {
      ...brief,
      headline: null,
      collapsed_summary: null,
      context_details: null,
      source_support: "none",
      source_timing_alignment: "none",
    };
  }

  return {
    ...brief,
    status: "queued_for_analysis",
    public_label: null,
    classification: null,
    headline: null,
    collapsed_summary: null,
    context_details: null,
    source_support: "none",
    source_timing_alignment: "none",
  };
}

const SIGNAL_PUBLIC_SOURCE_LOOKBACK_MS = 6 * 60 * 60 * 1000;
const SIGNAL_BACKDROP_RECAP_LOOKAHEAD_MS = 30 * 60 * 60 * 1000;

function parsedTime(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isWithinWindow(value: number, start: number, end: number): boolean {
  return value >= Math.min(start, end) && value <= Math.max(start, end);
}

function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function isNearbySignalBackdropRecap(input: {
  publishedAt: number | null;
  catalystTime: number | null;
  eventStart: number;
  eventEnd: number;
}): boolean {
  if (input.publishedAt === null) {
    return false;
  }

  const eventDay = utcDay(input.eventStart);
  const catalystIsSameEventDay =
    input.catalystTime !== null && utcDay(input.catalystTime) === eventDay;

  return (
    input.publishedAt >= input.eventStart &&
    input.publishedAt <= input.eventEnd + SIGNAL_BACKDROP_RECAP_LOOKAHEAD_MS &&
    (input.catalystTime === null || catalystIsSameEventDay)
  );
}

function signalPublicSourceRows(
  rows: SourceReferenceV02FeedRow[],
  eventStartIso: string,
  eventEndIso: string,
): SourceReferenceV02FeedRow[] {
  const eventStart = parsedTime(eventStartIso);
  const eventEnd = parsedTime(eventEndIso);

  if (eventStart === null || eventEnd === null) {
    return rows;
  }

  const sourceStart = eventStart - SIGNAL_PUBLIC_SOURCE_LOOKBACK_MS;
  const sourceEnd = eventEnd;
  const eventDay = utcDay(eventStart);

  return rows.filter((row) => {
    const metadata = parseJsonObject(row.metadata_json);
    const catalystTime = parsedTime(
      typeof metadata.catalyst_time_utc === "string"
        ? metadata.catalyst_time_utc
        : null,
    );

    if (
      catalystTime !== null &&
      isWithinWindow(catalystTime, sourceStart, sourceEnd)
    ) {
      return true;
    }

    const publishedAt = parsedTime(row.published_at);

    if (
      publishedAt !== null &&
      isWithinWindow(publishedAt, sourceStart, sourceEnd)
    ) {
      return true;
    }

    // Mirror of sourcePolicy: a same-UTC-day Backdrop source is valid context
    // even outside the strict 6h window (keeps Market Backdrop classifications).
    const sameDayTime = catalystTime ?? publishedAt;
    if (
      row.source_role === "Backdrop source" &&
      sameDayTime !== null &&
      utcDay(sameDayTime) === eventDay
    ) {
      return true;
    }

    if (
      row.source_role === "Backdrop source" &&
      isNearbySignalBackdropRecap({
        publishedAt,
        catalystTime,
        eventStart,
        eventEnd,
      })
    ) {
      return true;
    }

    return row.source_role === "Price check source" && publishedAt === null;
  });
}

const DAILY_PUBLIC_SOURCE_LOOKBACK_MS = 6 * 60 * 60 * 1000;

function dailyPublicSourceRows(
  rows: SourceReferenceV02FeedRow[],
  dayStartIso: string,
  dayEndIso: string,
): SourceReferenceV02FeedRow[] {
  const dayStart = parsedTime(dayStartIso);
  const dayEnd = parsedTime(dayEndIso);

  if (dayStart === null || dayEnd === null) {
    return rows;
  }

  // Within the UTC day, plus a short prior-overnight look-back so a late
  // prior-evening catalyst that set the day's tone stays, while multi-day-old
  // context is dropped.
  const sourceStart = dayStart - DAILY_PUBLIC_SOURCE_LOOKBACK_MS;
  const sourceEnd = dayEnd;

  return rows.filter((row) => {
    const metadata = parseJsonObject(row.metadata_json);
    const catalystTime = parsedTime(
      typeof metadata.catalyst_time_utc === "string"
        ? metadata.catalyst_time_utc
        : null,
    );

    if (
      catalystTime !== null &&
      isWithinWindow(catalystTime, sourceStart, sourceEnd)
    ) {
      return true;
    }

    const publishedAt = parsedTime(row.published_at);

    if (
      publishedAt !== null &&
      isWithinWindow(publishedAt, sourceStart, sourceEnd)
    ) {
      return true;
    }

    return row.source_role === "Price check source" && publishedAt === null;
  });
}

async function getClaudeBriefForTarget(
  db: D1Database,
  targetType: V02ClaudeTargetType,
  targetId: string,
): Promise<ClaudeBriefV02FeedRow | null> {
  return await db
    .prepare(
      `SELECT
        id,
        target_type,
        target_id,
        prompt_mode,
        status,
        public_label,
        classification,
        confidence,
        headline,
        collapsed_summary,
        context_details,
        source_support,
        source_timing_alignment,
        validation_flags_json,
        detector_feedback_json,
        prompt_version,
        model,
        error_code,
        error_message,
        created_at,
        updated_at
       FROM claude_briefs_v02
       WHERE target_type = ?
         AND target_id = ?
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
    )
    .bind(targetType, targetId)
    .first<ClaudeBriefV02FeedRow>();
}

async function getAcceptedSourcesForTarget(
  db: D1Database,
  targetType: V02ClaudeTargetType,
  targetId: string,
): Promise<SourceReferenceV02FeedRow[]> {
  const result = await db
    .prepare(
      `SELECT
        id,
        target_type,
        target_id,
        brief_id,
        source_role,
        source_strength,
        publisher,
        title,
        url,
        published_at,
        used_for,
        metadata_json,
        created_at
       FROM source_references_v02
       WHERE target_type = ?
         AND target_id = ?
         AND accepted = 1
       ORDER BY created_at ASC, id ASC`,
    )
    .bind(targetType, targetId)
    .all<SourceReferenceV02FeedRow>();

  return result.results;
}

async function getSignalSymbols(
  db: D1Database,
  signalEventId: string,
): Promise<SignalEventSymbolV02FeedRow[]> {
  const result = await db
    .prepare(
      `SELECT
        id,
        signal_event_id,
        symbol,
        window_change_pct,
        peak_15m_change_pct,
        volume_ratio,
        range_position,
        prev_24h_high,
        prev_24h_low,
        range_break_direction,
        range_break_pct,
        range_break_strength,
        distance_to_range_high_pct,
        distance_to_range_low_pct,
        is_lead_mover,
        is_peak_15m_highlight,
        participated,
        evidence_json
       FROM signal_event_symbols_v02
       WHERE signal_event_id = ?
       ORDER BY symbol ASC`,
    )
    .bind(signalEventId)
    .all<SignalEventSymbolV02FeedRow>();

  return result.results;
}

async function getDailyItems(
  db: D1Database,
  cutoff: string,
): Promise<DailyOverviewFeedItemV02[]> {
  const result = await db
    .prepare(
      `SELECT
        id,
        date_utc,
        day_start,
        day_end,
        market_tone,
        daily_change_pct,
        daily_change_label,
        market_range_pct,
        notable_symbols_json,
        top_symbol_moves_json,
        signal_event_ids_json,
        market_story_ids_json,
        audit_event_count,
        daily_chart_context_summary_json,
        claude_status,
        claude_brief_id,
        created_at,
        updated_at
       FROM daily_overviews_v02
       WHERE day_start >= ?
       ORDER BY date_utc DESC`,
    )
    .bind(cutoff)
    .all<DailyOverviewV02Row>();

  const items: DailyOverviewFeedItemV02[] = [];

  for (const row of result.results) {
    const brief = await getClaudeBriefForTarget(
      db,
      "daily_overview_v02",
      row.id,
    );
    const sourceRows = await getAcceptedSourcesForTarget(
      db,
      "daily_overview_v02",
      row.id,
    );
    const notableSymbols = parseJsonArray(row.notable_symbols_json);
    const topSymbolMoves = parseJsonArray(row.top_symbol_moves_json);
    const signalIds = parseStringArray(row.signal_event_ids_json);
    const storyIds = parseStringArray(row.market_story_ids_json);
    const item: DailyOverviewFeedItemV02 = {
      item_type: "daily_overview",
      id: row.id,
      date_utc: row.date_utc,
      _sort_time: row.day_end,
      display_time: "Full UTC day",
      daily_label: dailyLabel(),
      daily_change_label: "24h Change",
      daily_change_pct: row.daily_change_pct,
      market_tone: row.market_tone,
      market_range_pct: row.market_range_pct,
      notable_symbols: notableSymbols,
      top_symbol_moves: topSymbolMoves,
      public_context_status: publicClaudeStatus(
        brief?.status ?? row.claude_status,
      ),
      sources: publicSources(
        dailyPublicSourceRows(sourceRows, row.day_start, row.day_end),
      ),
      chart: {
        chart_highlight_type: "day_window",
        highlight_start: row.day_start,
        highlight_end: row.day_end,
        included_signal_event_ids: signalIds,
        included_market_story_ids: storyIds,
        hide_other_days_on_select: true,
      },
      expanded: {
        daily_market_summary_fields: {
          market_tone: row.market_tone,
          market_range_pct: row.market_range_pct,
          notable_symbols: notableSymbols,
          top_symbol_moves: topSymbolMoves,
          audit_event_count: row.audit_event_count,
        },
        daily_chart_context_summary: parseJsonObject(
          row.daily_chart_context_summary_json,
        ),
      },
    };

    if (brief) {
      item.brief = publicBrief(brief);
    }

    items.push(item);
  }

  return items;
}

async function getMarketStoryItems(
  db: D1Database,
  cutoff: string,
): Promise<MarketStoryFeedItemV02[]> {
  const result = await db
    .prepare(
      `SELECT
        id,
        date_utc,
        story_start,
        story_end,
        duration_min,
        story_label,
        story_family,
        direction,
        swing_change_pct,
        chart_context_score,
        range_context_json,
        trend_context_json,
        momentum_context_json,
        volatility_context_json,
        decision_reasons_json,
        included_signal_event_ids_json,
        included_audit_event_ids_json,
        publish_reason,
        created_at,
        updated_at
       FROM market_stories_v02
       WHERE story_start >= ?
         AND publish_candidate = 1
       ORDER BY story_end DESC, story_start DESC`,
    )
    .bind(cutoff)
    .all<MarketStoryV02FeedRow>();

  return result.results.map((row) => {
    const decisionReasons = parseJsonArray(row.decision_reasons_json);
    const rangeContext = parseJsonObject(row.range_context_json);
    const swingScore =
      numberFromRecord(rangeContext, "swing_score") ?? row.swing_change_pct;
    return {
      item_type: "market_story",
      id: row.id,
      date_utc: row.date_utc,
      _sort_time: row.story_end,
      display_time: displayTimeRange(row.story_start, row.story_end),
      story_window_label: "Story window",
      avg_change_label: "Avg Change",
      avg_change_pct: numberFromRecord(rangeContext, "avg_change_pct"),
      swing_score_label: "Volatility Score",
      swing_score: swingScore,
      story_label: row.story_label,
      story_family: row.story_family,
      direction: row.direction,
      chart_context_score: row.chart_context_score,
      per_symbol_evidence: normalizeMarketStoryPerSymbolEvidence(rangeContext),
      range_context: rangeContext,
      trend_context: parseJsonObject(row.trend_context_json),
      momentum_context: parseJsonObject(row.momentum_context_json),
      volatility_context: parseJsonObject(row.volatility_context_json),
      decision_reasons: decisionReasons,
      publish_reason: row.publish_reason,
      chart: {
        chart_highlight_type: "story_window",
        highlight_start: row.story_start,
        highlight_end: row.story_end,
        included_signal_event_ids: parseStringArray(
          row.included_signal_event_ids_json,
        ),
        included_audit_event_ids: parseStringArray(
          row.included_audit_event_ids_json,
        ),
      },
      deterministic_context: {
        story_label: row.story_label,
        story_family: row.story_family,
        chart_context_score: row.chart_context_score,
        decision_reasons: decisionReasons,
      },
    };
  });
}

async function getSignalEventItems(
  db: D1Database,
  cutoff: string,
): Promise<SignalEventFeedItemV02[]> {
  const result = await db
    .prepare(
      `SELECT
        id,
        date_utc,
        event_start,
        event_end,
        duration_min,
        peak_time,
        direction,
        signals_count,
        n_tracked,
        avg_change_pct,
        avg_change_method,
        event_strength_score,
        impact_label,
        chart_context_score,
        chart_context_label,
        event_story_type,
        trend_context,
        momentum_context,
        volatility_context,
        event_range_context,
        chart_context_reasons_json,
        chart_context_warnings_json,
        publish_reason,
        source_route_hint,
        direction_changed,
        direction_history_json,
        created_at,
        updated_at
       FROM signal_events_v02
       WHERE event_start >= ?
         AND publish_candidate = 1
       ORDER BY event_end DESC, event_start DESC`,
    )
    .bind(cutoff)
    .all<SignalEventV02FeedRow>();

  const items: SignalEventFeedItemV02[] = [];

  for (const row of result.results) {
    const [brief, sourceRows, symbolRows] = await Promise.all([
      getClaudeBriefForTarget(db, "signal_event_v02", row.id),
      getAcceptedSourcesForTarget(db, "signal_event_v02", row.id),
      getSignalSymbols(db, row.id),
    ]);
    const leadMoverSymbol =
      symbolRows.find((symbol) => symbol.is_lead_mover === 1)?.symbol ?? null;
    const strongestPeakSymbol =
      symbolRows.find((symbol) => symbol.is_peak_15m_highlight === 1)?.symbol ??
      null;
    const highlightCells: SignalEventFeedItemV02["highlight_cells"] = [];

    if (leadMoverSymbol) {
      highlightCells.push({
        symbol: leadMoverSymbol,
        column: "symbol",
        reason: "lead_mover",
      });
    }

    if (strongestPeakSymbol) {
      highlightCells.push({
        symbol: strongestPeakSymbol,
        column: "peak_15m",
        reason: "strongest_peak_15m",
      });
    }
    const signalSources = publicSources(
      signalPublicSourceRows(sourceRows, row.event_start, row.event_end),
    );

    const item: SignalEventFeedItemV02 = {
      item_type: "signal_event",
      id: row.id,
      date_utc: row.date_utc,
      _sort_time: row.event_end,
      display_time: displayTimeRange(row.event_start, row.event_end),
      display_window: displayTimeRange(row.event_start, row.event_end),
      direction: row.direction,
      signals_count: row.signals_count,
      n_tracked: row.n_tracked,
      avg_change_label: "Avg Change",
      avg_change_pct: row.avg_change_pct,
      impact_label: row.impact_label,
      event_strength_score: row.event_strength_score,
      chart_context_score: row.chart_context_score,
      chart_context_label: row.chart_context_label,
      event_story_type: row.event_story_type,
      direction_changed: row.direction_changed === 1,
      direction_history: parseJsonArray(row.direction_history_json),
      trend_context: row.trend_context,
      momentum_context: row.momentum_context,
      volatility_context: row.volatility_context,
      event_range_context: row.event_range_context,
      public_context_status: publicClaudeStatus(brief?.status),
      sources: signalSources,
      evidence_window: {
        start: row.event_start,
        end: row.event_end,
        duration_min: row.duration_min,
        peak_time: row.peak_time,
      },
      per_symbol_evidence: symbolRows.map((symbol) => ({
        symbol: symbol.symbol,
        window_change_label: "Window Change",
        window_change_pct: symbol.window_change_pct,
        peak_15m_label: "Peak 15m",
        peak_15m_change_pct: symbol.peak_15m_change_pct,
        range_pct: rangePctFromHighLow(
          symbol.prev_24h_high,
          symbol.prev_24h_low,
        ),
        volume_ratio: symbol.volume_ratio,
        range_position_label: "Range Position",
        range_position: symbol.range_position,
        range_position_display: rangePositionDisplay(symbol.range_position),
        prev_24h_high: symbol.prev_24h_high,
        prev_24h_low: symbol.prev_24h_low,
        range_break_direction: symbol.range_break_direction,
        range_break_pct: symbol.range_break_pct,
        range_break_strength: symbol.range_break_strength,
        distance_to_range_high_pct: symbol.distance_to_range_high_pct,
        distance_to_range_low_pct: symbol.distance_to_range_low_pct,
        is_lead_mover: symbol.is_lead_mover === 1,
        is_peak_15m_highlight: symbol.is_peak_15m_highlight === 1,
        participated: symbol.participated === 1,
        evidence: parseJsonObject(symbol.evidence_json),
      })),
      lead_mover_symbol: leadMoverSymbol,
      strongest_peak_symbol: strongestPeakSymbol,
      highlight_cells: highlightCells,
      chart: {
        chart_highlight_type: "event_window",
        highlight_start: row.event_start,
        highlight_end: row.event_end,
        peak_marker_time: row.peak_time,
        feed_card_id: row.id,
      },
      expanded: {
        chart_context_reasons: parseJsonArray(row.chart_context_reasons_json),
        chart_context_warnings: parseJsonArray(row.chart_context_warnings_json),
        avg_change_method: row.avg_change_method,
        source_route_hint: row.source_route_hint,
        publish_reason: row.publish_reason,
      },
    };

    if (brief) {
      const finalBrief =
        signalSources.length === 0
          ? signalBriefWithoutAcceptedSources(publicBrief(brief))
          : publicBrief(brief);
      item.brief = finalBrief;
      item.public_context_status = finalBrief.status;
    }

    items.push(item);
  }

  return items;
}

function sortItemsForDay(items: FeedItemV02[]): FeedItemV02[] {
  const rank = {
    daily_overview: 0,
    market_story: 1,
    signal_event: 2,
  } as const;

  return [...items].sort((a, b) => {
    const rankDiff = rank[a.item_type] - rank[b.item_type];

    if (rankDiff !== 0) {
      return rankDiff;
    }

    return (
      (b._sort_time ?? "").localeCompare(a._sort_time ?? "") ||
      a.id.localeCompare(b.id)
    );
  });
}

function latestItemForDay(
  items: FeedItemV02[],
  dateUtc: string,
  currentDateUtc: string,
): FeedItemV02 | null {
  const daily = items.find((item) => item.item_type === "daily_overview");

  if (daily && dateUtc !== currentDateUtc) {
    return daily;
  }

  return (
    [...items].sort(
      (a, b) =>
        (b._sort_time ?? "").localeCompare(a._sort_time ?? "") ||
        a.id.localeCompare(b.id),
    )[0] ?? null
  );
}

function dayGroup(
  dateUtc: string,
  items: FeedItemV02[],
  now: Date,
): DayGroupV02 {
  const currentDateUtc = now.toISOString().slice(0, 10);
  const sortedItems = sortItemsForDay(items);
  const collapsedItem = latestItemForDay(sortedItems, dateUtc, currentDateUtc);
  const hiddenCount = Math.max(0, sortedItems.length - 1);
  const hasExtraItems = hiddenCount > 0;

  return {
    day_post_id: `day_${dateUtc}`,
    date_utc: dateUtc,
    display_date: displayDateUtc(dateUtc),
    is_current_utc_day: dateUtc === currentDateUtc,
    item_count: sortedItems.length,
    hidden_item_count_when_collapsed: hiddenCount,
    default_collapsed_item_id: collapsedItem?.id ?? null,
    has_extra_items: hasExtraItems,
    expanded_control_label: hasExtraItems
      ? `+${hiddenCount} events · Collapse post`
      : null,
    collapsed_control_label: hasExtraItems
      ? `+${hiddenCount} events · Expand post`
      : null,
    items: sortedItems,
  };
}

function stripInternalSortKey(item: FeedItemV02): FeedItemV02 {
  const clone = { ...item } as Record<string, unknown>;
  delete clone._sort_time;
  return clone as unknown as FeedItemV02;
}

export async function getIntelligenceFeedV02(
  db: D1Database,
  options: { days?: number; now?: Date } = {},
): Promise<FeedResponseBodyV02> {
  const days = options.days ?? VISIBLE_RANGE_DAYS;
  const now = options.now ?? new Date();
  const cutoff = isoDaysAgo(days, now);
  const [dailyItems, marketStoryItems, signalItems] = await Promise.all([
    getDailyItems(db, cutoff),
    getMarketStoryItems(db, cutoff),
    getSignalEventItems(db, cutoff),
  ]);
  const itemsByDate = new Map<string, FeedItemV02[]>();

  for (const item of [...dailyItems, ...marketStoryItems, ...signalItems]) {
    const existing = itemsByDate.get(item.date_utc) ?? [];
    existing.push(item);
    itemsByDate.set(item.date_utc, existing);
  }

  const dayGroups = [...itemsByDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateUtc, items]) => {
      const group = dayGroup(dateUtc, items, now);
      return {
        ...group,
        items: group.items.map(stripInternalSortKey),
      };
    });

  return {
    ok: true,
    version: "v02",
    updated_at: now.toISOString(),
    range_days: days,
    grouping: "utc_day",
    days_expanded_default: true,
    global_control_label_when_expanded: "Collapse days",
    global_control_label_when_collapsed: "Expand days",
    day_groups: dayGroups,
  };
}
