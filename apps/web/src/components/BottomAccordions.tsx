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
  | "cyan";

const TONE_COLOR: Record<Tone, string> = {
  violet: "var(--accent-primary)",
  emerald: "var(--cause-focused)",
  teal: "var(--cause-likely)",
  rose: "var(--down)",
  amber: "var(--status-strong)",
  slate: "var(--text-muted)",
  blue: "var(--status-moving)",
  cyan: "var(--source-chip-text)",
};

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

function DefinitionGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-2 sm:grid-cols-2">{children}</div>;
}

function DefinitionCard({
  term,
  tone,
  Icon,
  children,
}: {
  term: string;
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

export default function BottomAccordions() {
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
        <p>
          ByteSiren is a read-only AI crypto market intelligence dashboard. It
          monitors BTCUSDT, ETHUSDT, BNBUSDT, SOLUSDT, and XRPUSDT using Binance
          public market data. It detects unusual market-wide movement from
          15-minute candles and uses Claude Web Search to attach cited public
          context.
        </p>
        <p className="mt-2">
          ByteSiren is designed for market awareness, not trading advice. It
          does not provide buy, sell, hold, long, short, price target, or
          automated trading recommendations.
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
            What ByteSiren detected from Binance public market data.
          </DefinitionCard>
          <DefinitionCard term="Public Context">
            Source-backed public context found for the detected event.
          </DefinitionCard>
          <DefinitionCard term="Sources" tone="cyan" Icon={ExternalLink}>
            Accepted article links that open the exact source URL in a new tab.
          </DefinitionCard>
          <DefinitionCard term="Context Details">
            Longer context shown only when it adds detail beyond the collapsed
            summary.
          </DefinitionCard>
        </DefinitionGrid>
      </Accordion>

      <Accordion title="What the labels mean">
        <GroupLabel>Public Context status</GroupLabel>
        <DefinitionGrid>
          <DefinitionCard term="Focused Cause" tone="emerald" Icon={BadgeCheck}>
            A specific public catalyst was found and source-backed.
          </DefinitionCard>
          <DefinitionCard term="Likely Cause" tone="teal" Icon={SearchCheck}>
            Public sources point to a probable driver, with less certainty than
            a Focused Cause.
          </DefinitionCard>
          <DefinitionCard term="Market Backdrop" tone="slate" Icon={Info}>
            Sources describe the day&apos;s conditions, but no direct cause was
            found for the detected move.
          </DefinitionCard>
          <DefinitionCard term="No Clear Cause" tone="slate" Icon={HelpCircle}>
            No reliable public explanation was found for the detection.
          </DefinitionCard>
          <DefinitionCard term="Claude Limited" tone="violet" Icon={Lock}>
            Public context is hidden by the free-project analysis limit until
            analysis is available.
          </DefinitionCard>
          <DefinitionCard term="Waiting for Claude" tone="blue" Icon={Clock}>
            The detection is queued for date-matched public web context.
          </DefinitionCard>
          <DefinitionCard term="Data Delay">
            Latest market data may be delayed or incomplete.
          </DefinitionCard>
        </DefinitionGrid>

        <GroupLabel>Event labels</GroupLabel>
        <DefinitionGrid>
          <DefinitionCard term="Market-wide event">
            An unusual move detected across several monitored symbols within the
            same 15-minute window.
          </DefinitionCard>
          <DefinitionCard term="Market Day">
            A day-level grouping of multiple related sub-events.
          </DefinitionCard>
          <DefinitionCard term="Observed Up" tone="emerald" Icon={TrendingUp}>
            The monitored symbols moved upward during the detected event.
          </DefinitionCard>
          <DefinitionCard term="Observed Down" tone="rose" Icon={TrendingDown}>
            The monitored symbols moved downward during the detected event.
          </DefinitionCard>
          <DefinitionCard term="Two-sided" tone="violet" Icon={ArrowLeftRight}>
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
          <DefinitionCard term="Impact Score" tone="amber">
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
            Whether public context price references match the Binance data
            ByteSiren observed.
          </DefinitionCard>
        </DefinitionGrid>

        <p className="mt-3">
          Lower values usually mean closer to normal recent behavior. These
          values describe unusual conditions; they are not recommendations or
          predictions.
        </p>
      </Accordion>

      <Accordion title="Context tags and source links">
        <p>
          Context tags explain how ByteSiren framed the public context. Source
          chip colors show how an accepted article was used in the public
          context. They do not rank source quality or turn the source into a
          recommendation.
        </p>

        <GroupLabel>Context tags shown in feed cards</GroupLabel>
        <DefinitionGrid>
          <DefinitionCard term="relief_rally">
            A recovery move after a period of weakness or fear.
          </DefinitionCard>
          <DefinitionCard term="oversold_rebound">
            A bounce after prices fell unusually far below recent norms.
          </DefinitionCard>
          <DefinitionCard term="same_day_context">
            Supporting context is from the same calendar day, not proof of exact
            15-minute causation.
          </DefinitionCard>
          <DefinitionCard term="no_direct_catalyst">
            No single clear public trigger was identified for the move.
          </DefinitionCard>
        </DefinitionGrid>

        <GroupLabel>Source chips</GroupLabel>
        <DefinitionGrid>
          <DefinitionCard term="Focused catalyst source" tone="emerald">
            A source used for a source-backed Focused Cause.
          </DefinitionCard>
          <DefinitionCard term="Likely cause source" tone="teal">
            A source used for a probable public driver.
          </DefinitionCard>
          <DefinitionCard term="Backdrop source" tone="blue">
            A source used for broader day-level market context.
          </DefinitionCard>
          <DefinitionCard term="Price check source" tone="amber">
            A source used to compare public price references with ByteSiren
            market data.
          </DefinitionCard>
          <DefinitionCard
            term="Clickable source link"
            tone="cyan"
            Icon={ExternalLink}
          >
            The visible publisher name opens the exact article URL in a new tab.
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
    </section>
  );
}
