"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

interface AccordionProps {
  id?: string;
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
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
        <span
          className="text-[13px] font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </span>
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

export default function BottomAccordions() {
  return (
    <section
      aria-label="Information and disclaimer"
      className="flex flex-col gap-2"
    >
      {/* SEO-readable description — always visible */}
      <div
        className="rounded-xl px-4 py-3 text-[13px] leading-relaxed"
        style={{
          color: "var(--text-muted)",
          background: "rgba(148,163,184,0.04)",
          border: "1px solid rgba(148,163,184,0.08)",
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
          The chart tabs only change the chart. The Intelligence Feed shows all
          detected market events from the past 30 days.
        </p>
        <p className="mt-2">Each feed row has three parts:</p>
        <ul className="mt-1.5 list-none space-y-1 pl-0">
          <li>
            <span style={{ color: "var(--text-primary)" }}>Evidence</span> —
            what ByteSiren detected from Binance public market data.
          </li>
          <li>
            <span style={{ color: "var(--text-primary)" }}>Claude Brief</span> —
            what Claude found from public web sources.
          </li>
          <li>
            <span style={{ color: "var(--text-primary)" }}>Sources</span> —
            clickable links to supporting public sources.
          </li>
        </ul>
        <p className="mt-3">
          Click any row to expand it and see per-symbol evidence, Claude&apos;s
          full context, and all accepted source links.
        </p>
      </Accordion>

      <Accordion title="What the scores mean">
        <dl className="space-y-2.5">
          <div>
            <dt
              className="font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Severity Score
            </dt>
            <dd className="mt-0.5">
              Describes how unusual the detected market move is compared with
              recent behavior. It is not a prediction.
            </dd>
          </div>
          <div>
            <dt
              className="font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Breadth
            </dt>
            <dd className="mt-0.5">
              How many of the five monitored pairs were included in the event.
            </dd>
          </div>
          <div>
            <dt
              className="font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Price Z
            </dt>
            <dd className="mt-0.5">
              How unusual the 15-minute price move is compared with the recent
              24-hour baseline (in standard deviations).
            </dd>
          </div>
          <div>
            <dt
              className="font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Volume ×
            </dt>
            <dd className="mt-0.5">
              Compares the current 15-minute quote volume with the recent
              24-hour median baseline.
            </dd>
          </div>
          <div>
            <dt
              className="font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Range ×
            </dt>
            <dd className="mt-0.5">
              Compares the current 15-minute candle high-low range with the
              recent 24-hour median baseline.
            </dd>
          </div>
          <p className="pt-1">
            Scores describe unusual market conditions. They are not buy/sell
            signals, forecasts, or price targets.
          </p>
        </dl>
      </Accordion>

      <Accordion title="Data sources and timing">
        <p>
          ByteSiren monitors only BTCUSDT, ETHUSDT, BNBUSDT, SOLUSDT, and
          XRPUSDT using Binance public market data. Only the past 30 days of
          analyzed data are shown. Older records are periodically deleted.
        </p>
        <dl className="mt-3 space-y-2">
          <div>
            <dt
              className="font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              15m Change
            </dt>
            <dd className="mt-0.5">
              Compares the latest detected 15-minute candle close with the
              previous 15-minute candle close.
            </dd>
          </div>
          <div>
            <dt
              className="font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              24h Change
            </dt>
            <dd className="mt-0.5">
              Compares the latest available price with roughly 24 hours earlier.
            </dd>
          </div>
          <div>
            <dt
              className="font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Detection cadence
            </dt>
            <dd className="mt-0.5">
              The detector runs on a scheduled cron trigger. Data is not
              real-time. Binance public API may apply its own data delays.
            </dd>
          </div>
          <div>
            <dt
              className="font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Claude Web Search
            </dt>
            <dd className="mt-0.5">
              Claude is called only after a qualifying event is detected.
              Sources are accepted based on relevance to the detection date; no
              forecast or trading content is included.
            </dd>
          </div>
        </dl>
      </Accordion>

      <Accordion title="Limitations and disclaimer">
        <p>
          ByteSiren is a public portfolio demo for market intelligence only. It
          does not provide financial advice, trading signals, buy/sell/hold
          recommendations, price targets, or automated trading.
        </p>
        <p className="mt-2">
          ByteSiren uses Binance public market data and Claude-generated
          web-search summaries. Information may be delayed, incomplete, or
          incorrect. Always verify information from primary sources.
        </p>
        <p className="mt-2">
          ByteSiren is not affiliated with, endorsed by, or sponsored by
          Binance, Anthropic, or any exchange.
        </p>
      </Accordion>
    </section>
  );
}
