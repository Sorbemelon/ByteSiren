"use client";

import Image from "next/image";
import {
  Activity,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Layers,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AuroraText } from "./ui/aurora-text";
import {
  createInitialExpandedDayIds,
  getDayPostControlLabel,
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
    return JSON.stringify(value);
  }

  return String(value);
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
    return "Two-sided";
  }
  return humanize(value);
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

function sourceStyle(source: FeedSourceV02): React.CSSProperties {
  const role = `${source.used_for ?? source.tag ?? ""}`.toLowerCase();

  if (role.includes("focused")) return SOURCE_STYLE.focused;
  if (role.includes("likely")) return SOURCE_STYLE.likely;
  if (role.includes("price")) return SOURCE_STYLE.price;
  if (role.includes("daily") || role.includes("main"))
    return SOURCE_STYLE.daily;
  return SOURCE_STYLE.backdrop;
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

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p
        className="text-[10px] font-medium uppercase"
        style={{ color: "var(--text-muted)", letterSpacing: "0.02em" }}
      >
        {label}
      </p>
      <p
        className="mt-0.5 truncate text-[13px] font-semibold"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </p>
    </div>
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

function DailyOverviewSection({
  section,
  isExpanded,
}: {
  section: NormalizedDailyOverviewSection;
  isExpanded: boolean;
}) {
  const dailyLabel =
    section.dailyLabel && !SIGNAL_CAUSE_LABELS.has(section.dailyLabel)
      ? section.dailyLabel
      : "Daily Overview";
  const statusLabel = section.publicContextStatus
    ? humanize(section.publicContextStatus)
    : section.brief?.status
      ? humanize(section.brief.status)
      : null;
  const summary =
    textOrNull(section.brief?.collapsed_summary) ??
    textOrNull(section.brief?.headline);

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Chip
            style={{
              color: "var(--accent-primary)",
              borderColor: "rgba(139, 92, 246, 0.34)",
            }}
          >
            Daily Overview
          </Chip>
          <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            {section.displayTime}
          </span>
          {statusLabel && <Chip>{statusLabel}</Chip>}
        </div>
        <div>
          <h3
            className="text-[15px] font-semibold leading-snug"
            style={{ color: "var(--text-primary)" }}
          >
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
        <SourceList sources={section.sources} />
      </div>

      <div className="grid min-w-[160px] grid-cols-2 gap-3 sm:min-w-[220px]">
        <Metric
          label={section.dailyChangeLabel}
          value={safeFormatPercent(section.dailyChangePct)}
        />
        <Metric label="Tone" value={humanize(section.marketTone)} />
        <Metric
          label="Range"
          value={safeFormatPercent(section.marketRangePct)}
        />
      </div>

      {isExpanded && (
        <div className="feed-expand mt-3 space-y-4">
          {section.brief?.context_details && (
            <p
              className="text-[12px] leading-relaxed"
              style={{ color: "var(--text-secondary)" }}
            >
              {section.brief.context_details}
            </p>
          )}
          <DailyOverviewLists section={section} />
          <ContextGrid title="Daily chart context" data={section.details} />
        </div>
      )}
    </>
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
}: {
  section: NormalizedMarketStorySection;
  isExpanded: boolean;
}) {
  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Chip
            style={{
              color: "var(--market-chip-text)",
              borderColor: "var(--market-chip-border)",
            }}
          >
            Market Story
          </Chip>
          <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            {section.displayTime || "Story window"}
          </span>
        </div>
        <div>
          <h3
            className="text-[15px] font-semibold leading-snug"
            style={{ color: "var(--text-primary)" }}
          >
            {section.storyLabel}
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip>{section.storyWindowLabel}</Chip>
            <Chip>
              {section.swingChangeLabel}:{" "}
              {safeFormatPercent(section.swingChangePct)}
            </Chip>
            {section.direction && (
              <Chip style={{ color: directionColor(section.direction) }}>
                {formatDirection(section.direction)}
              </Chip>
            )}
            {section.chartContextScore !== null && (
              <Chip>Context {Math.round(section.chartContextScore)}</Chip>
            )}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="feed-expand mt-3 space-y-4">
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
    </>
  );
}

