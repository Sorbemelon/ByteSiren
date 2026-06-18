"use client";

import {
  ArrowLeftRight,
  BadgeCheck,
  ChevronDown,
  Clock,
  ExternalLink,
  HelpCircle,
  Info,
  Lock,
  SearchCheck,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import type { ViewMetrics } from "../lib/types";

interface AccordionProps {
  id?: string;
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

type Tone =
  | "violet"
  | "emerald"
  | "teal"
  | "rose"
  | "amber"
  | "slate"
  | "blue"
  | "cyan"
  | "deepBlue"
  | "sky"
  | "blueGray";

const TONE_COLOR: Record<Tone, string> = {
  violet: "var(--accent-primary)",
  emerald: "var(--cause-focused)",
  teal: "var(--cause-likely)",
  rose: "var(--down)",
  amber: "var(--status-strong)",
  slate: "var(--text-muted)",
  blue: "var(--status-moving)",
  cyan: "var(--source-chip-text)",
  deepBlue: "var(--source-focused-text)",
  sky: "var(--source-likely-text)",
  blueGray: "var(--source-backdrop-text)",
};

function StatusTextLabel({
  children,
  color,
  Icon,
}: {
  children: ReactNode;
  color: string;
  Icon: LucideIcon;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 font-semibold"
      style={{ color }}
    >
      <Icon size={13} aria-hidden className="shrink-0" />
      {children}
    </span>
  );
}

function Accordion({ id, title, children, defaultOpen }: AccordionProps) {
  return (
    <details
      id={id}
      open={defaultOpen}
      className="group rounded-xl border"
      style={{
        borderColor: "var(--border-panel)",
        background: "var(--bg-panel)",
      }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
        <h2
          className="m-0 text-[16px] font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h2>
        <ChevronDown
          size={15}
          aria-hidden
          className="shrink-0 transition-transform duration-200 group-open:rotate-180"
          style={{ color: "var(--text-muted)" }}
        />
      </summary>
      <div
        className="px-4 pb-4 pt-1"
        style={{
          color: "var(--text-secondary)",
          fontSize: "13px",
          lineHeight: "1.65",
        }}
      >
        {children}
      </div>
    </details>
  );
}

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      className="rounded-xl border px-4 py-4"
      style={{
        borderColor: "var(--border-panel)",
        background: "var(--bg-panel)",
      }}
    >
      <h2
        className="text-[16px] font-semibold"
        style={{ color: "var(--text-primary)" }}
      >
        {title}
      </h2>
      <div
        className="mt-2 space-y-2 text-[13px] leading-relaxed"
        style={{ color: "var(--text-secondary)" }}
      >
        {children}
      </div>
    </section>
  );
}

function fmtCount(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US");
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value?: number | null;
}) {
  return (
    <div
      className="rounded-lg border px-3 py-3"
      style={{
        borderColor: "var(--border-row)",
        background: "var(--bg-row)",
      }}
    >
      <p
        className="text-[11px] font-medium uppercase tracking-wider"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </p>
      <p
        className="mt-1 text-[22px] font-semibold tabular-nums"
        style={{ color: "var(--text-primary)" }}
      >
        {fmtCount(value)}
      </p>
    </div>
  );
}

function DefinitionGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-2 sm:grid-cols-2">{children}</div>;
}

function DefinitionCard({
  term,
  tone,
  Icon,
  children,
}: {
  term: ReactNode;
  tone?: Tone;
  Icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-lg border p-3"
      style={{
        background: "var(--bg-row)",
        borderColor: "var(--border-row)",
      }}
    >
      <dt
        className="flex items-center gap-2 text-[12px] font-semibold"
        style={{ color: "var(--text-primary)" }}
      >
        {Icon ? (
          <Icon
            size={13}
            aria-hidden
            className="shrink-0"
            style={{ color: tone ? TONE_COLOR[tone] : "var(--text-muted)" }}
          />
        ) : tone ? (
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: TONE_COLOR[tone] }}
            aria-hidden
          />
        ) : null}
        {term}
      </dt>
      <dd
        className="mt-1 text-[12px]"
        style={{ color: "var(--text-secondary)" }}
      >
        {children}
      </dd>
    </div>
  );
}

function MarketLabelChip({
  children,
  amber = false,
}: {
  children: ReactNode;
  amber?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium"
      style={{
        background: amber ? "rgba(245, 158, 11, 0.1)" : "var(--chip-bg)",
        border: "1px solid transparent",
        color: amber
          ? "color-mix(in srgb, var(--market-chip-text) 70%, var(--brand-orange) 30%)"
          : "var(--market-chip-text)",
      }}
    >
      {children}
    </span>
  );
}

