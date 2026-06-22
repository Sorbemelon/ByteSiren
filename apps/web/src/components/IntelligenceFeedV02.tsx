"use client";

import Image from "next/image";
import {
  Activity,
  ArrowLeftRight,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Layers,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AuroraText } from "./ui/aurora-text";
import {
  createInitialExpandedDayIds,
  getDayPostControlLabel,
  getDayPostHiddenCountLabel,
  getGlobalDayControlLabel,
  getVisibleSectionsForDay,
  sectionHasExpandableDetails,
  toggleAllDayPosts,
  toggleDayPost,
  toggleSectionDetails,
} from "../lib/feedV02ViewModel";
import { safeFormatPercent } from "../lib/feedAdapters";
import type {
  FeedSourceV02,
  NormalizedDailyOverviewSection,
  NormalizedDayPost,
  NormalizedFeedSection,
  NormalizedFeedV02,
  NormalizedMarketStorySection,
  NormalizedSignalEventSection,
  SignalEventSymbolEvidenceV02,
} from "../lib/types";

interface IntelligenceFeedV02Props {
  feed: NormalizedFeedV02 | null;
  loading: boolean;
}

const SIGNAL_CAUSE_LABELS = new Set([
  "Focused Cause",
  "Likely Cause",
  "Market Backdrop",
  "No Clear Cause",
  "Claude Limited",
]);

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

function chartContextLabel(score: number | null): string | null {
  if (score === null) {
    return null;
  }
  if (score >= 75) {
    return "Strong chart context";
  }
  if (score >= 50) {
    return "Moderate chart context";
  }
  return "Weak chart context";
}

function directionColor(value: string | null | undefined): string {
  if (value === "observed_up" || value?.endsWith("_up")) {
    return "var(--up)";
  }
  if (value === "observed_down" || value?.endsWith("_down")) {
    return "var(--down)";
  }
  return "var(--two-sided)";
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
  const label = source.publisher || source.title || "Source";
  const sourceRole = source.tag || source.used_for || "Source";

  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      title={source.title ?? source.url}
      aria-label={`${label}: ${source.title ?? sourceRole} (opens in new tab)`}
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors hover:bg-white/5"
      style={{
        background: "var(--source-chip-bg)",
        ...sourceStyle(source),
      }}
    >
      <span className="truncate">{label}</span>
      <ExternalLink size={12} aria-hidden className="shrink-0" />
    </a>
  );
}

