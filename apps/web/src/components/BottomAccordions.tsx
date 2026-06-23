"use client";

import {
  Activity,
  ArrowLeftRight,
  BadgeCheck,
  Check,
  ChevronDown,
  Clock,
  CornerUpLeft,
  ExternalLink,
  Gauge,
  HelpCircle,
  Info,
  Lock,
  Route,
  ScissorsLineDashed,
  ScanLine,
  SearchCheck,
  Shuffle,
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
  | "blueGray"
  | "brown";

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
  brown: "var(--context-backdrop)",
};

const MARKET_STORY_STATUS_META: Record<
  string,
  { Icon: LucideIcon; color: string }
> = {
  "Range break sequence": {
    Icon: ScissorsLineDashed,
    color: "var(--market-story-range-text)",
  },
  "Reversal sequence": {
    Icon: CornerUpLeft,
    color: "var(--market-story-reversal-text)",
  },
  "Momentum continuation sequence": {
    Icon: Route,
    color: "var(--market-story-momentum-text)",
  },
  "Volatility expansion sequence": {
    Icon: Gauge,
    color: "var(--market-story-volatility-text)",
  },
  "Inside-range impulse sequence": {
    Icon: ScanLine,
    color: "var(--market-story-inside-text)",
  },
  "Mixed sequence": {
    Icon: Shuffle,
    color: "var(--market-story-mixed-text)",
  },
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

function DirectionLabelChip({
  children,
  tone,
  Icon,
}: {
  children: ReactNode;
  tone: "up" | "down" | "amber";
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
    amber: {
      background: "rgba(245, 158, 11, 0.1)",
      border: "1px solid rgba(245, 158, 11, 0.32)",
      color: "var(--status-strong)",
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

function DailyToneChip({
  children,
  color,
  Icon,
  iconTransform,
}: {
  children: ReactNode;
  color: string;
  Icon: LucideIcon;
  iconTransform?: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[13px] font-semibold leading-none"
      style={{
        color,
        borderColor: "var(--chip-border)",
        background: "var(--chip-bg)",
      }}
    >
      <Icon
        size={14}
        aria-hidden
        style={iconTransform ? { transform: iconTransform } : undefined}
      />
      {children}
    </span>
  );
}

function MarketStoryStatusChip({ label }: { label: string }) {
  const meta =
    MARKET_STORY_STATUS_META[label] ??
    MARKET_STORY_STATUS_META["Mixed sequence"];
  const Icon = meta.Icon;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium leading-none"
      style={{
        background: `color-mix(in srgb, ${meta.color} 10%, transparent)`,
        borderColor: `color-mix(in srgb, ${meta.color} 38%, transparent)`,
        color: meta.color,
      }}
    >
      <Icon size={12} aria-hidden />
      {label}
    </span>
  );
}

function SourceExampleChip({
  children,
  role,
}: {
  children: ReactNode;
  role: "catalyst" | "likely" | "main" | "support" | "backdrop" | "price";
}) {
  const styles = {
    catalyst: {
      borderColor:
        "color-mix(in srgb, var(--source-catalyst-text) 42%, transparent)",
      background:
        "color-mix(in srgb, var(--source-catalyst-text) 13%, transparent)",
      color: "var(--source-catalyst-text)",
    },
    likely: {
      borderColor:
        "color-mix(in srgb, var(--source-likely-text) 42%, transparent)",
      background:
        "color-mix(in srgb, var(--source-likely-text) 12%, transparent)",
      color: "var(--source-likely-text)",
    },
    main: {
      borderColor:
        "color-mix(in srgb, var(--source-main-text) 42%, transparent)",
      background:
        "color-mix(in srgb, var(--source-main-text) 11%, transparent)",
      color: "var(--source-main-text)",
    },
    support: {
      borderColor:
        "color-mix(in srgb, var(--source-support-text) 42%, transparent)",
      background:
        "color-mix(in srgb, var(--source-support-text) 11%, transparent)",
      color: "var(--source-support-text)",
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

function EvidenceValueGroup({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-4 first:mt-0">
      <div className="mb-2">
        <h3
          className="text-[13px] font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h3>
        <p
          className="mt-0.5 text-[12px]"
          style={{ color: "var(--text-muted)" }}
        >
          {description}
        </p>
      </div>
      <DefinitionGrid>{children}</DefinitionGrid>
    </section>
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
          the selected symbol, and keeps the Intelligence Feed organized around
          Daily Overviews, deterministic Market Stories, and compact Signal
          Events.
        </p>
        <p className="mt-2" style={{ textIndent: "1.25rem" }}>
          The backend stores recent 15-minute candle data, detects compact
          evidence-window movement, builds broader chart-pattern stories
          deterministically, and uses Claude only for source-backed Signal Event
          and Daily Overview context.
        </p>
        <p className="mt-2" style={{ textIndent: "1.25rem" }}>
          ByteSiren is designed for market awareness and engineering
          demonstration, not financial advice or automated trading.
        </p>
      </div>

      <Accordion id="how-to-read" title="How to read ByteSiren">
        <p>
          ByteSiren groups the public feed by UTC day. Each day can contain a
          Daily Overview, one or more deterministic Market Stories, and compact
          Signal Events.
        </p>
        <p className="mt-2">
          The chart symbol tabs and chart interval tabs only change the chart.
          The Intelligence Feed shows the past 30 days of v0.2 intelligence
          items when v0.2 feed rows are available.
        </p>

        <GroupLabel>Card sections</GroupLabel>
        <DefinitionGrid>
          <DefinitionCard term="Daily Overview">
            Full UTC-day market context. It can use Claude when a Daily Overview
            brief exists, and it uses the 24h Change metric.
          </DefinitionCard>
          <DefinitionCard term="Market Story">
            Deterministic chart-pattern context across a broader story window.
            It has no Claude status, no source chips, and no nested Signal Event
            cards.
          </DefinitionCard>
          <DefinitionCard term="Signal Event">
            Compact evidence-window movement. It can use Claude for
            source-backed public context and uses Avg Change in the collapsed
            card.
          </DefinitionCard>
          <DefinitionCard term="Show more / Hide">
            Expands or hides details for one section only. Day-post expansion is
            controlled separately by the post control.
          </DefinitionCard>
          <DefinitionCard term="Sources" tone="cyan" Icon={ExternalLink}>
            Accepted article links for Claude-backed Daily Overview and Signal
            Event sections only. Use the +N control in the main card source row
            to reveal every accepted source. Market Story does not show sources.
          </DefinitionCard>
          <DefinitionCard term="Brief">
            The readable Claude context in a Daily Overview or Signal Event
            card. It combines source-backed context with the relevant market
            detail, so a separate Context Details section is not needed.
          </DefinitionCard>
          <DefinitionCard term="Source markers">
            Chart markers for accepted sources on Claude-backed Daily Overview
            or Signal Event cards. Filled markers use a specific article or
            catalyst timestamp. No-fill markers mean the source has no specific
            timestamp, so ByteSiren places it at the source date&apos;s 00:00
            UTC point. When times overlap, markers stack vertically without
            shifting chart time. They never appear for Market Story.
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
                No context yet
              </StatusTextLabel>
            }
          >
            Claude context is not available for this item yet. This is different
            from No Clear Cause or Claude Limited.
          </DefinitionCard>
        </DefinitionGrid>

        <GroupLabel>Signal labels</GroupLabel>
        <DefinitionGrid>
          <DefinitionCard
            term={
              <DirectionLabelChip tone="up" Icon={TrendingUp}>
                Observed up
              </DirectionLabelChip>
            }
          >
            The monitored symbols moved upward during the detected event.
          </DefinitionCard>
          <DefinitionCard
            term={
              <DirectionLabelChip tone="down" Icon={TrendingDown}>
                Observed down
              </DirectionLabelChip>
            }
          >
            The monitored symbols moved downward during the detected event.
          </DefinitionCard>
          <DefinitionCard
            term={
              <DirectionLabelChip tone="up" Icon={ArrowLeftRight}>
                Reversed, Net up
              </DirectionLabelChip>
            }
          >
            The Signal Event updated through a reversal, and its net movement
            finished upward.
          </DefinitionCard>
          <DefinitionCard
            term={
              <DirectionLabelChip tone="down" Icon={ArrowLeftRight}>
                Reversed, Net down
              </DirectionLabelChip>
            }
          >
            The Signal Event updated through a reversal, and its net movement
            finished downward.
          </DefinitionCard>
          <DefinitionCard term="Signals">
            How many of the five monitored symbols passed ByteSiren&apos;s event
            rule during that detected event.
          </DefinitionCard>
        </DefinitionGrid>

        <GroupLabel>Daily tone labels</GroupLabel>
        <DefinitionGrid>
          <DefinitionCard
            term={
              <DailyToneChip color="var(--status-calm)" Icon={Info}>
                Quiet Day
              </DailyToneChip>
            }
          >
            The UTC day had relatively muted movement across the tracked
            symbols.
          </DefinitionCard>
          <DefinitionCard
            term={
              <DailyToneChip color="var(--status-moving)" Icon={ArrowLeftRight}>
                Mixed Day
              </DailyToneChip>
            }
          >
            The UTC day had split or unclear direction across the tracked
            symbols.
          </DefinitionCard>
          <DefinitionCard
            term={
              <DailyToneChip color="var(--status-severe)" Icon={Activity}>
                Volatile Day
              </DailyToneChip>
            }
          >
            The UTC day had unusually wide movement ranges.
          </DefinitionCard>
          <DefinitionCard
            term={
              <DailyToneChip color="var(--up)" Icon={TrendingUp}>
                Risk-on Day
              </DailyToneChip>
            }
          >
            The tracked market moved broadly upward for the UTC day.
          </DefinitionCard>
          <DefinitionCard
            term={
              <DailyToneChip color="var(--down)" Icon={TrendingDown}>
                Risk-off Day
              </DailyToneChip>
            }
          >
            The tracked market moved broadly downward for the UTC day.
          </DefinitionCard>
          <DefinitionCard
            term={
              <DailyToneChip
                color="var(--status-relief)"
                Icon={Check}
                iconTransform="scaleX(-1)"
              >
                Relief Day
              </DailyToneChip>
            }
          >
            The UTC day showed recovery after a prior down move or stress
            context.
          </DefinitionCard>
        </DefinitionGrid>

        <GroupLabel>Market Story status labels</GroupLabel>
        <DefinitionGrid>
          <DefinitionCard
            term={<MarketStoryStatusChip label="Range break sequence" />}
          >
            The broader story window repeatedly moved through a recent range
            boundary.
          </DefinitionCard>
          <DefinitionCard
            term={<MarketStoryStatusChip label="Reversal sequence" />}
          >
            The broader story window changed direction enough to form a reversal
            structure.
          </DefinitionCard>
          <DefinitionCard
            term={
              <MarketStoryStatusChip label="Momentum continuation sequence" />
            }
          >
            The broader story window mainly extended in one direction.
          </DefinitionCard>
          <DefinitionCard
            term={
              <MarketStoryStatusChip label="Volatility expansion sequence" />
            }
          >
            The broader story window had unusually active movement compared with
            recent candles.
          </DefinitionCard>
          <DefinitionCard
            term={
              <MarketStoryStatusChip label="Inside-range impulse sequence" />
            }
          >
            The broader story window showed a coordinated impulse that stayed
            mostly inside the recent range.
          </DefinitionCard>
          <DefinitionCard
            term={<MarketStoryStatusChip label="Mixed sequence" />}
          >
            The broader story window had useful chart context, but no single
            structure dominated.
          </DefinitionCard>
        </DefinitionGrid>
      </Accordion>

      <Accordion title="What the evidence values mean">
        <GroupLabel>Evidence values</GroupLabel>

        <EvidenceValueGroup
          title="Card and window values"
          description="Values shown in card headers or summary rows. They describe the selected time window, not advice."
        >
          <DefinitionCard term="Avg Change">
            Average or median change across participating symbols for the
            relevant Signal Event or Market Story window.
          </DefinitionCard>
          <DefinitionCard term="24h Change">
            Daily Overview range of UTC-day percentage changes across the five
            tracked symbols.
          </DefinitionCard>
          <DefinitionCard term="Range">
            High-low movement span inside the same window. It is always shown
            without a plus sign.
          </DefinitionCard>
          <DefinitionCard term="Evidence window">
            The candles used as Signal Event evidence, not a single publication
            timestamp.
          </DefinitionCard>
          <DefinitionCard term="Market Story range">
            The broader deterministic Market Story date and time range shown in
            the card header.
          </DefinitionCard>
          <DefinitionCard term="Market Story continues">
            A Market Story that started on an earlier UTC day and continues into
            this day.
          </DefinitionCard>
        </EvidenceValueGroup>

        <EvidenceValueGroup
          title="Per-symbol table values"
          description="Values shown in expanded evidence tables for Daily Overview, Market Story, and Signal Event cards."
        >
          <DefinitionCard term="Change">
            One symbol&apos;s percentage change across the relevant Signal
            Event, Market Story, or Daily Overview window.
          </DefinitionCard>
          <DefinitionCard term="Top daily mover">
            The symbol with the largest daily percentage change in the Daily
            Overview period.
          </DefinitionCard>
          <DefinitionCard term="Widest range">
            The symbol with the widest high-low range during the Daily Overview
            period.
          </DefinitionCard>
          <DefinitionCard term="Strongest 15m">
            Daily Overview value for one symbol&apos;s strongest 15-minute move
            during the UTC day.
          </DefinitionCard>
          <DefinitionCard term="Peak 15m">
            Signal Event value for one symbol&apos;s strongest 15-minute move
            inside the evidence window.
          </DefinitionCard>
          <DefinitionCard term="Volume x">
            One symbol&apos;s average volume in the window compared with its
            recent baseline.
          </DefinitionCard>
          <DefinitionCard term="Range Position">
            Where the movement sits relative to the recent 24h high-low range.
            It is descriptive, not a trading signal.
          </DefinitionCard>
          <DefinitionCard term="Movement Status">
            Per-symbol Market Story movement summary: Mostly up, Mostly down,
            Mostly flat, or Mixed.
          </DefinitionCard>
        </EvidenceValueGroup>

        <EvidenceValueGroup
          title="Highlights and label sets"
          description="Visual emphasis used inside evidence tables. The highlight points to the row or cell driving the comparison."
        >
          <DefinitionCard term="Lead mover highlight">
            The highlighted symbol marks the strongest contributor in the
            window.
          </DefinitionCard>
          <DefinitionCard term="Peak highlight">
            The highlighted Strongest 15m or Peak 15m cell marks the strongest
            15-minute move in that table.
          </DefinitionCard>
          <DefinitionCard term="Movement Profile">
            Deterministic Market Story context for range position, trend,
            momentum, and volatility.
          </DefinitionCard>
          <DefinitionCard term="Range Position labels">
            Inside range, Near high, Near low, Broke high, and Broke low are
            descriptive chart-location labels.
          </DefinitionCard>
        </EvidenceValueGroup>
      </Accordion>

      <Accordion title="Source links">
        <p>
          Source chips show the publisher name. Their color follows how the
          accepted article was used for a Claude-backed Daily Overview or Signal
          Event. They do not rank source quality or turn the source into a
          recommendation.
        </p>

        <GroupLabel>Source color roles</GroupLabel>
        <DefinitionGrid>
          <DefinitionCard
            term={
              <SourceExampleChip role="catalyst">Catalyst</SourceExampleChip>
            }
          >
            A focused catalyst source for a Signal Event. The card chip shows
            the publisher name in this color.
          </DefinitionCard>
          <DefinitionCard
            term={<SourceExampleChip role="likely">Likely</SourceExampleChip>}
          >
            A likely-cause source for a Signal Event. It supports context with
            less certainty than a focused catalyst.
          </DefinitionCard>
          <DefinitionCard
            term={<SourceExampleChip role="main">Main</SourceExampleChip>}
          >
            A main daily context source for a Daily Overview.
          </DefinitionCard>
          <DefinitionCard
            term={<SourceExampleChip role="support">Support</SourceExampleChip>}
          >
            A supporting daily source for a Daily Overview.
          </DefinitionCard>
          <DefinitionCard
            term={
              <SourceExampleChip role="backdrop">Backdrop</SourceExampleChip>
            }
          >
            A broader context source that should not be promoted into a direct
            cause.
          </DefinitionCard>
          <DefinitionCard
            term={<SourceExampleChip role="price">Price</SourceExampleChip>}
          >
            A source used to compare public price references with ByteSiren
            market data.
          </DefinitionCard>
          <DefinitionCard term="Clickable source link" Icon={ExternalLink}>
            The visible publisher name opens the exact article URL in a new tab.
          </DefinitionCard>
          <DefinitionCard term="No-fill source marker">
            A hollow chart source marker means the accepted source has no
            specific timestamp. ByteSiren marks it at that source date&apos;s
            00:00 UTC instead of inventing an exact time.
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
            Claude context is used only for Signal Event and Daily Overview
            sections. Public sources are filtered before appearing in the feed.
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