function DirectionLabelChip({
  children,
  tone,
  Icon,
}: {
  children: ReactNode;
  tone: "up" | "down" | "twoSided";
  Icon: LucideIcon;
}) {
  const styles = {
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
  }[tone];

  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium"
      style={styles}
    >
      <Icon size={12} aria-hidden />
      {children}
    </span>
  );
}

function ImpactScoreChip() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium"
      style={{
        background: "rgba(245, 158, 11, 0.1)",
        border: "1px solid transparent",
        color: "var(--text-primary)",
      }}
    >
      Impact Score
    </span>
  );
}

function SourceExampleChip({
  children,
  role,
}: {
  children: ReactNode;
  role: "focused" | "likely" | "backdrop" | "price";
}) {
  const styles = {
    focused: {
      borderColor: "rgba(30, 64, 175, 0.46)",
      background: "rgba(30, 64, 175, 0.16)",
      color: "var(--source-focused-text)",
    },
    likely: {
      borderColor: "rgba(14, 165, 233, 0.34)",
      background: "rgba(14, 165, 233, 0.1)",
      color: "var(--source-likely-text)",
    },
    backdrop: {
      borderColor: "rgba(148, 163, 184, 0.3)",
      background: "rgba(148, 163, 184, 0.08)",
      color: "var(--source-backdrop-text)",
    },
    price: {
      borderColor: "rgba(245, 158, 11, 0.32)",
      background: "rgba(245, 158, 11, 0.07)",
      color: "var(--source-price-text)",
    },
  }[role];

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium"
      style={styles}
    >
      {children}
    </span>
  );
}

function TagExampleChip({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium"
      style={{
        background: "var(--chip-bg)",
        border: "1px solid var(--chip-border)",
        color: "var(--chip-text)",
      }}
    >
      {children}
    </span>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <p
      className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider first:mt-0"
      style={{ color: "var(--text-muted)" }}
    >
      {children}
    </p>
  );
}

