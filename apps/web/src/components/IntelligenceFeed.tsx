"use client";

import Image from "next/image";
import {
  ArrowLeftRight,
  BadgeCheck,
  Clock,
  ExternalLink,
  HelpCircle,
  Info,
  Lock,
  type LucideIcon,
  SearchCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type { FeedItem, FeedItemSource, SymbolEvidence } from "../lib/types";
import { AuroraText } from "./ui/aurora-text";

// ─── Label maps ────────────────────────────────────────────────────────────────

const DIRECTION_META: Record<
  string,
  { label: string; color: string; Icon: LucideIcon }
> = {
  observed_up: { label: "Observed Up", color: "var(--up)", Icon: TrendingUp },
  observed_down: {
    label: "Observed Down",
    color: "var(--down)",
    Icon: TrendingDown,
  },
  two_sided: {
    label: "Two-sided",
    color: "var(--two-sided)",
    Icon: ArrowLeftRight,
  },
};

// Keyed by catalyst_status ?? status.
const STATUS_ICON: Record<string, LucideIcon> = {
  cause_supported: BadgeCheck,
  cause_likely: SearchCheck,
  context_only: Info,
  none_found: HelpCircle,
  analysis_limited: Lock,
  queued_for_analysis: Clock,
};

const BRIEF_ACCENT: Record<string, string> = {
  cause_supported: "var(--cause-focused)",
  cause_likely: "var(--cause-likely)",
  context_only: "var(--context-backdrop)",
  none_found: "var(--none-found)",
  analysis_limited: "var(--claude-limited)",
  queued_for_analysis: "var(--status-moving)",
};

const SOURCE_CHIP_STYLES: Record<
  FeedItemSource["used_for"],
  { border: string; background: string; color: string }
> = {
  focused_catalyst: {
    border: "rgba(30, 64, 175, 0.46)",
    background: "rgba(30, 64, 175, 0.16)",
    color: "var(--source-focused-text)",
  },
  likely_cause: {
    border: "rgba(14, 165, 233, 0.34)",
    background: "rgba(14, 165, 233, 0.1)",
    color: "var(--source-likely-text)",
  },
  backdrop: {
    border: "rgba(148, 163, 184, 0.3)",
    background: "rgba(148, 163, 184, 0.08)",
    color: "var(--source-backdrop-text)",
  },
  price_check: {
    border: "rgba(245, 158, 11, 0.32)",
    background: "rgba(245, 158, 11, 0.07)",
    color: "var(--source-price-text)",
  },
};

const CHIP_TONES = {
  neutral: {
    background: "var(--chip-bg)",
    border: "1px solid var(--chip-border)",
    color: "var(--chip-text)",
  },
  market: {
    background: "var(--chip-bg)",
    border: "1px solid transparent",
    color: "var(--market-chip-text)",
  },
  marketWide: {
    background: "rgba(245, 158, 11, 0.1)",
    border: "1px solid transparent",
    color:
      "color-mix(in srgb, var(--market-chip-text) 70%, var(--brand-orange) 30%)",
  },
  up: {
    background: "rgba(16, 185, 129, 0.1)",
    border: "1px solid rgba(16, 185, 129, 0.28)",
    color: "var(--up)",
  },
  down: {
    background: "rgba(244, 63, 94, 0.1)",
    border: "1px solid rgba(244, 63, 94, 0.3)",
    color: "var(--down)",
  },
  twoSided: {
    background: "rgba(167, 139, 250, 0.12)",
    border: "1px solid rgba(167, 139, 250, 0.32)",
    color: "var(--two-sided)",
  },
  impact: {
    background: "rgba(245, 158, 11, 0.1)",
    border: "1px solid transparent",
    color: "var(--text-primary)",
  },
  info: {
    background: "rgba(59, 130, 246, 0.1)",
    border: "1px solid rgba(59, 130, 246, 0.28)",
    color: "var(--status-moving)",
  },
} satisfies Record<string, CSSProperties>;

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
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function briefKind(item: FeedItem): string {
  return item.brief.catalyst_status ?? item.brief.status;
}

function briefAccentColor(item: FeedItem): string {
  return BRIEF_ACCENT[briefKind(item)] ?? "var(--text-muted)";
}

function fmtPct(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function safeVal(v: number | null | undefined, fixed = 1): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toFixed(fixed);
}

function breadthLabel(count: number): string {
  if (count <= 0) return "Signals: —";
  return `Signals: ${Math.min(count, 5)} of 5 symbols`;
}

function formatEventDateTimeParts(item: FeedItem): {
  label: string;
  date: string;
  time: string;
} {
  const d = new Date(item.detected_at);
  const datePart = `${UTC_MONTHS[d.getUTCMonth()] ?? "UTC"} ${d.getUTCDate()}`;
  const timePart = `${String(d.getUTCHours()).padStart(2, "0")}:${String(
    d.getUTCMinutes(),
  ).padStart(2, "0")}`;
  if (item.scope === "market_day") {
    const display = item.display_date?.trim().replace(/\s+/g, " ");
    if (display && /\d{1,2}:\d{2}/.test(display)) {
      const [date, ...timeParts] = display.split(",");
      const time = timeParts.join(",").trim();

      if (date.trim() && time) {
        return { label: display, date: date.trim(), time };
      }

      return { label: display, date: display, time: "" };
    }
  }

  return {
    label: `${datePart}, ${timePart} UTC`,
    date: datePart,
    time: `${timePart} UTC`,
  };
}

function formatHeaderDateTime(iso: string | null | undefined): {
  date: string;
  time: string;
} | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const date = `${UTC_MONTHS[d.getUTCMonth()] ?? "UTC"} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  const time = `${String(d.getUTCHours()).padStart(2, "0")}:${String(
    d.getUTCMinutes(),
  ).padStart(2, "0")} UTC`;

  return { date, time };
}

function formatAge(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;

  const minutes = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function hasDistinctContextDetails(item: FeedItem): boolean {
  const summary = normalizeText(item.brief.summary);
  const details = normalizeText(item.expanded_details.claude_context.summary);
  if (!details) return false;
  if (!summary) return true;
  if (details === summary) return false;
  return details.length > summary.length + 40;
}

// ─── Small primitives ─────────────────────────────────────────────────────────

function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: keyof typeof CHIP_TONES;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium"
      style={CHIP_TONES[tone]}
    >
      {children}
    </span>
  );
}

function ColLabel({ children }: { children: ReactNode }) {
  return (
    <p
      className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{ color: "var(--text-muted)" }}
    >
      {children}
    </p>
  );
}

function SourceChip({ source }: { source: FeedItemSource }) {
  const style =
    SOURCE_CHIP_STYLES[source.used_for] ?? SOURCE_CHIP_STYLES.backdrop;
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      title={source.title}
      aria-label={`${source.publisher}: ${source.title} (opens in new tab)`}
      className="inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-medium transition-colors hover:bg-white/5 hover:brightness-110 focus-visible:ring-2"
      style={{
        background: style.background,
        borderColor: style.border,
        color: style.color,
        textDecoration: "none",
      }}
    >
      {source.publisher}
      <ExternalLink size={9} aria-hidden />
    </a>
  );
}

// ─── Public Context column ────────────────────────────────────────────────────

function LatestDetectedEvent({
  latestEventAt,
}: {
  latestEventAt?: string | null;
}) {
  const formatted = formatHeaderDateTime(latestEventAt);
  const age = formatAge(latestEventAt);

  return (
    <span
      className="inline-flex flex-wrap items-baseline gap-x-1.5 text-[11px] font-medium tabular-nums sm:text-[12px]"
      aria-label="Latest detected feed event timing"
      style={{ color: "var(--text-secondary)" }}
    >
      {formatted ? (
        <time
          dateTime={latestEventAt ?? undefined}
          className="inline-flex flex-wrap items-baseline gap-x-1.5"
        >
          <span style={{ color: "var(--text-muted)" }}>
            Latest detected event:
          </span>
          <span>{formatted.date}</span>
          <span>{formatted.time}</span>
        </time>
      ) : (
        <span>
          <span style={{ color: "var(--text-muted)" }}>
            Latest detected event:
          </span>{" "}
          No event yet
        </span>
      )}
      {age && <span style={{ color: "var(--text-muted)" }}>{age}</span>}
    </span>
  );
}

interface PublicContextProps {
  item: FeedItem;
  isExpanded: boolean;
  accentColor: string;
}

function PublicContext({ item, isExpanded, accentColor }: PublicContextProps) {
  const { brief } = item;
  const Icon = STATUS_ICON[briefKind(item)] ?? Info;
  const showSummary =
    (brief.status === "brief_ready" || brief.status === "context_only") &&
    brief.summary;

  return (
    <div className="space-y-1.5">
      {/* Status line: icon and label carry the approved context state. */}
      <div className="flex items-center gap-1.5">
        <Icon size={14} color={accentColor} aria-hidden />
        <span
          className="text-[12.5px] font-semibold"
          style={{ color: accentColor }}
        >
          {brief.label}
        </span>
      </div>

      {showSummary && (
        <p
          className="text-[12.5px] leading-snug"
          style={
            {
              color: "var(--text-secondary)",
              display: "-webkit-box",
              WebkitLineClamp: isExpanded ? "unset" : 2,
              WebkitBoxOrient: "vertical",
              overflow: isExpanded ? "visible" : "hidden",
            } as React.CSSProperties
          }
        >
          {brief.summary}
        </p>
      )}

      {/* Claude Limited: blurred ghost block behind the approved message only */}
      {brief.status === "analysis_limited" && (
        <div
          className="relative overflow-hidden rounded-lg p-2.5"
          style={{
            background: "rgba(139, 92, 246, 0.08)",
            border: "1px solid rgba(139, 92, 246, 0.25)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
        >
          <div
            aria-hidden
            className="absolute inset-0 space-y-2 p-2.5"
            style={{ filter: "blur(5px)", opacity: 0.5 }}
          >
            <div
              className="h-2 rounded"
              style={{ width: "92%", background: "var(--chip-bg)" }}
            />
            <div
              className="h-2 rounded"
              style={{ width: "78%", background: "var(--chip-bg)" }}
            />
            <div
              className="h-2 rounded"
              style={{ width: "64%", background: "var(--chip-bg)" }}
            />
          </div>
          <p
            className="relative text-[12px] leading-snug"
            style={{ color: "var(--text-secondary)" }}
          >
            Claude analysis is limited in this free public project. The context
            will be shown when analysis is available.
          </p>
        </div>
      )}

      {brief.status === "queued_for_analysis" && (
        <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
          Waiting for Claude analysis. This detection is queued for date-matched
          web context.
        </p>
      )}

      {brief.status === "none_found" && (
        <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
          No clear public cause found from trusted sources for this detection.
        </p>
      )}

      {brief.status === "brief_ready" &&
        (brief.confidence || brief.price_context_check) && (
          <p
            className="text-[11px]"
            style={{
              color:
                "color-mix(in srgb, var(--source-price-text) 48%, var(--text-muted))",
            }}
          >
            {brief.confidence && (
              <span style={{ textTransform: "capitalize" }}>
                {brief.confidence} confidence
              </span>
            )}
            {brief.price_context_check &&
              brief.price_context_check !== "unknown" && (
                <>
                  <span> · </span>
                  <span>
                    Price: {brief.price_context_check.replace(/_/g, " ")}
                  </span>
                </>
              )}
          </p>
        )}
    </div>
  );
}

// ─── Expanded detail ──────────────────────────────────────────────────────────

function ExpandedRow({ item }: { item: FeedItem }) {
  const { expanded_details, brief } = item;
  const hasSymbolEvidence = expanded_details.symbol_evidence.length > 0;
  const showContextDetails =
    (brief.status === "brief_ready" || brief.status === "context_only") &&
    hasDistinctContextDetails(item);

  return (
    <div
      className="mt-3 flex flex-col gap-4 pt-3"
      style={{ borderTop: "1px solid var(--border-row)" }}
    >
      {hasSymbolEvidence && (
        <div>
          <ColLabel>Per-symbol evidence</ColLabel>
          <div
            className="overflow-x-auto rounded-lg"
            style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border-row)",
            }}
          >
            <table className="w-full text-[12px]">
              <thead>
                <tr
                  style={{
                    color: "var(--text-muted)",
                    borderBottom: "1px solid var(--border-row)",
                  }}
                >
                  {[
                    "Symbol",
                    "15m %",
                    "Price Z",
                    "Vol ×",
                    "Range ×",
                    "Impact",
                  ].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expanded_details.symbol_evidence.map((row: SymbolEvidence) => (
                  <tr
                    key={row.symbol}
                    className="border-b last:border-0"
                    style={{
                      borderColor: "var(--border-row)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <td
                      className="px-3 py-2 font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {row.symbol.replace("USDT", "")}
                    </td>
                    <td
                      className="px-3 py-2 tabular-nums"
                      style={{
                        color:
                          row.change_15m_pct == null
                            ? "var(--text-muted)"
                            : row.change_15m_pct >= 0
                              ? "var(--up)"
                              : "var(--down)",
                      }}
                    >
                      {row.change_15m_pct == null
                        ? "—"
                        : fmtPct(row.change_15m_pct)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {safeVal(row.price_z)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {safeVal(row.volume_x)}×
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {safeVal(row.range_x)}×
                    </td>
                    <td
                      className="px-3 py-2 font-semibold tabular-nums"
                      style={{
                        color:
                          row.score != null && row.score >= 90
                            ? "var(--status-strong)"
                            : "var(--text-primary)",
                      }}
                    >
                      {safeVal(row.score, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p
            className="mt-1.5 text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            Price Z: standard deviations vs 24h baseline · Vol × and Range ×
            compare the current 15m candle to the recent 24h median
          </p>
        </div>
      )}

      {showContextDetails && (
        <div>
          <ColLabel>Context Details</ColLabel>
          <p
            className="text-[13px] leading-relaxed"
            style={
              {
                color: "var(--text-secondary)",
                maxWidth: "70ch",
                textWrap: "pretty",
              } as React.CSSProperties
            }
          >
            {expanded_details.claude_context.summary}
          </p>
        </div>
      )}

      {item.sources.length > 0 && (
        <div>
          <ColLabel>Sources</ColLabel>
          <div className="flex flex-wrap gap-2">
            {item.sources.map((s, i) => (
              <SourceChip key={i} source={s} />
            ))}
          </div>
        </div>
      )}

      {item.tags.length > 0 && (
        <div>
          <ColLabel>Tags</ColLabel>
          <div className="flex flex-wrap gap-1.5">
            {item.tags.map((t) => (
              <Chip key={t}>{t.replace(/_/g, " ")}</Chip>
            ))}
          </div>
        </div>
      )}

      {expanded_details.caveats.length > 0 && (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {expanded_details.caveats.join(" ")}
        </p>
      )}
    </div>
  );
}

// ─── Feed card ────────────────────────────────────────────────────────────────

interface FeedCardProps {
  item: FeedItem;
  isSelected: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}

function FeedCard({ item, isSelected, isExpanded, onToggle }: FeedCardProps) {
  const accentColor = briefAccentColor(item);
  const dir = DIRECTION_META[item.direction] ?? {
    label: item.direction,
    color: "var(--text-muted)",
    Icon: ArrowLeftRight,
  };
  const DirIcon = dir.Icon;

  const visibleSources = item.sources.slice(0, 2);
  const overflowCount = item.sources.length - visibleSources.length;
  const scopeWord =
    item.scope === "market_day" ? "Market Day" : "Market-wide event";
  const avg = item.evidence.avg_15m_change_pct;
  const hasAvg = avg != null && !Number.isNaN(avg);
  const eventTime = formatEventDateTimeParts(item);

  return (
    <article
      className="feed-row relative rounded-2xl"
      data-selected={isSelected}
    >
      <div className="relative">
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-label={`${scopeWord} on ${eventTime.label}, ${dir.label}, ${item.brief.label}. ${isExpanded ? "Collapse details" : "Expand details"}`}
          onClick={onToggle}
          className="absolute inset-0 cursor-pointer rounded-2xl"
          style={{
            background: "transparent",
            outlineOffset: "-2px",
            WebkitTapHighlightColor: "transparent",
          }}
        />

        <div className="pointer-events-none p-3.5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <p
                className="mr-1 flex flex-wrap items-baseline gap-x-1.5 font-semibold tabular-nums"
                style={{ color: "var(--text-primary)" }}
              >
                <span className="text-[14px]">{eventTime.date},</span>
                {eventTime.time && (
                  <span
                    className="text-[12.5px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {eventTime.time}
                  </span>
                )}
              </p>
              <Chip
                tone={item.scope === "market_day" ? "market" : "marketWide"}
              >
                {scopeWord}
              </Chip>
            </div>
            <Chip tone="impact">
              Impact Score: {item.evidence.severity_score}
            </Chip>
          </div>

          <div className="feed-card-grid">
            <div>
              <Chip
                tone={
                  item.direction === "observed_up"
                    ? "up"
                    : item.direction === "observed_down"
                      ? "down"
                      : "twoSided"
                }
              >
                <DirIcon size={12} aria-hidden />
                {dir.label}
              </Chip>
              <p
                className="mt-1.5 text-[12.5px] font-semibold"
                style={{ color: "var(--text-secondary)" }}
              >
                {breadthLabel(item.symbols.length)}
              </p>
              <p
                className="mt-1 text-[11px] tabular-nums"
                style={{ color: "var(--text-primary)" }}
              >
                Avg 15m{" "}
                {hasAvg ? (
                  <span
                    style={{
                      color: avg >= 0 ? "var(--up)" : "var(--down)",
                      fontWeight: 600,
                    }}
                  >
                    {fmtPct(avg)}
                  </span>
                ) : (
                  <span>—</span>
                )}
              </p>
              <p
                className="mt-0.5 text-[11px] tabular-nums"
                style={{ color: "var(--text-primary)" }}
              >
                Peak {item.evidence.peak_symbol.replace("USDT", "")}
              </p>
            </div>

            <div>
              <PublicContext
                item={item}
                isExpanded={isExpanded}
                accentColor={accentColor}
              />
            </div>

            <div className="pointer-events-auto relative z-[1] flex self-stretch flex-col">
              <div>
                {item.sources.length > 0 ? (
                  <div className="flex flex-row flex-wrap items-start gap-1.5 sm:flex-col">
                    {visibleSources.map((s, i) => (
                      <SourceChip key={i} source={s} />
                    ))}
                    {overflowCount > 0 && (
                      <button
                        type="button"
                        onClick={onToggle}
                        aria-label={`Show ${overflowCount} more accepted source${overflowCount === 1 ? "" : "s"}`}
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
                    —
                  </span>
                )}
              </div>

              <div className="mt-auto flex justify-end pt-2 pr-8 sm:pr-0">
                <button
                  type="button"
                  onClick={onToggle}
                  aria-expanded={isExpanded}
                  className="rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-colors hover:bg-white/5 focus-visible:ring-2"
                  style={{
                    color: "var(--text-muted)",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  {isExpanded ? "Hide" : "See more"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="feed-expand px-3.5 pb-4">
          <ExpandedRow item={item} />
        </div>
      )}
    </article>
  );
}

// ─── IntelligenceFeed ─────────────────────────────────────────────────────────

interface IntelligenceFeedProps {
  items: FeedItem[];
  selectedId: string | null;
  expandedId: string | null;
  onToggle: (id: string) => void;
  loading: boolean;
  latestEventAt?: string | null;
}

export default function IntelligenceFeed({
  items,
  selectedId,
  expandedId,
  onToggle,
  loading,
  latestEventAt,
}: IntelligenceFeedProps) {
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
            <LatestDetectedEvent latestEventAt={latestEventAt} />
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
                Claude reviews detected evidence, uses Web Search to find
                relevant public sources, and summarizes the context with
                citations.
              </span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-start justify-between gap-2 sm:justify-end">
          <button
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors hover:bg-white/5"
            style={{
              borderColor: "var(--border-row)",
              color: "var(--text-muted)",
            }}
            onClick={() => {
              const el = document.getElementById("how-to-read");
              if (el) {
                el.setAttribute("open", "");
                el.scrollIntoView({ behavior: "smooth", block: "start" });
              }
            }}
            aria-label="What do these labels mean? Scroll to glossary"
            title="What do these labels mean?"
          >
            <HelpCircle size={20} aria-hidden />
          </button>
        </div>
      </div>

      <div className="flex min-h-50 flex-1 flex-col gap-3 overflow-y-auto pr-0.5">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Loading intelligence feed…
            </p>
          </div>
        )}

        {!loading && items.length === 0 && (
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
              No market-wide incident detected in the past 30 days.
            </p>
            <p
              className="mt-1.5 text-[12px]"
              style={{ color: "var(--text-muted)" }}
            >
              ByteSiren will add events when the detector finds a qualifying
              market-wide move.
            </p>
          </div>
        )}

        {!loading &&
          items.map((item) => (
            <FeedCard
              key={item.incident_id}
              item={item}
              isSelected={item.incident_id === selectedId}
              isExpanded={item.incident_id === expandedId}
              onToggle={() => onToggle(item.incident_id)}
            />
          ))}
      </div>
    </section>
  );
}