function SignalEventSection({
  section,
  isExpanded,
}: {
  section: NormalizedSignalEventSection;
  isExpanded: boolean;
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

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Chip
            style={{
              color: "var(--source-chip-text)",
              borderColor: "var(--source-chip-border)",
            }}
          >
            Signal Event
          </Chip>
          <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            {section.displayWindow || section.displayTime}
          </span>
          {statusLabel && <Chip>{statusLabel}</Chip>}
        </div>
        <div>
          <h3
            className="text-[15px] font-semibold leading-snug"
            style={{ color: "var(--text-primary)" }}
          >
            {formatDirection(section.direction)}
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
              Source-backed context has not been added yet.
            </p>
          )}
        </div>
        <SourceList sources={section.sources} />
      </div>

      <div className="grid min-w-[160px] grid-cols-2 gap-3 sm:min-w-[220px]">
        <Metric
          label={section.avgChangeLabel}
          value={safeFormatPercent(section.avgChangePct)}
        />
        <Metric
          label="Signals"
          value={`${section.signalsCount} of ${section.nTracked}`}
        />
        <Metric label="Impact" value={section.impactLabel ?? "—"} />
        <Metric
          label="Context"
          value={
            section.chartContextScore === null
              ? "—"
              : Math.round(section.chartContextScore)
          }
        />
      </div>

      {isExpanded && (
        <div className="feed-expand mt-3 space-y-4">
          <SignalEvidenceTable section={section} />
          {section.brief?.context_details && (
            <p
              className="text-[12px] leading-relaxed"
              style={{ color: "var(--text-secondary)" }}
            >
              {section.brief.context_details}
            </p>
          )}
          <ContextGrid
            title="Chart context"
            data={{
              chart_context_label: section.chartContextLabel,
              event_story_type: section.eventStoryType,
              trend_context: section.trendContext,
              momentum_context: section.momentumContext,
              volatility_context: section.volatilityContext,
              event_range_context: section.eventRangeContext,
              ...section.details,
            }}
          />
        </div>
      )}
    </>
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
    <div className="overflow-x-auto rounded-lg border border-[var(--border-row)]">
      <table className="min-w-[620px] w-full border-collapse text-left text-[12px]">
        <thead
          style={{
            background:
              "color-mix(in srgb, var(--bg-panel-soft) 82%, transparent)",
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
                    : "transparent",
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

function SectionIcon({
  itemType,
}: {
  itemType: NormalizedFeedSection["itemType"];
}) {
  const Icon =
    itemType === "daily_overview"
      ? BookOpen
      : itemType === "market_story"
        ? Layers
        : Activity;

  return (
    <span
      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border"
      style={{
        borderColor: "var(--border-row)",
        background: "var(--chip-bg)",
        color:
          itemType === "market_story"
            ? "var(--market-chip-text)"
            : "var(--accent-primary)",
      }}
      aria-hidden
    >
      <Icon size={16} />
    </span>
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

  return (
    <section
      className="px-3.5 py-3.5"
      style={{
        borderTop: isFirst ? "0" : "1px solid var(--border-row)",
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <SectionIcon itemType={section.itemType} />
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col">
            {section.itemType === "daily_overview" && (
              <DailyOverviewSection section={section} isExpanded={isExpanded} />
            )}
            {section.itemType === "market_story" && (
              <MarketStorySection section={section} isExpanded={isExpanded} />
            )}
            {section.itemType === "signal_event" && (
              <SignalEventSection section={section} isExpanded={isExpanded} />
            )}
          </div>
          {hasDetails && (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={isExpanded}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium transition-colors hover:bg-white/5"
              style={{ color: "var(--text-muted)" }}
            >
              {isExpanded ? "Hide" : "Show more"}
              {isExpanded ? (
                <ChevronUp size={14} aria-hidden />
              ) : (
                <ChevronDown size={14} aria-hidden />
              )}
            </button>
          )}
        </div>
      </div>
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

  return (
    <article className="feed-row overflow-hidden rounded-2xl">
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
              <Chip>
                {day.itemCount} item{day.itemCount === 1 ? "" : "s"}
              </Chip>
              {day.isCurrentUtcDay && <Chip>Current UTC day</Chip>}
            </div>
          </div>
        </div>

        {dayControlLabel && (
          <button
            type="button"
            onClick={onToggleDay}
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
      style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--border-panel)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
      }}
    >
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-[28px] font-semibold leading-tight sm:text-[30px]">
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
                Claude context appears on Daily Overview and Signal Event
                sections when source-backed analysis exists.
              </span>
            </p>
          </div>
        </div>

        {feed && feed.dayPosts.length > 0 && (
          <button
            type="button"
            onClick={() =>
              setExpandedDayIds((current) => toggleAllDayPosts(feed, current))
            }
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