export default function BottomAccordions({
  viewMetrics,
}: {
  viewMetrics: ViewMetrics | null;
}) {
  return (
    <section
      aria-label="Information and disclaimer"
      className="flex flex-col gap-2"
    >
      <div
        className="rounded-xl px-4 py-3 text-[13px] leading-relaxed"
        style={{
          color: "var(--text-secondary)",
          background: "var(--bg-row)",
          border: "1px solid var(--border-row)",
        }}
      >
        <h2
          className="mb-2 text-[16px] font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          What is ByteSiren
        </h2>
        <p style={{ textIndent: "1.25rem" }}>
          ByteSiren is a read-only AI crypto market intelligence dashboard and
          portfolio project. It watches BTCUSDT, ETHUSDT, BNBUSDT, SOLUSDT, and
          XRPUSDT using Binance public market data, keeps the chart focused on
          the selected symbol, and keeps the Intelligence Feed focused on broad
          market events across the monitored set.
        </p>
        <p className="mt-2" style={{ textIndent: "1.25rem" }}>
          The backend stores recent 15-minute candle data, compares each move
          against a recent baseline, and only promotes events when the movement
          is broad enough across the monitored symbols. Claude reviews the
          detected evidence, uses Claude Web Search to find date-relevant public
          sources, and summarizes the public context with accepted citations.
        </p>
        <p className="mt-2" style={{ textIndent: "1.25rem" }}>
          ByteSiren is designed for market awareness and engineering
          demonstration, not financial advice or automated trading.
        </p>
      </div>

      <Accordion id="how-to-read" title="How to read ByteSiren">
        <p>
          ByteSiren detects unusual market-wide movement across BTCUSDT,
          ETHUSDT, BNBUSDT, SOLUSDT, and XRPUSDT.
        </p>
        <p className="mt-2">
          The chart symbol tabs and chart interval tabs only change the chart.
          The Intelligence Feed shows all detected market events from the past
          30 days.
        </p>

        <GroupLabel>Card sections</GroupLabel>
        <DefinitionGrid>
          <DefinitionCard term="Evidence">
            The left side of a feed card shows the detected event facts:
            date/time, event type, observed movement direction, how many symbols
            signaled, average 15-minute movement, peak symbol, and Impact Score.
          </DefinitionCard>
          <DefinitionCard term="Public Context">
            The middle section shows Claude&apos;s public-context label and
            short summary. It separates source-backed causes from broader market
            backdrop, and may show confidence plus a price-context check when a
            brief is ready.
          </DefinitionCard>
          <DefinitionCard term="Sources" tone="cyan" Icon={ExternalLink}>
            Accepted article links that open the exact source URL in a new tab.
          </DefinitionCard>
          <DefinitionCard term="Context Details">
            The expanded row can show the per-symbol evidence table, a longer
            public-context explanation, tags, caveats, and the full accepted
            source list. It is shown only when it adds detail beyond the
            collapsed summary.
          </DefinitionCard>
        </DefinitionGrid>
      </Accordion>

      <Accordion title="What the labels mean">
        <GroupLabel>Public Context status</GroupLabel>
        <DefinitionGrid>
          <DefinitionCard
            term={
              <StatusTextLabel color="var(--cause-focused)" Icon={BadgeCheck}>
                Focused Cause
              </StatusTextLabel>
            }
          >
            A specific public catalyst was found and source-backed.
          </DefinitionCard>
          <DefinitionCard
            term={
              <StatusTextLabel color="var(--cause-likely)" Icon={SearchCheck}>
                Likely Cause
              </StatusTextLabel>
            }
          >
            Public sources point to a probable driver, with less certainty than
            a Focused Cause.
          </DefinitionCard>
          <DefinitionCard
            term={
              <StatusTextLabel color="var(--context-backdrop)" Icon={Info}>
                Market Backdrop
              </StatusTextLabel>
            }
          >
            Sources describe the day&apos;s conditions, but no direct cause was
            found for the detected move.
          </DefinitionCard>
          <DefinitionCard
            term={
              <StatusTextLabel color="var(--none-found)" Icon={HelpCircle}>
                No Clear Cause
              </StatusTextLabel>
            }
          >
            No reliable public explanation was found for the detection.
          </DefinitionCard>
          <DefinitionCard
            term={
              <StatusTextLabel color="var(--claude-limited)" Icon={Lock}>
                Claude Limited
              </StatusTextLabel>
            }
          >
            Public context is hidden by the free-project analysis limit until
            analysis is available.
          </DefinitionCard>
          <DefinitionCard
            term={
              <StatusTextLabel color="var(--status-moving)" Icon={Clock}>
                Waiting for Claude
              </StatusTextLabel>
            }
          >
            The detection is queued for date-matched public web context.
          </DefinitionCard>
          <DefinitionCard
            term={
              <StatusTextLabel color="var(--text-primary)" Icon={Clock}>
                Data Delay
              </StatusTextLabel>
            }
          >
            Latest market data may be delayed or incomplete.
          </DefinitionCard>
        </DefinitionGrid>

        <GroupLabel>Event labels</GroupLabel>
        <DefinitionGrid>
          <DefinitionCard
            term={<MarketLabelChip amber>Market-wide event</MarketLabelChip>}
          >
            An unusual move detected across several monitored symbols within the
            same 15-minute window.
          </DefinitionCard>
          <DefinitionCard term={<MarketLabelChip>Market Day</MarketLabelChip>}>
            A day-level grouping of multiple related sub-events on the same UTC
            date. Public context applies to the day overall, not one exact
            15-minute candle.
          </DefinitionCard>
          <DefinitionCard
            term={
              <DirectionLabelChip tone="up" Icon={TrendingUp}>
                Observed Up
              </DirectionLabelChip>
            }
          >
            The monitored symbols moved upward during the detected event.
          </DefinitionCard>
          <DefinitionCard
            term={
              <DirectionLabelChip tone="down" Icon={TrendingDown}>
                Observed Down
              </DirectionLabelChip>
            }
          >
            The monitored symbols moved downward during the detected event.
          </DefinitionCard>
          <DefinitionCard
            term={
              <DirectionLabelChip tone="twoSided" Icon={ArrowLeftRight}>
                Two-sided
              </DirectionLabelChip>
            }
          >
            The day showed both unusual upward and downward movement.
          </DefinitionCard>
          <DefinitionCard term="Signals">
            How many of the five monitored symbols passed ByteSiren&apos;s event
            rule during that detected event.
          </DefinitionCard>
        </DefinitionGrid>
      </Accordion>

      <Accordion title="What the impact values mean">
        <GroupLabel>Evidence values</GroupLabel>
        <DefinitionGrid>
          <DefinitionCard term={<ImpactScoreChip />}>
            Higher means the detected move was more unusual, not better.
          </DefinitionCard>
          <DefinitionCard term="Price Z">
            Higher means a more unusual 15-minute price move compared with the
            recent 24-hour baseline.
          </DefinitionCard>
          <DefinitionCard term="Volume ×">
            Higher means larger quote volume than the recent 24-hour median
            baseline.
          </DefinitionCard>
          <DefinitionCard term="Range ×">
            Higher means a larger high-low candle range than the recent 24-hour
            median baseline.
          </DefinitionCard>
          <DefinitionCard term="15m Change">
            Latest 15-minute candle close compared with the previous 15-minute
            candle close.
          </DefinitionCard>
          <DefinitionCard term="24h Change">
            Latest available price compared with roughly 24 hours earlier.
          </DefinitionCard>
          <DefinitionCard term="Price Context">
            Compares any price or move references in the public context against
            the Binance market data ByteSiren observed. A mismatch makes the
            context more cautious; it does not create or upgrade a cause label.
          </DefinitionCard>
        </DefinitionGrid>

        <p className="mt-3">
          Lower values usually mean closer to normal recent behavior. These
          values describe unusual conditions; they are not recommendations or
          predictions.
        </p>
      </Accordion>

      <Accordion title="Sources links and context tags">
        <p>
          Source chip colors show how an accepted article was used. Tags explain
          how ByteSiren framed the public context. Neither source colors nor
          tags rank source quality or turn the source into a recommendation.
        </p>

        <GroupLabel>Sources</GroupLabel>
        <DefinitionGrid>
          <DefinitionCard
            term={
              <SourceExampleChip role="focused">
                Focused catalyst source
              </SourceExampleChip>
            }
          >
            Dark blue label. A source used for a source-backed Focused Cause.
          </DefinitionCard>
          <DefinitionCard
            term={
              <SourceExampleChip role="likely">
                Likely cause source
              </SourceExampleChip>
            }
          >
            Sky blue label. A source used for a probable public driver.
          </DefinitionCard>
          <DefinitionCard
            term={
              <SourceExampleChip role="backdrop">
                Backdrop source
              </SourceExampleChip>
            }
          >
            Blue-gray label. A source used for broader day-level market context.
          </DefinitionCard>
          <DefinitionCard
            term={
              <SourceExampleChip role="price">
                Price check source
              </SourceExampleChip>
            }
          >
            Amber label. A source used to compare public price references with
            ByteSiren market data.
          </DefinitionCard>
          <DefinitionCard term="Clickable source link" Icon={ExternalLink}>
            The visible publisher name opens the exact article URL in a new tab.
          </DefinitionCard>
        </DefinitionGrid>

        <GroupLabel>Tags</GroupLabel>
        <DefinitionGrid>
          <DefinitionCard term={<TagExampleChip>Relief rally</TagExampleChip>}>
            A recovery move after a period of weakness or fear.
          </DefinitionCard>
          <DefinitionCard
            term={<TagExampleChip>Oversold rebound</TagExampleChip>}
          >
            A bounce after prices fell unusually far below recent norms.
          </DefinitionCard>
          <DefinitionCard
            term={<TagExampleChip>Same-day context</TagExampleChip>}
          >
            Supporting context is from the same calendar day, not proof of exact
            15-minute causation.
          </DefinitionCard>
          <DefinitionCard
            term={<TagExampleChip>No direct cause</TagExampleChip>}
          >
            No single clear public trigger was identified for the move.
          </DefinitionCard>
        </DefinitionGrid>
      </Accordion>

      <InfoCard title="Data sources and timing">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            ByteSiren monitors BTCUSDT, ETHUSDT, BNBUSDT, SOLUSDT, and XRPUSDT
            using Binance public market data.
          </li>
          <li>
            The feed shows the past 30 days of analyzed data. Older records are
            periodically deleted.
          </li>
          <li>
            Chart interval controls change display aggregation only. ByteSiren
            detections always use 15-minute signals.
          </li>
          <li>
            The detector runs on a scheduled cron trigger, so data is not real
            time and public Binance data can be delayed.
          </li>
          <li>
            Claude is called only after a qualifying event is detected. Public
            sources are filtered before appearing in the feed.
          </li>
        </ul>
      </InfoCard>

      <InfoCard title="Limitations and disclaimer">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            ByteSiren is a public portfolio demo for market intelligence only.
          </li>
          <li>
            It does not provide financial advice, trading signals, buy/sell/hold
            recommendations, price targets, or automated trading.
          </li>
          <li>
            ByteSiren uses Binance public market data and Claude-generated
            web-search summaries. Information may be delayed, incomplete, or
            incorrect.
          </li>
          <li>Always verify information from primary sources.</li>
          <li>
            ByteSiren is not affiliated with, endorsed by, or sponsored by
            Binance, Anthropic, or any exchange.
          </li>
        </ul>
      </InfoCard>

      <section className="px-1 py-2" aria-label="Public view counts">
        <div className="grid gap-2 sm:grid-cols-2">
          <MetricCard label="Total Views" value={viewMetrics?.total_views} />
          <MetricCard label="Today Views" value={viewMetrics?.today_views} />
        </div>
        <p className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
          Approximate public page views. Counts are limited by browser/session
          behavior.
        </p>
      </section>
    </section>
  );
}