function ContextGrid({
  title,
  data,
}: {
  title: string;
  data: Record<string, unknown>;
}) {
  const entries = Object.entries(data).filter(([, value]) => {
    if (Array.isArray(value)) return value.length > 0;
    return value !== null && value !== undefined && value !== "";
  });

  if (entries.length === 0) {
    return null;
  }

  return (
    <div>
      <p
        className="mb-2 text-[11px] font-semibold"
        style={{ color: "var(--text-secondary)" }}
      >
        {title}
      </p>
      <dl className="grid gap-2 sm:grid-cols-2">
        {entries.map(([key, value]) => (
          <div key={key} className="min-w-0">
            <dt
              className="text-[10px] font-medium uppercase"
              style={{ color: "var(--text-muted)", letterSpacing: "0.02em" }}
            >
              {humanize(key)}
            </dt>
            <dd
              className="mt-0.5 break-words text-[12px]"
              style={{ color: "var(--text-secondary)" }}
            >
              {formatUnknownValue(value)}
            </dd>
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
      onClick={onToggle}
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
  const dailyLabel =
    section.dailyLabel && !SIGNAL_CAUSE_LABELS.has(section.dailyLabel)
      ? section.dailyLabel
      : "Daily Overview";
  const summary =
    textOrNull(section.brief?.collapsed_summary) ??
    textOrNull(section.brief?.headline);
  const visibleSources = section.sources.slice(0, 2);
  const overflowCount = section.sources.length - visibleSources.length;

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <p
            className="inline-flex items-center gap-1.5 leading-tight tabular-nums"
            style={{ color: "var(--text-primary)" }}
          >
            <BookOpen size={15} aria-hidden />
            <span className="text-[15px] font-semibold">Daily Overview</span>
          </p>
        </div>
        {section.displayTime && (
          <p
            className="text-right text-[14px] font-semibold tabular-nums"
            style={{ color: "var(--text-primary)" }}
          >
            {section.displayTime}
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
              Tone: {humanize(section.marketTone)}
            </p>
            <p
              className="mt-1 text-[11px] tabular-nums"
              style={{ color: "var(--text-primary)" }}
            >
              {section.dailyChangeLabel}{" "}
              <span
                style={{
                  color:
                    section.dailyChangePct == null
                      ? "var(--text-muted)"
                      : section.dailyChangePct >= 0
                        ? "var(--up)"
                        : "var(--down)",
                  fontWeight: 600,
                }}
              >
                {safeFormatPercent(section.dailyChangePct)}
              </span>
            </p>
            <p
              className="mt-1 text-[11px] tabular-nums"
              style={{ color: "var(--text-secondary)" }}
            >
              Range {safeFormatPercent(section.marketRangePct)}
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

        <div className="min-w-0 space-y-1.5">
          <h3
            className="inline-flex items-center gap-1.5 text-[15px] font-semibold leading-snug"
            style={{ color: "var(--text-primary)" }}
          >
            <BookOpen size={14} aria-hidden className="shrink-0" />
            {dailyLabel}
          </h3>
          {summary ? (
            <p
              className="mt-1 text-[12px] leading-relaxed"
              style={{ color: "var(--text-secondary)" }}
            >
              {summary}
            </p>
          ) : (
            <p
              className="mt-1 text-[12px] leading-relaxed"
              style={{ color: "var(--text-muted)" }}
            >
              Daily context has not been added yet.
            </p>
          )}
        </div>

        <div className="flex self-stretch flex-col">
          <div>
            {section.sources.length > 0 ? (
              <div className="flex flex-row flex-wrap items-start gap-1.5 sm:flex-col">
                {visibleSources.map((source) => (
                  <SourceChip key={source.url} source={source} />
                ))}
                {overflowCount > 0 && (
                  <button
                    type="button"
                    onClick={onToggle}
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
                -
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
              <p
                className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                Context Details
              </p>
              <p
                className="max-w-[70ch] text-[13px] leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                {section.brief.context_details}
              </p>
            </div>
          )}
          <DailyOverviewLists section={section} />
          <ContextGrid title="Daily chart context" data={section.details} />
          {section.sources.length > visibleSources.length && (
            <div>
              <p
                className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                Sources
              </p>
              <SourceList sources={section.sources} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DailyOverviewLists({
  section,
}: {
  section: NormalizedDailyOverviewSection;
}) {
  const topMoves = section.topSymbolMoves.slice(0, 5);
  const notable = section.notableSymbols.slice(0, 4);

  if (topMoves.length === 0 && notable.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {topMoves.length > 0 && (
        <div>
          <p
            className="mb-2 text-[11px] font-semibold"
            style={{ color: "var(--text-secondary)" }}
          >
            Top symbol moves
          </p>
          <div className="flex flex-wrap gap-1.5">
            {topMoves.map((move, index) => (
              <Chip key={index}>{formatUnknownValue(move)}</Chip>
            ))}
          </div>
        </div>
      )}
      {notable.length > 0 && (
        <div>
          <p
            className="mb-2 text-[11px] font-semibold"
            style={{ color: "var(--text-secondary)" }}
          >
            Notable symbols
          </p>
          <div className="flex flex-wrap gap-1.5">
            {notable.map((item, index) => (
              <Chip key={index}>{formatUnknownValue(item)}</Chip>
            ))}
          </div>
        </div>
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
  const contextLabel = chartContextLabel(section.chartContextScore);

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <p
            className="inline-flex items-center gap-1.5 leading-tight tabular-nums"
            style={{ color: "var(--text-primary)" }}
          >
            <Layers size={15} aria-hidden />
            <span className="text-[15px] font-semibold">Market Story</span>
          </p>
          {section.direction && (
            <Chip style={{ color: directionColor(section.direction) }}>
              <span className="mr-1 inline-flex">
                <DirectionIcon direction={section.direction} />
              </span>
              {formatDirection(section.direction)}
            </Chip>
          )}
        </div>
        <p
          className="text-right text-[14px] font-semibold tabular-nums"
          style={{ color: "var(--text-primary)" }}
        >
          {section.displayTime || "Story window"}
        </p>
      </div>

      <div className="feed-card-grid">
        <div className="flex self-stretch flex-col">
          <div>
            <p
              className="text-[12px] font-semibold"
              style={{ color: "var(--text-secondary)" }}
            >
              Pattern:{" "}
              {section.storyFamily ? humanize(section.storyFamily) : "Context"}
            </p>
            <p
              className="mt-1 text-[11px] tabular-nums"
              style={{ color: "var(--text-primary)" }}
            >
              {section.swingChangeLabel}{" "}
              <span
                style={{
                  color:
                    section.swingChangePct == null
                      ? "var(--text-muted)"
                      : section.swingChangePct >= 0
                        ? "var(--up)"
                        : "var(--down)",
                  fontWeight: 600,
                }}
              >
                {safeFormatPercent(section.swingChangePct)}
              </span>
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

        <div className="min-w-0 space-y-1.5">
          {contextLabel && (
            <div className="flex items-center gap-1.5">
              <Layers size={14} color="var(--market-chip-text)" aria-hidden />
              <span
                className="text-[12.5px] font-semibold"
                style={{ color: "var(--market-chip-text)" }}
              >
                {contextLabel}
              </span>
            </div>
          )}
          <h3
            className="text-[15px] font-semibold leading-snug"
            style={{ color: "var(--text-primary)" }}
          >
            {section.storyLabel}
          </h3>
        </div>

        <div className="flex self-stretch flex-col">
          <div className="flex flex-row flex-wrap items-start gap-1.5 sm:flex-col">
            <Chip>{section.storyWindowLabel}</Chip>
            {section.storyFamily && (
              <Chip>{humanize(section.storyFamily)}</Chip>
            )}
            <Chip>Deterministic</Chip>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div
          className="feed-expand mt-3 space-y-4 pt-3"
          style={{ borderTop: "1px solid var(--border-row)" }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <ContextGrid title="Range context" data={section.rangeContext} />
            <ContextGrid title="Trend context" data={section.trendContext} />
            <ContextGrid
              title="Momentum context"
              data={section.momentumContext}
            />
            <ContextGrid
              title="Volatility context"
              data={section.volatilityContext}
            />
          </div>

          {section.decisionReasons.length > 0 && (
            <div>
              <p
                className="mb-2 text-[11px] font-semibold"
                style={{ color: "var(--text-secondary)" }}
              >
                Chart context reasons
              </p>
              <ul className="space-y-1">
                {section.decisionReasons.map((reason, index) => (
                  <li
                    key={index}
                    className="text-[12px] leading-relaxed"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {formatUnknownValue(reason)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {section.publishReason && (
            <p
              className="text-[12px] leading-relaxed"
              style={{ color: "var(--text-secondary)" }}
            >
              {section.publishReason}
            </p>
          )}

          {(section.chart?.included_signal_event_ids?.length ||
            section.chart?.included_audit_event_ids?.length) && (
            <div className="flex flex-wrap gap-1.5">
              {(section.chart.included_signal_event_ids ?? []).map((id) => (
                <Chip key={id}>Signal {id}</Chip>
              ))}
              {(section.chart.included_audit_event_ids ?? []).map((id) => (
                <Chip key={id}>Audit evidence {id}</Chip>
              ))}
            </div>
          )}
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
  const statusLabel =
    textOrNull(section.brief?.public_label) ??
    textOrNull(section.brief?.classification) ??
    (section.publicContextStatus
      ? humanize(section.publicContextStatus)
      : null);
  const summary =
    textOrNull(section.brief?.collapsed_summary) ??
    textOrNull(section.brief?.headline);
  const visibleSources = section.sources.slice(0, 2);
  const overflowCount = section.sources.length - visibleSources.length;
  const windowLabel = section.displayWindow || section.displayTime;

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <p
            className="inline-flex items-center gap-1.5 leading-tight tabular-nums"
            style={{ color: "var(--text-primary)" }}
          >
            <Activity size={15} aria-hidden />
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
                onClick={onToggle}
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
              <Activity size={14} color="var(--accent-primary)" aria-hidden />
              <span
                className="text-[12.5px] font-semibold"
                style={{ color: "var(--accent-primary)" }}
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

        <div className="flex self-stretch flex-col">
          <div>
            {section.sources.length > 0 ? (
              <div className="flex flex-row flex-wrap items-start gap-1.5 sm:flex-col">
                {visibleSources.map((source) => (
                  <SourceChip key={source.url} source={source} />
                ))}
                {overflowCount > 0 && (
                  <button
                    type="button"
                    onClick={onToggle}
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
                -
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
          <div>
            <p
              className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Per-symbol evidence
            </p>
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
              <p
                className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                Context Details
              </p>
              <p
                className="max-w-[70ch] text-[13px] leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                {section.brief.context_details}
              </p>
            </div>
          )}
          {section.sources.length > visibleSources.length && (
            <div>
              <p
                className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                Sources
              </p>
              <SourceList sources={section.sources} />
            </div>
          )}
        </div>
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
      <table className="min-w-[620px] w-full border-collapse text-left text-[12px]">
        <thead
          style={{
            background: "var(--bg-panel)",
            color: "var(--text-muted)",
          }}
        >
          <tr>
            <th className="px-3 py-2 font-medium">Symbol</th>
            <th className="px-3 py-2 font-medium">Window Change</th>
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
                  style={{ color: "var(--text-primary)" }}
                >
                  {safeFormatPercent(row.window_change_pct)}
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
}: {
  section: NormalizedFeedSection;
  isExpanded: boolean;
  onToggle: () => void;
  isFirst: boolean;
}) {
  const hasDetails = sectionHasExpandableDetails(section);

  if (section.itemType === "signal_event") {
    return (
      <section
        className="px-3.5 py-3.5"
        data-testid="feed-section-v02"
        data-item-type={section.itemType}
        data-section-id={section.id}
        style={{
          borderTop: isFirst ? "0" : "1px solid var(--border-row)",
        }}
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
      style={{
        borderTop: isFirst ? "0" : "1px solid var(--border-row)",
      }}
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
  onToggleDay,
  onToggleSection,
}: {
  day: NormalizedDayPost;
  isExpanded: boolean;
  expandedSectionIds: ReadonlySet<string>;
  onToggleDay: () => void;
  onToggleSection: (id: string) => void;
}) {
  const visibleSections = getVisibleSectionsForDay(day, isExpanded);
  const dayControlLabel = getDayPostControlLabel(day, isExpanded);
  const hiddenCountLabel = getDayPostHiddenCountLabel(day, isExpanded);

  return (
    <article
      className="feed-row overflow-hidden rounded-2xl"
      data-testid="day-post-v02"
      data-day-post-id={day.id}
    >
      <header className="flex flex-col gap-3 px-3.5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border"
            style={{
              borderColor: "rgba(139, 92, 246, 0.32)",
              background: "var(--accent-selected-bg)",
              color: "var(--accent-primary)",
            }}
            aria-hidden
          >
            <CalendarDays size={17} />
          </span>
          <div className="min-w-0">
            <h3
              className="text-[17px] font-semibold leading-tight"
              style={{ color: "var(--text-primary)" }}
            >
              {day.displayDate}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {day.isCurrentUtcDay && <Chip>Current UTC day</Chip>}
            </div>
          </div>
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
              onClick={onToggleDay}
              data-testid="day-post-toggle-v02"
              data-day-post-id={day.id}
              aria-expanded={isExpanded}
              className="inline-flex min-h-9 items-center justify-center gap-1 rounded-md border px-3 py-2 text-[12px] font-medium transition-colors hover:bg-white/5"
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
          />
        ))}
      </div>
    </article>
  );
}

export default function IntelligenceFeedV02({
  feed,
  loading,
}: IntelligenceFeedV02Props) {
  const [expandedDayIds, setExpandedDayIds] = useState<Set<string>>(() =>
    createInitialExpandedDayIds(feed),
  );
  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    setExpandedDayIds(createInitialExpandedDayIds(feed));
    setExpandedSectionIds(new Set());
  }, [feed]);

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

      <div className="flex min-h-50 flex-1 flex-col gap-3 overflow-y-auto pr-0.5">
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
              onToggleDay={() =>
                setExpandedDayIds((current) => toggleDayPost(current, day.id))
              }
              onToggleSection={(id) =>
                setExpandedSectionIds((current) =>
                  toggleSectionDetails(current, id),
                )
              }
            />
          ))}
      </div>
    </section>
  );
}
