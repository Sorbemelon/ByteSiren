"use client";

import Image from "next/image";
import {
  Activity,
  ArrowLeftRight,
  BadgeCheck,
  BookOpen,
  ChartSpline,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  HelpCircle,
  Info,
  Layers,
  LocateFixed,
  Lock,
  SearchCheck,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AuroraText } from "./ui/aurora-text";
import {
  createInitialExpandedDayIds,
  ensureSelectedDayExpandedV02,
  getDayPostControlLabel,
  getDayPostHiddenCountLabel,
  getGlobalDayControlLabel,
  getVisibleSectionsForDay,
  isSectionSelectedV02,
  sectionHasExpandableDetails,
  toggleAllDayPosts,
  toggleDayPost,
  toggleSectionDetails,
} from "../lib/feedV02ViewModel";
import { safeFormatPercent } from "../lib/feedAdapters";
import type {
  FeedSourceV02,
  FeedSelectionItemTypeV02,
  FeedSelectionV02,
  NormalizedDailyOverviewSection,
  NormalizedDayPost,
  NormalizedFeedSection,
  NormalizedFeedV02,
  NormalizedMarketStorySection,
  NormalizedSignalEventSection,
  MarketStorySymbolEvidenceV02,
  SignalEventSymbolEvidenceV02,
} from "../lib/types";

interface IntelligenceFeedV02Props {
  feed: NormalizedFeedV02 | null;
  loading: boolean;
  selection: FeedSelectionV02;
  onSelectSection: (
    itemType: FeedSelectionItemTypeV02,
    itemId: string,
    dayPostId: string,
  ) => void;
  onClearSelection: () => void;
}

interface DailySymbolEvidenceRow {
  symbol: string;
  changePct: number | null;
  rangePct: number | null;
  volatilityScore: number | null;
  peakPct: number | null;
  volumeRatio: number | null;
  rangePosition: string | null;
  rangePositionDisplay: string | null;
}

const SECTION_ICON_COLOR = {
  daily: "var(--context-backdrop)",
  marketStory: "var(--two-sided)",
  signalEvent: "var(--status-strong)",
} as const;

const STATUS_META: Record<
  string,
  { Icon: LucideIcon; color: string; label?: string }
> = {
  focused_cause: {
    Icon: BadgeCheck,
    color: "var(--cause-focused)",
    label: "Focused Cause",
  },
  likely_cause: {
    Icon: SearchCheck,
    color: "var(--cause-likely)",
    label: "Likely Cause",
  },
  market_backdrop: {
    Icon: Info,
    color: "var(--context-backdrop)",
    label: "Market Backdrop",
  },
  daily_context: {
    Icon: BookOpen,
    color: "var(--context-backdrop)",
    label: "Daily Overview",
  },
  quiet_day: {
    Icon: Info,
    color: "var(--status-calm)",
    label: "Quiet Day",
  },
  mixed_day: {
    Icon: ArrowLeftRight,
    color: "var(--status-moving)",
    label: "Mixed Day",
  },
  volatile_day: {
    Icon: Activity,
    color: "var(--status-severe)",
    label: "Volatile Day",
  },
  risk_on_day: {
    Icon: TrendingUp,
    color: "var(--up)",
    label: "Risk-on Day",
  },
  risk_off_day: {
    Icon: TrendingDown,
    color: "var(--down)",
    label: "Risk-off Day",
  },
  relief: {
    Icon: TrendingUp,
    color: "var(--up)",
    label: "Relief",
  },
  no_clear_cause: {
    Icon: HelpCircle,
    color: "var(--none-found)",
    label: "No Clear Cause",
  },
  no_major_driver: {
    Icon: HelpCircle,
    color: "var(--none-found)",
    label: "No Major Driver",
  },
  claude_limited: {
    Icon: Lock,
    color: "var(--claude-limited)",
    label: "Claude Limited",
  },
  queued_for_analysis: {
    Icon: Clock,
    color: "var(--status-moving)",
    label: "Waiting for Claude",
  },
  brief_ready: {
    Icon: BadgeCheck,
    color: "var(--cause-focused)",
  },
  context_only: {
    Icon: Info,
    color: "var(--context-backdrop)",
    label: "Market Backdrop",
  },
  none_found: {
    Icon: HelpCircle,
    color: "var(--none-found)",
    label: "No Clear Cause",
  },
  analysis_limited: {
    Icon: Lock,
    color: "var(--claude-limited)",
    label: "Claude Limited",
  },
};

const SOURCE_STYLE: Record<string, React.CSSProperties> = {
  focused: {
    color: "var(--source-focused-text)",
    borderColor: "rgba(59, 130, 246, 0.32)",
  },
  likely: {
    color: "var(--source-likely-text)",
    borderColor: "rgba(125, 211, 252, 0.32)",
  },
  backdrop: {
    color: "var(--source-backdrop-text)",
    borderColor: "var(--chip-border)",
  },
  price: {
    color: "var(--source-price-text)",
    borderColor: "rgba(252, 211, 77, 0.32)",
  },
  daily: {
    color: "var(--source-chip-text)",
    borderColor: "var(--source-chip-border)",
  },
};

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function formatUnknownValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(Number(value.toFixed(3))) : "—";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (Array.isArray(value)) {
    return value.map(formatUnknownValue).join(", ");
  }

  if (typeof value === "object") {
    return Object.entries(value)
      .filter(([, entryValue]) => entryValue !== null && entryValue !== "")
      .map(
        ([key, entryValue]) =>
          `${humanize(key)}: ${formatUnknownValue(entryValue)}`,
      )
      .join("; ");
  }

  return humanize(String(value));
}

function safeFormatScore(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return String(Math.round(value));
}

function safeFormatUnsignedPercent(
  value: number | null | undefined,
  digits = 2,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return safeFormatScore(null);
  }

  return `${value.toFixed(digits)}%`;
}

function hasDisplayableValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasDisplayableValue);
  }

  if (value && typeof value === "object") {
    return contextEntries(value as Record<string, unknown>).length > 0;
  }

  return value !== null && value !== undefined && value !== "";
}

function isPublicContextKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized !== "model_version" &&
    normalized !== "version" &&
    normalized !== "generated_by" &&
    !normalized.endsWith("_version") &&
    !normalized.endsWith("_id") &&
    !normalized.endsWith("_ids") &&
    !normalized.includes("debug") &&
    !normalized.includes("internal")
  );
}

function contextEntries(data: Record<string, unknown>): [string, unknown][] {
  return Object.entries(data).filter(
    ([key, value]) => isPublicContextKey(key) && hasDisplayableValue(value),
  );
}

