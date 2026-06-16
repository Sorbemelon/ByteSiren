"use client";

import { ChevronDown, ExternalLink, HelpCircle } from "lucide-react";
import type { FeedItem, FeedItemSource, SymbolEvidence } from "../lib/types";

// ─── Label color maps ─────────────────────────────────────────────────────────

const DIRECTION_COLORS: Record<string, string> = {
  observed_up: "var(--up)",
  observed_down: "var(--down)",
  two_sided: "var(--two-sided)",
};

const DIRECTION_LABELS: Record<string, string> = {
  observed_up: "Observed Up",
  observed_down: "Observed Down",
  two_sided: "Two-sided",
};

const BRIEF_ACCENT: Record<string, string> = {
  cause_supported: "var(--cause-focused)",
  cause_likely: "var(--cause-likely)",
  context_only: "var(--context-backdrop)",
  none_found: "var(--none-found)",
  analysis_limited: "var(--claude-limited)",
  queued_for_analysis: "var(--status-moving)",
};

const SOURCE_CHIP_COLORS: Record<string, string> = {
  focused_catalyst: "var(--cause-focused)",
  likely_cause: "var(--cause-likely)",
  backdrop: "var(--context-backdrop)",
  price_check: "var(--status-strong)",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function briefAccentColor(item: FeedItem): string {
  const cs = item.brief.catalyst_status ?? item.brief.status;
  return BRIEF_ACCENT[cs] ?? "var(--text-muted)";
}

function fmtPct(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

// ─── SourceChip ───────────────────────────────────────────────────────────────

function SourceChip({ source }: { source: FeedItemSource }) {
  const color = SOURCE_CHIP_COLORS[source.used_for] ?? "var(--text-muted)";
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      title={source.title}
      aria-label={`${source.publisher}: ${source.title} (opens in new tab)`}
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-white/5 focus-visible:ring-2"
      style={{
        borderColor: color,
        color,
        textDecoration: "none",
      }}
    >
      {source.publisher}
      <ExternalLink size={10} aria-hidden />
    </a>
  );
}

// ─── ExpandedRow ─────────────────────────────────────────────────────────────

function ExpandedRow({ item }: { item: FeedItem }) {
  const { expanded_details, brief } = item;
  const hasSymbolEvidence = expanded_details.symbol_evidence.length > 0;

  return (
    <div
      className="mt-3 flex flex-col gap-4 pt-3"
      style={{ borderTop: "1px solid rgba(148,163,184,0.1)" }}
    >
      {/* Per-symbol evidence */}
      {hasSymbolEvidence && (
        <div>
          <p
            className="mb-2 text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            Per-symbol evidence
          </p>
          <div
            className="overflow-x-auto rounded-lg"
            style={{
              background: "rgba(7,10,18,0.5)",
              border: "1px solid rgba(148,163,184,0.08)",
            }}
          >
            <table className="w-full text-[12px]">
              <thead>
                <tr
                  style={{
                    color: "var(--text-muted)",
                    borderBottom: "1px solid rgba(148,163,184,0.1)",
                  }}
                >
                  {[
                    "Symbol",
                    "15m %",
                    "Price Z",
                    "Vol ×",
                    "Range ×",
                    "Score",
                  ].map((h) => (
                    <th key={h} className="py-2 px-3 text-left font-medium">
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
                      borderColor: "rgba(148,163,184,0.06)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <td
                      className="py-2 px-3 font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {row.symbol.replace("USDT", "")}
                    </td>
                    <td
                      className="py-2 px-3 tabular-nums"
                      style={{
                        color:
                          row.change_15m_pct >= 0 ? "var(--up)" : "var(--down)",
                      }}
                    >
                      {fmtPct(row.change_15m_pct)}
                    </td>
                    <td className="py-2 px-3 tabular-nums">
                      {row.price_z.toFixed(1)}
                    </td>
                    <td className="py-2 px-3 tabular-nums">
                      {row.volume_x.toFixed(1)}×
                    </td>
                    <td className="py-2 px-3 tabular-nums">
                      {row.range_x.toFixed(1)}×
                    </td>
                    <td
                      className="py-2 px-3 tabular-nums font-semibold"
                      style={{
                        color:
                          row.score >= 90
                            ? "var(--status-strong)"
                            : "var(--text-primary)",
                      }}
                    >
                      {row.score}
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
            compare current 15m candle to recent 24h median
          </p>
        </div>
      )}

      {/* Claude context */}
      {brief.status === "brief_ready" &&
        expanded_details.claude_context.summary && (
          <div>
            <p
              className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Claude context
            </p>
            <p
              className="text-[13px] leading-relaxed"
              style={
                {
                  color: "var(--text-secondary)",
                  maxWidth: "65ch",
                  textWrap: "pretty",
                } as React.CSSProperties
              }
            >
              {expanded_details.claude_context.summary}
            </p>
          </div>
        )}

      {/* All accepted sources */}
      {item.sources.length > 0 && (
        <div>
          <p
            className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            Sources
          </p>
          <div className="flex flex-wrap gap-2">
            {item.sources.map((s, i) => (
              <SourceChip key={i} source={s} />
            ))}
          </div>
        </div>
      )}

      {/* Caveats */}
      {expanded_details.caveats.length > 0 && (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {expanded_details.caveats.join(" ")}
        </p>
      )}
    </div>
  );
}

// ─── FeedRow ─────────────────────────────────────────────────────────────────

interface FeedRowProps {
  item: FeedItem;
  isSelected: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}

function FeedRow({ item, isSelected, isExpanded, onToggle }: FeedRowProps) {
  const dirColor = DIRECTION_COLORS[item.direction] ?? "var(--text-muted)";
  const accentColor = briefAccentColor(item);

  const visibleSources = item.sources.slice(0, 2);
  const overflowCount = item.sources.length - visibleSources.length;

  const scopeLabel = item.scope === "market_day" ? "Market Day" : "15m signal";

  return (
    <article
      className="rounded-2xl border transition-colors"
      style={{
        background: "var(--bg-row)",
        border: isSelected
          ? `1px solid var(--accent-selected-border)`
          : `1px solid var(--border-row)`,
        boxShadow: isSelected ? "var(--accent-selected-shadow)" : "none",
      }}
    >
      <button
        className="w-full cursor-pointer rounded-2xl p-3 text-left focus-visible:outline-offset-0"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-label={`${scopeLabel} on ${item.display_date}, ${DIRECTION_LABELS[item.direction] ?? item.direction}, ${item.brief.label}. ${isExpanded ? "Click to collapse" : "Click to expand"}`}
      >
        <div className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
          {/* Evidence column */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1.5">
              <span
                className="inline-block rounded border px-1.5 py-0.5 text-[11px] font-semibold"
                style={{
                  borderColor: "rgba(148,163,184,0.25)",
                  color: "var(--text-secondary)",
                  background: "rgba(148,163,184,0.07)",
                }}
              >
                {scopeLabel}
              </span>
              <span
                className="inline-block rounded border px-1.5 py-0.5 text-[11px] font-medium"
                style={{
                  borderColor: dirColor + "55",
                  color: dirColor,
                  background: dirColor + "12",
                }}
              >
                {DIRECTION_LABELS[item.direction] ?? item.direction}
              </span>
            </div>

            <p
              className="text-[12px] font-medium tabular-nums"
              style={{ color: "var(--text-secondary)" }}
            >
              {item.evidence.breadth_label}
              <span style={{ color: "var(--text-muted)" }}> · </span>
              <span style={{ color: "var(--status-strong)" }}>
                {item.evidence.severity_label} {item.evidence.severity_score}
              </span>
            </p>

            <p
              className="text-[11px] tabular-nums"
              style={{ color: "var(--text-muted)" }}
            >
              {item.display_date}
            </p>
          </div>

          {/* Brief column */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                aria-hidden
                style={{ background: accentColor }}
              />
              <span
                className="text-[12px] font-semibold"
                style={{ color: accentColor }}
              >
                {item.brief.label}
              </span>
            </div>

            {item.brief.status === "brief_ready" && item.brief.summary && (
              <p
                className="text-[12px] leading-snug"
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
                {item.brief.summary}
              </p>
            )}

            {item.brief.status === "analysis_limited" && (
              <p
                className="text-[12px] leading-snug"
                style={{ color: "var(--text-secondary)" }}
              >
                Claude analysis is limited in this free public project.
                <br />
                The context will be shown when analysis is available.
              </p>
            )}

            {item.brief.status === "queued_for_analysis" && (
              <p
                className="text-[12px]"
                style={{ color: "var(--text-secondary)" }}
              >
                Waiting for Claude analysis. This detection is queued for
                date-matched web context.
              </p>
            )}

            {item.brief.status === "none_found" && (
              <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                No clear public cause found from trusted sources for this
                detection.
              </p>
            )}

            {item.brief.status === "brief_ready" &&
              (item.brief.confidence || item.brief.price_context_check) && (
                <p
                  className="text-[11px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {item.brief.confidence && (
                    <span style={{ textTransform: "capitalize" }}>
                      {item.brief.confidence} confidence
                    </span>
                  )}
                  {item.brief.price_context_check &&
                    item.brief.price_context_check !== "unknown" && (
                      <>
                        <span> · </span>
                        <span>
                          Price:{" "}
                          {item.brief.price_context_check.replace(/_/g, " ")}
                        </span>
                      </>
                    )}
                </p>
              )}
          </div>

          {/* Sources column */}
          <div className="flex flex-row flex-wrap items-start gap-1.5 sm:flex-col">
            {visibleSources.map((s, i) => (
              <SourceChip key={i} source={s} />
            ))}
            {overflowCount > 0 && (
              <span
                className="rounded-full border px-2 py-0.5 text-[11px] font-medium"
                style={{
                  borderColor: "var(--border-row)",
                  color: "var(--text-muted)",
                }}
              >
                +{overflowCount}
              </span>
            )}
          </div>
        </div>

        {/* Expand toggle hint */}
        <div className="mt-2 flex justify-center">
          <ChevronDown
            size={14}
            aria-hidden
            style={{
              color: "var(--text-muted)",
              transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 200ms ease-out",
            }}
          />
        </div>
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-3 pb-4">
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
}

export default function IntelligenceFeed({
  items,
  selectedId,
  expandedId,
  onToggle,
  loading,
}: IntelligenceFeedProps) {
  return (
    <section
      aria-label="Intelligence Feed"
      className="flex flex-col rounded-2xl p-4"
      style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--border-panel)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
      }}
    >
      {/* Panel header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2
            className="text-[16px] font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Intelligence Feed
          </h2>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Past 30 days · newest first
          </p>
          <p
            className="mt-0.5 text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            Labels describe observed market movement, not trading advice.
          </p>
        </div>
        <button
          className="flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors hover:bg-white/5"
          style={{
            borderColor: "var(--border-row)",
            color: "var(--text-muted)",
          }}
          onClick={() => {
            document.getElementById("how-to-read")?.setAttribute("open", "");
            document
              .getElementById("how-to-read")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          aria-label="What do these labels mean? Scroll to glossary"
        >
          <HelpCircle size={12} aria-hidden />
          What do these labels mean?
        </button>
      </div>

      {/* Column headers */}
      <div
        className="mb-2 grid grid-cols-[1fr_1.5fr_auto] gap-2 pb-2 text-[11px] font-semibold uppercase tracking-wider"
        style={{
          color: "var(--text-muted)",
          borderBottom: "1px solid rgba(148,163,184,0.1)",
        }}
      >
        <span>Evidence</span>
        <span>Claude Brief</span>
        <span>Sources</span>
      </div>

      {/* Feed rows */}
      <div
        className="flex flex-col gap-2 overflow-y-auto pr-0.5"
        style={{ maxHeight: "calc(100% - 120px)", minHeight: 200 }}
      >
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
              background: "rgba(148,163,184,0.04)",
              border: "1px dashed rgba(148,163,184,0.15)",
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
            <FeedRow
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