function humanize(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  return value
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusKey(value: string | null | undefined): string {
  return `${value ?? ""}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function statusMetaFromValues(...values: Array<string | null | undefined>): {
  Icon: LucideIcon;
  color: string;
  label?: string;
} {
  for (const value of values) {
    const meta = STATUS_META[statusKey(value)];
    if (meta) {
      return meta;
    }
  }

  return {
    Icon: Info,
    color: "var(--text-muted)",
  };
}

function valueRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function recordString(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = textOrNull(record[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function recordNumber(
  record: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function numberValuesFromRecords(values: unknown[], keys: string[]): number[] {
  return values
    .map((value) => {
      const record = valueRecord(value);
      return record ? recordNumber(record, keys) : null;
    })
    .filter((value): value is number => value !== null);
}

function formatPercentEndpoint(value: number, showSign: boolean): string {
  const sign = showSign && value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function percentEndpointColor(value: number, showSign: boolean): string {
  if (!showSign) {
    return "var(--text-primary)";
  }

  return value >= 0 ? "var(--up)" : "var(--down)";
}

function formatPercentValueRange({
  values,
  fallback,
  showSign,
}: {
  values: number[];
  fallback: number | null | undefined;
  showSign: boolean;
}): React.ReactNode {
  const finiteValues = values.filter(Number.isFinite);

  if (finiteValues.length === 0) {
    return typeof fallback === "number" && Number.isFinite(fallback)
      ? formatPercentEndpoint(fallback, showSign)
      : safeFormatPercent(null);
  }

  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);

  if (Math.abs(max - min) < 0.005) {
    return formatPercentEndpoint(min, showSign);
  }

  if (showSign) {
    return (
      <>
        <span style={{ color: percentEndpointColor(min, true) }}>
          {formatPercentEndpoint(min, true)}
        </span>{" "}
        <span style={{ color: "var(--text-primary)" }}>to</span>{" "}
        <span style={{ color: percentEndpointColor(max, true) }}>
          {formatPercentEndpoint(max, true)}
        </span>
      </>
    );
  }

  return (
    <>
      <span>{formatPercentEndpoint(min, false)}</span>{" "}
      <span style={{ color: "var(--text-primary)" }}>to</span>{" "}
      <span>{formatPercentEndpoint(max, false)}</span>
    </>
  );
}

function percentRangeColor(
  values: number[],
  fallback: number | null | undefined,
): string {
  const finiteValues =
    values.length > 0
      ? values.filter(Number.isFinite)
      : typeof fallback === "number" && Number.isFinite(fallback)
        ? [fallback]
        : [];

  if (finiteValues.length === 0) {
    return "var(--text-muted)";
  }

  if (finiteValues.every((value) => value >= 0)) {
    return "var(--up)";
  }

  if (finiteValues.every((value) => value <= 0)) {
    return "var(--down)";
  }

  return "var(--text-primary)";
}

function medianNumber(values: number[]): number | null {
  const finiteValues = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (finiteValues.length === 0) {
    return null;
  }

  const middle = Math.floor(finiteValues.length / 2);
  if (finiteValues.length % 2 === 1) {
    return finiteValues[middle];
  }

  return (finiteValues[middle - 1] + finiteValues[middle]) / 2;
}

function dailyVolatilityScore(
  section: NormalizedDailyOverviewSection,
): number | null {
  const chartSummary = valueRecord(section.details.daily_chart_context_summary);
  const summaryScore = chartSummary
    ? recordNumber(chartSummary, ["daily_volatility_score", "volatility_score"])
    : null;

  if (summaryScore !== null) {
    return summaryScore;
  }

  const rowScores = numberValuesFromRecords(section.topSymbolMoves, [
    "volatility_score",
    "swing_score",
  ]);
  const medianScore = medianNumber(rowScores);

  return medianScore === null ? null : Math.round(medianScore);
}

function leadDailyMove(
  section: NormalizedDailyOverviewSection,
): { symbol: string; change: number | null } | null {
  let lead: {
    symbol: string;
    change: number | null;
    absChange: number;
  } | null = null;

  for (const move of section.topSymbolMoves) {
    const record = valueRecord(move);
    if (!record) {
      continue;
    }

    const symbol = recordString(record, ["symbol", "asset", "name"]);
    const change = recordNumber(record, [
      "change_pct",
      "daily_change_pct",
      "window_change_pct",
      "move_pct",
    ]);

    if (!symbol || change === null) {
      continue;
    }

    const absChange = Math.abs(change);
    if (!lead || absChange > lead.absChange) {
      lead = { symbol, change, absChange };
    }
  }

  return lead ? { symbol: lead.symbol, change: lead.change } : null;
}

function peakDailyMove(section: NormalizedDailyOverviewSection): string | null {
  let peak: { symbol: string; value: number } | null = null;

  for (const move of section.topSymbolMoves) {
    const record = valueRecord(move);
    if (!record) {
      continue;
    }

    const symbol = recordString(record, ["symbol", "asset", "name"]);
    const value = recordNumber(record, [
      "peak_change_pct",
      "peak_24h_change_pct",
      "range_pct",
      "daily_range_pct",
    ]);

    if (!symbol || value === null) {
      continue;
    }

    if (!peak || Math.abs(value) > Math.abs(peak.value)) {
      peak = { symbol, value };
    }
  }

  return peak?.symbol ?? null;
}

function formatDirection(value: string | null | undefined): string {
  if (value === "observed_up") {
    return "Observed up";
  }
  if (value === "observed_down") {
    return "Observed down";
  }
  if (value === "two_sided") {
    return "Mixed direction";
  }
  return humanize(value);
}

function formatMarketStoryMovement(value: string | null | undefined): string {
  if (value === "observed_up") {
    return "Upward movement";
  }
  if (value === "observed_down") {
    return "Downward movement";
  }
  if (value === "two_sided") {
    return "Multi-swing movement";
  }
  return humanize(value);
}

function displayDateWithoutUtc(value: string): string {
  return value.replace(/\s+UTC$/i, "");
}

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

function utcParts(value: string | null | undefined): {
  date: string;
  time: string;
} | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  const month = UTC_MONTHS[date.getUTCMonth()];
  const day = date.getUTCDate();
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");

  return {
    date: `${month} ${day}`,
    time: `${hours}:${minutes}`,
  };
}

function spaceTimeRangeSeparator(value: string): string {
  return value.replace(/(\d{1,2}:\d{2})\s*-\s*/g, "$1 - ");
}

function formatMarketStoryWindow(section: NormalizedMarketStorySection): string {
  const start = utcParts(section.chart?.highlight_start);
  const end = utcParts(section.chart?.highlight_end);

  if (start && end) {
    return start.date === end.date
      ? `${start.date}, ${start.time} - ${end.time}`
      : `${start.date}, ${start.time} - ${end.date}, ${end.time}`;
  }

  const day = utcParts(section.dateUtc);
  if (day && section.displayTime) {
    return `${day.date}, ${spaceTimeRangeSeparator(section.displayTime)}`;
  }

  return spaceTimeRangeSeparator(section.displayTime);
}

function DirectionIcon({
  direction,
}: {
  direction: string | null | undefined;
}) {
  if (direction === "observed_up" || direction?.endsWith("_up")) {
    return <TrendingUp size={12} aria-hidden />;
  }
  if (direction === "observed_down" || direction?.endsWith("_down")) {
    return <TrendingDown size={12} aria-hidden />;
  }
  return <ArrowLeftRight size={12} aria-hidden />;
}

function sourceStyle(source: FeedSourceV02): React.CSSProperties {
  const role = `${source.used_for ?? source.tag ?? ""}`.toLowerCase();

  if (role.includes("focused")) return SOURCE_STYLE.focused;
  if (role.includes("likely")) return SOURCE_STYLE.likely;
  if (role.includes("price")) return SOURCE_STYLE.price;
  if (role.includes("daily") || role.includes("main"))
    return SOURCE_STYLE.daily;
  return SOURCE_STYLE.backdrop;
}

function signalToneStyle(
  direction: string | null | undefined,
): React.CSSProperties {
  if (direction === "observed_up" || direction?.endsWith("_up")) {
    return {
      color: "var(--up)",
      borderColor: "rgba(16, 185, 129, 0.28)",
      background: "rgba(16, 185, 129, 0.1)",
    };
  }
  if (direction === "observed_down" || direction?.endsWith("_down")) {
    return {
      color: "var(--down)",
      borderColor: "rgba(244, 63, 94, 0.3)",
      background: "rgba(244, 63, 94, 0.1)",
    };
  }
  return {
    color: "var(--two-sided)",
    borderColor: "rgba(167, 139, 250, 0.32)",
    background: "rgba(167, 139, 250, 0.12)",
  };
}

function Chip({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-medium leading-none"
      style={{
        background: "var(--chip-bg)",
        borderColor: "var(--chip-border)",
        color: "var(--chip-text)",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

function SourceChip({ source }: { source: FeedSourceV02 }) {
  const publisher = source.publisher || source.title || "Source";

  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      title={source.title ?? source.url}
      aria-label={`${publisher}: ${source.title ?? source.url} (opens in new tab)`}
      className="inline-flex max-w-full items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-medium transition-colors hover:bg-white/5 hover:brightness-110 focus-visible:ring-2"
      style={{
        background: "var(--source-chip-bg)",
        ...sourceStyle(source),
        textDecoration: "none",
      }}
    >
      <span className="truncate">{publisher}</span>
      <ExternalLink size={9} aria-hidden className="shrink-0" />
    </a>
  );
}

function marketStoryPublicRangeContext(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const hiddenKeys = new Set([
    "avg_change_label",
    "avg_change_pct",
    "swing_score_label",
    "swing_score",
    "swing_score_method",
    "per_symbol_evidence",
  ]);

  return Object.fromEntries(
    Object.entries(data).filter(([key]) => !hiddenKeys.has(key)),
  );
}

const RANGE_PROFILE_OPTIONS = [
  { key: "broad_broke_high", label: "Broke high" },
  { key: "broad_broke_low", label: "Broke low" },
  { key: "mixed_range_position", label: "Mixed range" },
  { key: "mostly_inside_range", label: "Inside range" },
  { key: "weak_range_context", label: "Weak range" },
  { key: "unknown", label: "Unknown" },
] as const;

const TREND_PROFILE_OPTIONS = [
  { key: "trend_up", label: "Trend up" },
  { key: "trend_down", label: "Trend down" },
  { key: "trend_mixed", label: "Mixed trend" },
  { key: "unknown", label: "Unknown" },
] as const;

const MOMENTUM_PROFILE_OPTIONS = [
  { key: "continuation", label: "Continuation" },
  { key: "no_clear_trend", label: "No clear trend" },
  { key: "mixed", label: "Mixed" },
  { key: "unknown", label: "Unknown" },
] as const;

const VOLATILITY_PROFILE_OPTIONS = [
  { key: "ordinary_volatility", label: "Ordinary volatility" },
  { key: "high_volatility_continuation", label: "High volatility" },
  { key: "expansion_after_compression", label: "Expansion after compression" },
  { key: "volatility_expansion", label: "Volatility expansion" },
  { key: "unknown", label: "Unknown" },
] as const;

type StoryProfileOption = {
  key: string;
  label: string;
};

function optionCountRecord(
  data: Record<string, unknown>,
  countKeys: string[],
  directValueKeys: string[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  let foundCountRecord = false;

  for (const key of countKeys) {
    const record = valueRecord(data[key]);
    if (!record) {
      continue;
    }

    foundCountRecord = true;
    for (const [entryKey, entryValue] of Object.entries(record)) {
      const count =
        typeof entryValue === "number"
          ? entryValue
          : typeof entryValue === "string"
            ? Number(entryValue)
            : 0;
      counts[entryKey] = Number.isFinite(count) ? Math.max(0, count) : 0;
    }
  }

  if (!foundCountRecord) {
    for (const key of directValueKeys) {
      const value = textOrNull(data[key]);
      if (value) {
        counts[value] = (counts[value] ?? 0) + 1;
      }
    }
  }

  return counts;
}

function profileOptionLines(
  data: Record<string, unknown>,
  countKeys: string[],
  directValueKeys: string[],
  options: readonly StoryProfileOption[],
): Array<{ label: string; count: number }> {
  const counts = optionCountRecord(data, countKeys, directValueKeys);

  return options.map((option) => ({
    label: option.label,
    count: Math.round(counts[option.key] ?? 0),
  }));
}

function storyTrendMeta(data: Record<string, unknown>): {
  Icon: LucideIcon;
  color: string;
} {
  const text = JSON.stringify(data).toLowerCase();
  if (text.includes("down")) {
    return { Icon: TrendingDown, color: "var(--down)" };
  }
  if (text.includes("up")) {
    return { Icon: TrendingUp, color: "var(--up)" };
  }
  return { Icon: ArrowLeftRight, color: "var(--status-moving)" };
}

function StoryStructureList({
  section,
  rangeContext,
}: {
  section: NormalizedMarketStorySection;
  rangeContext: Record<string, unknown>;
}) {
  const items: Array<{
    label: string;
    valueLines: Array<{ label: string; count: number }>;
    description: string;
    Icon: LucideIcon;
    color: string;
  }> = [
    {
      label: "Range position",
      valueLines: profileOptionLines(
        rangeContext,
        ["event_range_contexts"],
        ["event_range_context", "range_context"],
        RANGE_PROFILE_OPTIONS,
      ),
      description: "Where the story sat versus the recent range.",
      Icon: LocateFixed,
      color: "var(--market-chip-text)",
    },
    {
      label: "Trend shape",
      valueLines: profileOptionLines(
        section.trendContext,
        ["trend_contexts"],
        ["trend_context", "trend_direction", "trend_shape"],
        TREND_PROFILE_OPTIONS,
      ),
      description: "The broader direction during the story window.",
      ...storyTrendMeta(section.trendContext),
    },
    {
      label: "Momentum",
      valueLines: profileOptionLines(
        section.momentumContext,
        ["momentum_contexts"],
        ["momentum_type", "momentum_context", "momentum_direction"],
        MOMENTUM_PROFILE_OPTIONS,
      ),
      description: "Whether movement continued, reversed, or faded.",
      Icon: ChartSpline,
      color: "var(--status-strong)",
    },
    {
      label: "Volatility",
      valueLines: profileOptionLines(
        section.volatilityContext,
        ["volatility_contexts"],
        ["volatility_context", "volatility_type", "volatility_state"],
        VOLATILITY_PROFILE_OPTIONS,
      ),
      description: "How active the 15m bars were in the story.",
      Icon: ArrowLeftRight,
      color: "var(--two-sided)",
    },
  ];

  return (
    <div>
      <ExpandedSectionHeader>Movement Profile</ExpandedSectionHeader>
      <dl className="grid gap-2 sm:grid-cols-2">
        {items.map(({ label, valueLines, description, Icon, color }) => (
          <div
            key={label}
            className="flex gap-2.5 rounded-lg border px-3 py-2.5"
            style={{
              background: "var(--bg-panel)",
              borderColor: "var(--border-row)",
            }}
          >
            <Icon
              size={15}
              aria-hidden
              className="mt-0.5 shrink-0"
              style={{ color }}
            />
            <div className="min-w-0 flex-1">
              <dt
                className="text-[12px] font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                {label}
              </dt>
              <p
                className="mt-0.5 text-[11px] font-normal leading-snug"
                style={{ color: "var(--text-muted)" }}
              >
                {description}
              </p>
              <dd
                className="mt-2 text-[12px] font-normal leading-snug"
                style={{ color: "var(--text-secondary)" }}
              >
                <ul className="space-y-0.5">
                  {valueLines.map((line) => (
                    <li key={line.label} className="tabular-nums">
                      <span>{line.label}: </span>
                      <span style={{ color: "var(--text-primary)" }}>
                        {line.count > 0 ? line.count : "-"}
                      </span>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SourceList({ sources }: { sources: FeedSourceV02[] }) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {sources.map((source) => (
        <SourceChip key={source.url} source={source} />
      ))}
    </div>
  );
}

function ExpandedSectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="mb-1.5 text-[12px] font-semibold"
      style={{ color: "var(--text-primary)" }}
    >
      {children}
    </p>
  );
}

function SectionToggleButton({
  isExpanded,
  onToggle,
  sectionId,
}: {
  isExpanded: boolean;
  onToggle: () => void;
  sectionId: string;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      onKeyDown={(event) => event.stopPropagation()}
      data-testid="feed-section-toggle-v02"
      data-section-id={sectionId}
      aria-expanded={isExpanded}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-colors hover:bg-white/5 focus-visible:ring-2"
      style={{ color: "var(--text-muted)" }}
    >
      {isExpanded ? "Hide" : "Show more"}
      {isExpanded ? (
        <ChevronUp size={13} aria-hidden />
      ) : (
        <ChevronDown size={13} aria-hidden />
      )}
    </button>
  );
}

function DailyOverviewSection({
  section,
  isExpanded,
  onToggle,
  hasDetails,
}: {
  section: NormalizedDailyOverviewSection;
  isExpanded: boolean;
  onToggle: () => void;
  hasDetails: boolean;
}) {
  const summary =
    textOrNull(section.brief?.collapsed_summary) ??
    textOrNull(section.brief?.headline);
  const visibleSources = section.sources.slice(0, 2);
  const overflowCount = section.sources.length - visibleSources.length;
  const dailyChangeValues = numberValuesFromRecords(section.topSymbolMoves, [
    "change_pct",
    "daily_change_pct",
    "window_change_pct",
    "move_pct",
  ]);
  const rangeValues = numberValuesFromRecords(section.topSymbolMoves, [
    "range_pct",
    "daily_range_pct",
  ]);
  const toneMeta = statusMetaFromValues(
    section.marketTone ? `${section.marketTone}_day` : null,
    section.marketTone,
  );
  const ToneIcon = toneMeta.Icon;
  const toneLabel = section.marketTone
    ? (toneMeta.label ?? humanize(section.marketTone))
    : null;
  const leadMove = leadDailyMove(section);
  const peakSymbol = peakDailyMove(section);
  const volatilityScore = dailyVolatilityScore(section);
  const dailyChangeStyle = {
    color: percentRangeColor(dailyChangeValues, section.dailyChangePct),
  };

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(118px,0.8fr)_minmax(220px,1.35fr)_minmax(74px,0.65fr)] sm:items-start sm:gap-x-3">
        <div className="min-w-0 space-y-2">
          {toneLabel ? (
            <>
              <span
                className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[13px] font-semibold leading-none"
                style={{
                  color: toneMeta.color,
                  borderColor: "var(--chip-border)",
                  background: "var(--chip-bg)",
                }}
              >
                <ToneIcon size={14} aria-hidden />
                {toneLabel}
              </span>
              <p
                className="inline-flex items-center gap-1.5 leading-tight tabular-nums"
                style={{ color: "var(--text-primary)" }}
              >
                <BookOpen
                  size={15}
                  aria-hidden
                  style={{ color: SECTION_ICON_COLOR.daily }}
                />
                <span className="text-[15px] font-semibold">
                  Daily Overview
                </span>
              </p>
            </>
          ) : (
            <p
              className="inline-flex items-center gap-1.5 leading-tight tabular-nums"
              style={{ color: "var(--text-primary)" }}
            >
              <BookOpen
                size={15}
                aria-hidden
                style={{ color: SECTION_ICON_COLOR.daily }}
              />
              <span className="text-[15px] font-semibold">Daily Overview</span>
            </p>
          )}
        </div>

        <div className="grid min-w-0 gap-y-1 sm:justify-self-center">
          <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
            <p
              className="shrink-0 text-[13px] font-semibold"
              style={{ color: "var(--text-secondary)" }}
            >
              {section.dailyChangeLabel}:
            </p>
            <p
              className="min-w-0 whitespace-nowrap text-[13px] font-normal leading-tight tabular-nums"
              style={dailyChangeStyle}
            >
              {formatPercentValueRange({
                values: dailyChangeValues,
                fallback: section.dailyChangePct,
                showSign: true,
              })}
            </p>
          </div>

          <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
            <p
              className="shrink-0 text-[13px] font-semibold"
              style={{ color: "var(--text-secondary)" }}
            >
              Range:
            </p>
            <p
              className="min-w-0 whitespace-nowrap text-[13px] font-normal leading-tight tabular-nums"
              style={{ color: "var(--text-primary)" }}
            >
              {formatPercentValueRange({
                values: rangeValues,
                fallback: section.marketRangePct,
                showSign: false,
              })}
            </p>
          </div>
        </div>

        <div className="grid min-w-0 gap-y-1 sm:min-w-[74px] sm:justify-self-end">
          <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap sm:justify-end">
            <p
              className="shrink-0 text-[13px] font-semibold"
              style={{ color: "var(--text-secondary)" }}
            >
              Lead:
            </p>
            <p
              className="min-w-0 truncate text-[13px] font-normal leading-tight tabular-nums"
              style={{
                color: leadMove ? "var(--text-primary)" : "var(--text-muted)",
              }}
            >
              {leadMove?.symbol ?? "—"}
            </p>
          </div>
          <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap sm:justify-end">
            <p
              className="shrink-0 text-[13px] font-semibold"
              style={{ color: "var(--text-secondary)" }}
            >
              Peak:
            </p>
            <p
              className="min-w-0 truncate text-[13px] font-normal leading-tight tabular-nums"
              style={{
                color: peakSymbol ? "var(--text-primary)" : "var(--text-muted)",
              }}
            >
              {peakSymbol ?? "—"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-2.5">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(108px,16%)_minmax(126px,22%)]">
          <div className="min-w-0 space-y-1.5">
            {summary ? (
              <p
                className="text-[12.5px] leading-snug"
                style={{
                  color: "var(--text-secondary)",
                  display: "-webkit-box",
                  WebkitLineClamp: isExpanded ? "unset" : 2,
                  WebkitBoxOrient: "vertical",
                  overflow: isExpanded ? "visible" : "hidden",
                }}
              >
                {summary}
              </p>
            ) : (
              <p
                className="text-[12px] leading-snug"
                style={{ color: "var(--text-secondary)" }}
              >
                Daily context has not been added yet.
              </p>
            )}
            {hasDetails && (
              <div className="pt-0.5">
                <SectionToggleButton
                  isExpanded={isExpanded}
                  onToggle={onToggle}
                  sectionId={section.id}
                />
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-1.5">
            <p
              className="text-[12px] font-semibold"
              style={{ color: "var(--text-secondary)" }}
            >
              Volatility Score
            </p>
            <p
              className="text-[13px] font-normal leading-tight tabular-nums"
              style={{ color: "var(--text-primary)" }}
            >
              {safeFormatScore(volatilityScore)}
            </p>
          </div>

          <div className="min-w-0 space-y-1.5">
            <p
              className="text-[12px] font-semibold"
              style={{ color: "var(--text-secondary)" }}
            >
              Sources
            </p>
            {section.sources.length > 0 ? (
              <div
                className="flex flex-row flex-wrap items-start gap-1.5 sm:flex-col"
                aria-label="Daily Overview sources"
              >
                {visibleSources.map((source) => (
                  <SourceChip key={source.url} source={source} />
                ))}
                {overflowCount > 0 && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggle();
                    }}
                    onKeyDown={(event) => event.stopPropagation()}
                    aria-label={
                      "Show " +
                      overflowCount +
                      " more accepted source" +
                      (overflowCount === 1 ? "" : "s")
                    }
                    className="rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-white/5"
                    style={{
                      borderColor: "var(--border-row)",
                      color: "var(--text-muted)",
                    }}
                  >
                    +{overflowCount}
                  </button>
                )}
              </div>
            ) : (
              <span
                className="text-[11px]"
                style={{ color: "var(--text-muted)" }}
              >
                No source
              </span>
            )}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div
          className="feed-expand mt-3 space-y-4 pt-3"
          style={{ borderTop: "1px solid var(--border-row)" }}
        >
          {section.brief?.context_details && (
            <div>
              <ExpandedSectionHeader>Context summary</ExpandedSectionHeader>
              <p
                className="max-w-[70ch] text-[13px] leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                {section.brief.context_details}
              </p>
            </div>
          )}
          <DailyOverviewSnapshot section={section} />
          <DailyOverviewEvidenceTable section={section} />
          <DailyOverviewSources sources={section.sources} />
        </div>
      )}
    </div>
  );
}

function dailySymbolEvidenceRows(
  section: NormalizedDailyOverviewSection,
): DailySymbolEvidenceRow[] {
  const rows = new Map<string, DailySymbolEvidenceRow>();
  const addRecord = (item: unknown) => {
    const record = valueRecord(item);
    if (!record) {
      return;
    }

    const symbol = recordString(record, ["symbol", "asset", "name"]);
    if (!symbol) {
      return;
    }

    const existing = rows.get(symbol);
    rows.set(symbol, {
      symbol,
      changePct:
        existing?.changePct ??
        recordNumber(record, [
          "change_pct",
          "daily_change_pct",
          "change_24h_pct",
          "window_change_pct",
          "move_pct",
        ]),
      rangePct:
        existing?.rangePct ??
        recordNumber(record, ["range_pct", "daily_range_pct"]),
      volatilityScore:
        existing?.volatilityScore ??
        recordNumber(record, ["volatility_score", "swing_score"]),
      peakPct:
        existing?.peakPct ??
        recordNumber(record, [
          "peak_change_pct",
          "peak_24h_change_pct",
          "peak_pct",
          "max_intraday_change_pct",
          "peak_15m_change_pct",
        ]),
      volumeRatio:
        existing?.volumeRatio ??
        recordNumber(record, [
          "volume_ratio",
          "volume_x",
          "volume_confirmation",
        ]),
      rangePosition:
        existing?.rangePosition ??
        recordString(record, [
          "range_position",
          "range_position_status",
          "range_status",
        ]),
      rangePositionDisplay:
        existing?.rangePositionDisplay ??
        recordString(record, [
          "range_position_display",
          "range_context",
          "range_label",
        ]),
    });
  };

  for (const move of section.topSymbolMoves) {
    addRecord(move);
  }

  for (const item of section.notableSymbols) {
    addRecord(item);
  }

  return Array.from(rows.values());
}

function strongestDailyChangeSymbol(
  rows: DailySymbolEvidenceRow[],
): string | null {
  let strongest: { symbol: string; value: number } | null = null;

  for (const row of rows) {
    if (row.changePct === null) {
      continue;
    }

    if (!strongest || Math.abs(row.changePct) > Math.abs(strongest.value)) {
      strongest = { symbol: row.symbol, value: row.changePct };
    }
  }

  return strongest?.symbol ?? null;
}

function strongestDailyPeakSymbol(
  rows: DailySymbolEvidenceRow[],
): string | null {
  let strongest: { symbol: string; value: number } | null = null;

  for (const row of rows) {
    if (row.peakPct === null) {
      continue;
    }

    if (!strongest || Math.abs(row.peakPct) > Math.abs(strongest.value)) {
      strongest = { symbol: row.symbol, value: row.peakPct };
    }
  }

  return strongest?.symbol ?? null;
}

function dailyRangePositionDisplay(row: DailySymbolEvidenceRow): string {
  return textOrNull(row.rangePositionDisplay) ?? humanize(row.rangePosition);
}

function DailyOverviewEvidenceTable({
  section,
}: {
  section: NormalizedDailyOverviewSection;
}) {
  const rows = dailySymbolEvidenceRows(section);
  const leadSymbol = strongestDailyChangeSymbol(rows);
  const peakSymbol = strongestDailyPeakSymbol(rows);

  if (rows.length === 0) {
    return null;
  }

  return (
    <div>
      <ExpandedSectionHeader>Per-symbol evidence</ExpandedSectionHeader>
      <div
        className="overflow-x-auto rounded-lg"
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border-row)",
        }}
      >
        <table className="min-w-[760px] w-full border-collapse text-left text-[12px]">
          <thead
            style={{
              background: "var(--bg-panel)",
              color: "var(--text-muted)",
            }}
          >
            <tr>
              <th className="px-3 py-2 font-medium">Symbol</th>
              <th className="px-3 py-2 font-medium">24h Change</th>
              <th className="px-3 py-2 font-medium">Range</th>
              <th className="px-3 py-2 font-medium">Volatility Score</th>
              <th className="px-3 py-2 font-medium">Peak</th>
              <th className="px-3 py-2 font-medium">Volume x</th>
              <th className="px-3 py-2 font-medium">Range Position</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isLead = row.symbol === leadSymbol;
              const isPeak = row.symbol === peakSymbol;

              return (
                <tr
                  key={row.symbol}
                  style={{
                    borderTop: "1px solid var(--border-row)",
                    background: isLead
                      ? "color-mix(in srgb, var(--brand-orange) 8%, transparent)"
                      : "var(--bg-panel)",
                  }}
                >
                  <td
                    className="px-3 py-2 font-semibold"
                    style={{
                      color: isLead
                        ? "var(--status-strong)"
                        : "var(--text-primary)",
                    }}
                  >
                    {row.symbol}
                  </td>
                  <td
                    className="px-3 py-2"
                    style={{
                      color:
                        row.changePct == null
                          ? "var(--text-muted)"
                          : row.changePct >= 0
                            ? "var(--up)"
                            : "var(--down)",
                    }}
                  >
                    {safeFormatPercent(row.changePct)}
                  </td>
                  <td
                    className="px-3 py-2"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {safeFormatUnsignedPercent(row.rangePct)}
                  </td>
                  <td
                    className="px-3 py-2"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {safeFormatScore(row.volatilityScore)}
                  </td>
                  <td
                    className="px-3 py-2 font-medium"
                    style={{
                      background: isPeak
                        ? "color-mix(in srgb, var(--status-strong) 14%, transparent)"
                        : "transparent",
                      color: isPeak
                        ? "var(--status-strong)"
                        : "var(--text-primary)",
                    }}
                  >
                    {safeFormatPercent(row.peakPct)}
                  </td>
                  <td
                    className="px-3 py-2"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {row.volumeRatio === null || row.volumeRatio === undefined
                      ? "—"
                      : `${row.volumeRatio.toFixed(2)}x`}
                  </td>
                  <td
                    className="px-3 py-2"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {dailyRangePositionDisplay(row)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
        Lead symbol is highlighted in the Symbol column. Strongest Peak is
        highlighted in the Peak column. Volume x compares the day&apos;s average
        15m volume with the prior 24h average.
      </p>
    </div>
  );
}

function DailyOverviewSnapshot({
  section,
}: {
  section: NormalizedDailyOverviewSection;
}) {
  const chartSummary = valueRecord(section.details.daily_chart_context_summary);
  const toneReasons =
    chartSummary && Array.isArray(chartSummary.tone_reasons)
      ? chartSummary.tone_reasons.filter(hasDisplayableValue).slice(0, 3)
      : [];
  const signalCount = section.chart?.included_signal_event_ids?.length ?? 0;
  const storyCount = section.chart?.included_market_story_ids?.length ?? 0;

  return (
    <div>
      <ExpandedSectionHeader>Day summary</ExpandedSectionHeader>
      <dl
        className="grid overflow-hidden rounded-lg border sm:grid-cols-[minmax(0,1.5fr)_minmax(84px,0.55fr)_minmax(84px,0.55fr)]"
        style={{
          background: "var(--bg-panel)",
          borderColor: "var(--border-row)",
        }}
      >
        <div className="min-w-0 px-3 py-2">
          <dt
            className="text-[11px] font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            Tone detail
          </dt>
          <dd
            className="mt-1 text-[12px] leading-snug"
            style={{ color: "var(--text-secondary)" }}
          >
            {toneReasons.length > 0 ? (
              <ul className="space-y-0.5">
                {toneReasons.map((reason, index) => (
                  <li key={index}>{humanize(formatUnknownValue(reason))}</li>
                ))}
              </ul>
            ) : (
              safeFormatScore(null)
            )}
          </dd>
        </div>
        <div className="min-w-0 px-3 py-2">
          <dt
            className="text-[11px] font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            Signal
          </dt>
          <dd
            className="mt-0.5 truncate text-[13px] tabular-nums"
            style={{ color: "var(--text-primary)" }}
          >
            {signalCount}
          </dd>
        </div>
        <div className="min-w-0 px-3 py-2">
          <dt
            className="text-[11px] font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            Stories
          </dt>
          <dd
            className="mt-0.5 truncate text-[13px] tabular-nums"
            style={{ color: "var(--text-primary)" }}
          >
            {storyCount}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function DailyOverviewSources({ sources }: { sources: FeedSourceV02[] }) {
  return (
    <div>
      <ExpandedSectionHeader>Sources</ExpandedSectionHeader>
      {sources.length > 0 ? (
        <SourceList sources={sources} />
      ) : (
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          No source
        </span>
      )}
    </div>
  );
}

function MarketStorySection({
  section,
  isExpanded,
  onToggle,
  hasDetails,
}: {
  section: NormalizedMarketStorySection;
  isExpanded: boolean;
  onToggle: () => void;
  hasDetails: boolean;
}) {
  const movementLabel = section.direction
    ? formatMarketStoryMovement(section.direction)
    : null;
  const avgChangeStyle = {
    color:
      section.avgChangePct == null
        ? "var(--text-muted)"
        : section.avgChangePct >= 0
          ? "var(--up)"
          : "var(--down)",
    fontWeight: 600,
  };
  const rangeContext = marketStoryPublicRangeContext(section.rangeContext);
  const storyWindow = formatMarketStoryWindow(section);

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <p
            className="inline-flex items-center gap-1.5 leading-tight tabular-nums"
            style={{ color: "var(--text-primary)" }}
          >
            <Layers
              size={15}
              aria-hidden
              style={{ color: SECTION_ICON_COLOR.marketStory }}
            />
            <span className="text-[15px] font-semibold">
              Market Story{section.isContinuation ? " (Continue)" : ""}
            </span>
          </p>
          <Chip
            style={{
              background:
                "color-mix(in srgb, var(--two-sided) 10%, transparent)",
              borderColor:
                "color-mix(in srgb, var(--two-sided) 38%, transparent)",
              color: SECTION_ICON_COLOR.marketStory,
            }}
          >
            {section.storyLabel}
          </Chip>
        </div>
        {storyWindow && (
          <p
            className="text-right text-[14px] font-semibold tabular-nums"
            style={{ color: "var(--text-primary)" }}
          >
            {storyWindow}
          </p>
        )}
      </div>

      <div
        className="grid items-start gap-2"
        style={{
          gridTemplateColumns:
            "minmax(136px, 0.9fr) minmax(118px, 0.8fr) minmax(0, 1.35fr)",
        }}
      >
        <div className="flex self-stretch flex-col">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <p
              className="shrink-0 text-[13px] font-semibold"
              style={{ color: "var(--text-secondary)" }}
            >
              {section.avgChangeLabel}:
            </p>
            <p
              className="min-w-0 text-[13px] font-semibold leading-tight tabular-nums"
              style={avgChangeStyle}
            >
              {safeFormatPercent(section.avgChangePct)}
            </p>
          </div>

          {hasDetails && (
            <div className="mt-auto flex justify-start pt-2">
              <SectionToggleButton
                isExpanded={isExpanded}
                onToggle={onToggle}
                sectionId={section.id}
              />
            </div>
          )}
        </div>

        <div className="flex self-stretch flex-col">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <p
              className="shrink-0 text-[13px] font-semibold"
              style={{ color: "var(--text-secondary)" }}
            >
              {section.swingScoreLabel}:
            </p>
            <p
              className="min-w-0 text-[13px] font-semibold leading-tight tabular-nums"
              style={{ color: "var(--text-primary)" }}
            >
              {safeFormatScore(section.swingScore)}
            </p>
          </div>
        </div>

        <div className="min-w-0">
          {movementLabel && (
            <div className="flex min-w-0 items-baseline gap-1.5">
              <p
                className="shrink-0 text-[13px] font-semibold"
                style={{ color: "var(--text-secondary)" }}
              >
                Movement:
              </p>
              <p
                className="min-w-0 text-[13px] font-normal leading-tight"
                style={{ color: "var(--text-primary)" }}
              >
                {movementLabel}
              </p>
            </div>
          )}
        </div>
      </div>

      {isExpanded && (
        <div
          className="feed-expand mt-3 space-y-3 pt-3"
          style={{ borderTop: "1px solid var(--border-row)" }}
        >
          <MarketStoryEvidenceTable rows={section.perSymbolEvidence} />
          <StoryStructureList section={section} rangeContext={rangeContext} />
        </div>
      )}
    </div>
  );
}

function SignalEventSection({
  section,
  isExpanded,
  onToggle,
  hasDetails,
}: {
  section: NormalizedSignalEventSection;
  isExpanded: boolean;
  onToggle: () => void;
  hasDetails: boolean;
}) {
  const explicitStatusLabel =
    textOrNull(section.brief?.public_label) ??
    textOrNull(section.brief?.classification);
  const summary =
    textOrNull(section.brief?.collapsed_summary) ??
    textOrNull(section.brief?.headline);
  const visibleSources = section.sources.slice(0, 2);
  const overflowCount = section.sources.length - visibleSources.length;
  const windowLabel = spaceTimeRangeSeparator(
    section.displayWindow || section.displayTime,
  );
  const statusMeta = statusMetaFromValues(
    section.brief?.public_label,
    section.brief?.classification,
    section.brief?.status,
    section.publicContextStatus,
  );
  const StatusIcon = statusMeta.Icon;
  const statusLabel =
    explicitStatusLabel ??
    statusMeta.label ??
    (section.publicContextStatus
      ? humanize(section.publicContextStatus)
      : null);

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <p
            className="inline-flex items-center gap-1.5 leading-tight tabular-nums"
            style={{ color: "var(--text-primary)" }}
          >
            <Activity
              size={15}
              aria-hidden
              style={{ color: SECTION_ICON_COLOR.signalEvent }}
            />
            <span className="text-[15px] font-semibold">Signal Event</span>
          </p>
          <Chip style={signalToneStyle(section.direction)}>
            <span className="mr-1 inline-flex">
              <DirectionIcon direction={section.direction} />
            </span>
            {formatDirection(section.direction)}
          </Chip>
        </div>
        {windowLabel && (
          <p
            className="text-right text-[14px] font-semibold tabular-nums"
            style={{ color: "var(--text-primary)" }}
          >
            {windowLabel}
          </p>
        )}
      </div>

      <div className="feed-card-grid">
        <div className="flex self-stretch flex-col">
          <div>
            <p
              className="text-[12px] font-semibold"
              style={{ color: "var(--text-secondary)" }}
            >
              Signals: {section.signalsCount} of {section.nTracked} symbols
            </p>
            <p
              className="mt-1 text-[11px] tabular-nums"
              style={{ color: "var(--text-primary)" }}
            >
              {section.avgChangeLabel}{" "}
              <span
                style={{
                  color:
                    section.avgChangePct == null
                      ? "var(--text-muted)"
                      : section.avgChangePct >= 0
                        ? "var(--up)"
                        : "var(--down)",
                  fontWeight: 600,
                }}
              >
                {safeFormatPercent(section.avgChangePct)}
              </span>
            </p>
          </div>

          {hasDetails && (
            <div className="mt-auto flex justify-start pt-2">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggle();
                }}
                onKeyDown={(event) => event.stopPropagation()}
                data-testid="feed-section-toggle-v02"
                data-section-id={section.id}
                aria-expanded={isExpanded}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-colors hover:bg-white/5 focus-visible:ring-2"
                style={{ color: "var(--text-muted)" }}
              >
                {isExpanded ? "Hide" : "Show more"}
                {isExpanded ? (
                  <ChevronUp size={13} aria-hidden />
                ) : (
                  <ChevronDown size={13} aria-hidden />
                )}
              </button>
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-1.5">
          {statusLabel && (
            <div className="flex items-center gap-1.5">
              <StatusIcon size={14} color={statusMeta.color} aria-hidden />
              <span
                className="text-[12.5px] font-semibold"
                style={{ color: statusMeta.color }}
              >
                {statusLabel}
              </span>
            </div>
          )}
          {summary ? (
            <p
              className="text-[12.5px] leading-snug"
              style={{
                color: "var(--text-secondary)",
                display: "-webkit-box",
                WebkitLineClamp: isExpanded ? "unset" : 2,
                WebkitBoxOrient: "vertical",
                overflow: isExpanded ? "visible" : "hidden",
              }}
            >
              {summary}
            </p>
          ) : (
            <p
              className="text-[12px] leading-snug"
              style={{ color: "var(--text-secondary)" }}
            >
              Source-backed context has not been added yet.
            </p>
          )}
        </div>

        <div className="min-w-0 space-y-1.5">
          <p
            className="text-[12px] font-semibold"
            style={{ color: "var(--text-secondary)" }}
          >
            Sources
          </p>
          {section.sources.length > 0 ? (
            <div className="flex flex-row flex-wrap items-start gap-1.5 sm:flex-col">
              {visibleSources.map((source) => (
                <SourceChip key={source.url} source={source} />
              ))}
              {overflowCount > 0 && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggle();
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                  aria-label={
                    "Show " +
                    overflowCount +
                    " more accepted source" +
                    (overflowCount === 1 ? "" : "s")
                  }
                  className="rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-white/5"
                  style={{
                    borderColor: "var(--border-row)",
                    color: "var(--text-muted)",
                  }}
                >
                  +{overflowCount}
                </button>
              )}
            </div>
          ) : (
            <span
              className="text-[11px]"
              style={{ color: "var(--text-muted)" }}
            >
              No source
            </span>
          )}
        </div>
      </div>

      {isExpanded && (
        <div
          className="feed-expand mt-3 space-y-4 pt-3"
          style={{ borderTop: "1px solid var(--border-row)" }}
        >
          <div>
            <ExpandedSectionHeader>Per-symbol evidence</ExpandedSectionHeader>
            <SignalEvidenceTable section={section} />
            <p
              className="mt-1.5 text-[11px]"
              style={{ color: "var(--text-muted)" }}
            >
              Lead mover is highlighted in the Symbol column. Strongest Peak 15m
              is highlighted in the Peak 15m column.
            </p>
          </div>
          {section.brief?.context_details && (
            <div>
              <ExpandedSectionHeader>Context Details</ExpandedSectionHeader>
              <p
                className="max-w-[70ch] text-[13px] leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                {section.brief.context_details}
              </p>
            </div>
          )}
          <SignalEventSources sources={section.sources} />
        </div>
      )}
    </div>
  );
}

function SignalEventSources({ sources }: { sources: FeedSourceV02[] }) {
  return (
    <div>
      <ExpandedSectionHeader>Sources</ExpandedSectionHeader>
      {sources.length > 0 ? (
        <SourceList sources={sources} />
      ) : (
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          No source
        </span>
      )}
    </div>
  );
}

function rowHasHighlight(
  row: SignalEventSymbolEvidenceV02,
  section: NormalizedSignalEventSection,
  column: "symbol" | "peak_15m",
): boolean {
  return section.highlightCells.some(
    (cell) => cell.symbol === row.symbol && cell.column === column,
  );
}

function rangePositionDisplay(row: SignalEventSymbolEvidenceV02): string {
  if (row.range_position_display) {
    return row.range_position_display;
  }

  return humanize(row.range_position);
}

function signalRangePct(row: SignalEventSymbolEvidenceV02): number | null {
  if (row.range_pct !== null && row.range_pct !== undefined) {
    return row.range_pct;
  }

  if (
    row.prev_24h_high !== null &&
    row.prev_24h_high !== undefined &&
    row.prev_24h_low !== null &&
    row.prev_24h_low !== undefined &&
    row.prev_24h_low > 0
  ) {
    return ((row.prev_24h_high - row.prev_24h_low) / row.prev_24h_low) * 100;
  }

  return null;
}

function marketStoryMovementStatus(row: MarketStorySymbolEvidenceV02): string {
  return textOrNull(row.movement_status) ?? "No bar data";
}

function MarketStoryEvidenceTable({
  rows,
}: {
  rows: MarketStorySymbolEvidenceV02[];
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <div>
      <ExpandedSectionHeader>Per-symbol evidence</ExpandedSectionHeader>
      <div
        className="overflow-x-auto rounded-lg"
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border-row)",
        }}
      >
        <table className="min-w-[720px] w-full border-collapse text-left text-[12px]">
          <thead
            style={{
              background: "var(--bg-panel)",
              color: "var(--text-muted)",
            }}
          >
            <tr>
              <th className="px-3 py-2 font-medium">Symbol</th>
              <th className="px-3 py-2 font-medium">Change</th>
              <th className="px-3 py-2 font-medium">Range</th>
              <th className="px-3 py-2 font-medium">Volatility Score</th>
              <th className="px-3 py-2 font-medium">Volume ×</th>
              <th className="px-3 py-2 font-medium">Movement Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.symbol}
                style={{
                  borderTop: "1px solid var(--border-row)",
                  background: "var(--bg-panel)",
                }}
              >
                <td
                  className="px-3 py-2 font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {row.symbol}
                </td>
                <td
                  className="px-3 py-2"
                  style={{
                    color:
                      row.avg_change_pct == null
                        ? "var(--text-muted)"
                        : row.avg_change_pct >= 0
                          ? "var(--up)"
                          : "var(--down)",
                  }}
                >
                  {safeFormatPercent(row.avg_change_pct)}
                </td>
                <td
                  className="px-3 py-2"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {safeFormatUnsignedPercent(row.range_pct)}
                </td>
                <td
                  className="px-3 py-2 font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {safeFormatScore(row.swing_score)}
                </td>
                <td
                  className="px-3 py-2"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {row.volume_ratio === null || row.volume_ratio === undefined
                    ? "—"
                    : `${row.volume_ratio.toFixed(2)}x`}
                </td>
                <td
                  className="px-3 py-2"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {marketStoryMovementStatus(row)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SignalEvidenceTable({
  section,
}: {
  section: NormalizedSignalEventSection;
}) {
  if (section.perSymbolEvidence.length === 0) {
    return null;
  }

  return (
    <div
      className="overflow-x-auto rounded-lg"
      style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--border-row)",
      }}
    >
      <table className="min-w-[720px] w-full border-collapse text-left text-[12px]">
        <thead
          style={{
            background: "var(--bg-panel)",
            color: "var(--text-muted)",
          }}
        >
          <tr>
            <th className="px-3 py-2 font-medium">Symbol</th>
            <th className="px-3 py-2 font-medium">Change</th>
            <th className="px-3 py-2 font-medium">Range</th>
            <th className="px-3 py-2 font-medium">Peak 15m</th>
            <th className="px-3 py-2 font-medium">Volume ×</th>
            <th className="px-3 py-2 font-medium">Range Position</th>
          </tr>
        </thead>
        <tbody>
          {section.perSymbolEvidence.map((row) => {
            const isLead =
              row.is_lead_mover ||
              row.symbol === section.leadMoverSymbol ||
              rowHasHighlight(row, section, "symbol");
            const isPeak =
              row.is_peak_15m_highlight ||
              row.symbol === section.strongestPeakSymbol ||
              rowHasHighlight(row, section, "peak_15m");

            return (
              <tr
                key={row.symbol}
                style={{
                  borderTop: "1px solid var(--border-row)",
                  background: isLead
                    ? "color-mix(in srgb, var(--brand-orange) 8%, transparent)"
                    : "var(--bg-panel)",
                }}
              >
                <td
                  className="px-3 py-2 font-semibold"
                  style={{
                    color: isLead
                      ? "var(--status-strong)"
                      : "var(--text-primary)",
                  }}
                >
                  {row.symbol}
                </td>
                <td
                  className="px-3 py-2"
                  style={{
                    color:
                      row.window_change_pct == null
                        ? "var(--text-muted)"
                        : row.window_change_pct >= 0
                          ? "var(--up)"
                          : "var(--down)",
                  }}
                >
                  {safeFormatPercent(row.window_change_pct)}
                </td>
                <td
                  className="px-3 py-2"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {safeFormatUnsignedPercent(signalRangePct(row))}
                </td>
                <td
                  className="px-3 py-2 font-medium"
                  style={{
                    background: isPeak
                      ? "color-mix(in srgb, var(--status-strong) 14%, transparent)"
                      : "transparent",
                    color: isPeak
                      ? "var(--status-strong)"
                      : "var(--text-primary)",
                  }}
                >
                  {safeFormatPercent(row.peak_15m_change_pct)}
                </td>
                <td
                  className="px-3 py-2"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {row.volume_ratio === null || row.volume_ratio === undefined
                    ? "—"
                    : `${row.volume_ratio.toFixed(2)}x`}
                </td>
                <td
                  className="px-3 py-2"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {rangePositionDisplay(row)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FeedSection({
  section,
  isExpanded,
  onToggle,
  isFirst,
  dayPostId,
  isSelected,
  onSelect,
  registerSectionRef,
}: {
  section: NormalizedFeedSection;
  isExpanded: boolean;
  onToggle: () => void;
  isFirst: boolean;
  dayPostId: string;
  isSelected: boolean;
  onSelect: () => void;
  registerSectionRef: (id: string, element: HTMLElement | null) => void;
}) {
  const hasDetails = sectionHasExpandableDetails(section);
  const sectionStyle: React.CSSProperties = {
    borderTop: isFirst ? "0" : "1px solid var(--border-row)",
    background: isSelected ? "rgba(254, 114, 3, 0.12)" : undefined,
    boxShadow: isSelected
      ? "inset 0 0 0 1px rgba(254, 114, 3, 0.68)"
      : undefined,
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  };

  if (section.itemType === "signal_event") {
    return (
      <section
        className="px-3.5 py-3.5"
        data-testid="feed-section-v02"
        data-item-type={section.itemType}
        data-section-id={section.id}
        data-day-post-id={dayPostId}
        data-selected={String(isSelected)}
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={handleKeyDown}
        ref={(element) => registerSectionRef(section.id, element)}
        style={sectionStyle}
      >
        <SignalEventSection
          section={section}
          isExpanded={isExpanded}
          onToggle={onToggle}
          hasDetails={hasDetails}
        />
      </section>
    );
  }

  return (
    <section
      className="px-3.5 py-3.5"
      data-testid="feed-section-v02"
      data-item-type={section.itemType}
      data-section-id={section.id}
      data-day-post-id={dayPostId}
      data-selected={String(isSelected)}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      ref={(element) => registerSectionRef(section.id, element)}
      style={sectionStyle}
    >
      {section.itemType === "daily_overview" && (
        <DailyOverviewSection
          section={section}
          isExpanded={isExpanded}
          onToggle={onToggle}
          hasDetails={hasDetails}
        />
      )}
      {section.itemType === "market_story" && (
        <MarketStorySection
          section={section}
          isExpanded={isExpanded}
          onToggle={onToggle}
          hasDetails={hasDetails}
        />
      )}
    </section>
  );
}

function DayPost({
  day,
  isExpanded,
  expandedSectionIds,
  selection,
  onToggleDay,
  onSelectSection,
  onToggleSection,
  registerSectionRef,
}: {
  day: NormalizedDayPost;
  isExpanded: boolean;
  expandedSectionIds: ReadonlySet<string>;
  selection: FeedSelectionV02;
  onToggleDay: () => void;
  onSelectSection: (
    itemType: FeedSelectionItemTypeV02,
    itemId: string,
    dayPostId: string,
  ) => void;
  onToggleSection: (id: string) => void;
  registerSectionRef: (id: string, element: HTMLElement | null) => void;
}) {
  const visibleSections = getVisibleSectionsForDay(day, isExpanded);
  const dayControlLabel = getDayPostControlLabel(day, isExpanded);
  const hiddenCountLabel = getDayPostHiddenCountLabel(day, isExpanded);

  return (
    <article
      className="feed-row shrink-0 overflow-hidden rounded-2xl"
      data-testid="day-post-v02"
      data-day-post-id={day.id}
    >
      <header
        className="flex flex-col gap-2 px-3.5 py-2 sm:flex-row sm:items-center sm:justify-between"
        style={{ borderBottom: "1px solid var(--border-row)" }}
      >
        <div className="flex min-w-0 items-start">
          <h3
            className="text-[15px] font-semibold leading-tight"
            style={{ color: "var(--text-primary)" }}
          >
            {displayDateWithoutUtc(day.displayDate)}
          </h3>
        </div>

        {dayControlLabel && (
          <div className="flex shrink-0 items-center gap-2">
            {hiddenCountLabel && (
              <span
                data-testid="day-post-hidden-count-v02"
                className="text-[12px] font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {hiddenCountLabel}
              </span>
            )}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggleDay();
              }}
              data-testid="day-post-toggle-v02"
              data-day-post-id={day.id}
              aria-expanded={isExpanded}
              className="inline-flex min-h-7 items-center justify-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors hover:bg-white/5"
              style={{
                borderColor: "var(--border-row)",
                color: "var(--text-secondary)",
              }}
            >
              {dayControlLabel}
              {isExpanded ? (
                <ChevronUp size={14} aria-hidden />
              ) : (
                <ChevronDown size={14} aria-hidden />
              )}
            </button>
          </div>
        )}
      </header>

      <div>
        {visibleSections.map((section, index) => (
          <FeedSection
            key={section.id}
            section={section}
            isExpanded={expandedSectionIds.has(section.id)}
            onToggle={() => onToggleSection(section.id)}
            isFirst={index === 0}
            dayPostId={day.id}
            isSelected={isSectionSelectedV02(selection, section)}
            onSelect={() =>
              onSelectSection(section.itemType, section.id, day.id)
            }
            registerSectionRef={registerSectionRef}
          />
        ))}
      </div>
    </article>
  );
}

export default function IntelligenceFeedV02({
  feed,
  loading,
  selection,
  onSelectSection,
  onClearSelection,
}: IntelligenceFeedV02Props) {
  const [expandedDayIds, setExpandedDayIds] = useState<Set<string>>(() =>
    createInitialExpandedDayIds(feed),
  );
  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setExpandedDayIds(createInitialExpandedDayIds(feed));
    setExpandedSectionIds(new Set());
  }, [feed]);

  useEffect(() => {
    if (!selection.itemId || !selection.dayPostId) {
      return;
    }

    setExpandedDayIds((current) =>
      ensureSelectedDayExpandedV02(current, selection),
    );

    let secondFrame: number | null = null;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const section = sectionRefs.current.get(selection.itemId ?? "");
        const scroller = scrollContainerRef.current;
        if (!section || !scroller) {
          return;
        }

        const sectionTop = section.getBoundingClientRect().top;
        const scrollerTop = scroller.getBoundingClientRect().top;
        scroller.scrollTo({
          top: scroller.scrollTop + sectionTop - scrollerTop,
          behavior: "smooth",
        });
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) {
        window.cancelAnimationFrame(secondFrame);
      }
    };
  }, [selection]);

  const globalLabel = useMemo(() => {
    if (!feed) {
      return "Collapse days";
    }
    return getGlobalDayControlLabel(feed, expandedDayIds);
  }, [expandedDayIds, feed]);
  const isGlobalExpanded = globalLabel === "Collapse days";

  return (
    <section
      aria-label="Intelligence Feed"
      className="flex h-full min-h-0 flex-col rounded-2xl p-4"
      data-testid="intelligence-feed-v02"
      style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--border-panel)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
      }}
    >
      <div className="mb-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="min-w-0 text-[28px] font-semibold leading-tight sm:text-[30px]">
            <AuroraText
              colors={[
                "var(--brand-orange-deep)",
                "var(--brand-orange)",
                "var(--brand-orange-amber)",
                "var(--brand-orange-yellow)",
              ]}
              speed={0.7}
            >
              Intelligence Feed
            </AuroraText>
          </h2>

          {feed && feed.dayPosts.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setExpandedDayIds((current) => toggleAllDayPosts(feed, current))
              }
              data-testid="feed-v02-global-toggle"
              aria-expanded={isGlobalExpanded}
              className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1 rounded-md border px-3 py-2 text-[12px] font-medium transition-colors hover:bg-white/5"
              style={{
                borderColor: "var(--border-row)",
                color: "var(--text-secondary)",
              }}
            >
              {globalLabel}
              {isGlobalExpanded ? (
                <ChevronUp size={14} aria-hidden />
              ) : (
                <ChevronDown size={14} aria-hidden />
              )}
            </button>
          )}
        </div>

        <div className="mt-1.5 space-y-1">
          <p
            className="flex items-center gap-1.5 text-[12px] leading-snug"
            style={{ color: "var(--text-primary)" }}
          >
            <Image
              src="/brand/Binance_icon.png"
              alt=""
              aria-hidden
              width={14}
              height={14}
              className="h-3.5 w-3.5 shrink-0"
            />
            <span>Binance public market data drives the detection.</span>
          </p>
          <p
            className="flex items-start gap-1.5 text-[12px] leading-snug"
            style={{ color: "var(--text-primary)" }}
          >
            <Image
              src="/brand/Claude_AI_symbol.svg"
              alt=""
              aria-hidden
              width={14}
              height={14}
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
            />
            <span>
              Claude context appears on Daily Overview and Signal Event sections
              when source-backed analysis exists.
            </span>
          </p>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain pr-1"
        data-testid="feed-scroll-v02"
        style={{ scrollbarGutter: "stable" }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            onClearSelection();
          }
        }}
      >
        {loading && (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Loading intelligence feed...
            </p>
          </div>
        )}

        {!loading && (!feed || feed.dayPosts.length === 0) && (
          <div
            className="flex flex-col items-center justify-center rounded-xl px-4 py-10 text-center"
            style={{
              background: "var(--chip-bg)",
              border: "1px dashed var(--border-row)",
            }}
          >
            <p
              className="text-[13px] font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              No v0.2 intelligence items are available for the past 30 days.
            </p>
            <p
              className="mt-1.5 text-[12px]"
              style={{ color: "var(--text-muted)" }}
            >
              ByteSiren will show day posts when v0.2 feed rows are available.
            </p>
          </div>
        )}

        {!loading &&
          feed?.dayPosts.map((day) => (
            <DayPost
              key={day.id}
              day={day}
              isExpanded={expandedDayIds.has(day.id)}
              expandedSectionIds={expandedSectionIds}
              selection={selection}
              onToggleDay={() =>
                setExpandedDayIds((current) => toggleDayPost(current, day.id))
              }
              onSelectSection={onSelectSection}
              onToggleSection={(id) =>
                setExpandedSectionIds((current) =>
                  toggleSectionDetails(current, id),
                )
              }
              registerSectionRef={(id, element) => {
                if (element) {
                  sectionRefs.current.set(id, element);
                } else {
                  sectionRefs.current.delete(id);
                }
              }}
            />
          ))}
      </div>
    </section>
  );
}
