"use client";

import Image from "next/image";
import ThemeToggle from "./ThemeToggle";

interface HeaderProps {
  marketUpdatedAt?: string | null;
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

function formatUpdated(iso: string | null | undefined): {
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

function TimeValue({ value }: { value: string | null | undefined }) {
  const formatted = formatUpdated(value);

  if (!formatted) {
    return (
      <span
        className="text-[13px] font-semibold sm:text-[14px]"
        style={{ color: "var(--text-secondary)" }}
      >
        No update yet
      </span>
    );
  }

  return (
    <time
      dateTime={value ?? undefined}
      className="flex flex-wrap items-baseline gap-x-1.5 text-[13px] font-semibold sm:text-[14px]"
      style={{ color: "var(--text-primary)" }}
    >
      <span>{formatted.date}</span>
      <span style={{ color: "var(--text-secondary)" }}>{formatted.time}</span>
    </time>
  );
}

export default function Header({ marketUpdatedAt }: HeaderProps) {
  return (
    <header
      className="grid gap-3 border-b pb-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center"
      style={{ borderColor: "var(--border-panel)" }}
    >
      <div className="flex items-center gap-4 lg:justify-self-start">
        <Image
          src="/brand/bytesiren_logo_transparent.png"
          alt="ByteSiren AI Crypto Market Intelligence"
          width={56}
          height={56}
          className="h-14 w-14 shrink-0"
          priority
        />
        <div>
          <h1
            className="text-[34px] font-bold leading-[0.9] tracking-tight sm:text-[40px]"
            style={
              {
                color: "var(--text-primary)",
                letterSpacing: "-0.02em",
                textWrap: "balance",
              } as React.CSSProperties
            }
          >
            <span>Byte</span>
            <span className="brand-wordmark">Siren</span>
          </h1>
          <p
            className="mt-1 text-[14px] sm:text-[15px]"
            style={{ color: "var(--text-secondary)" }}
          >
            AI Crypto Market Intelligence
          </p>
        </div>
      </div>

      <div className="lg:justify-self-center">
        <div
          className="inline-flex flex-col items-start gap-0.5 text-left tabular-nums lg:items-center lg:text-center"
          aria-label={
            marketUpdatedAt
              ? "Latest market data update"
              : "Latest market data update not available"
          }
        >
          <span
            className="text-[10px] font-medium uppercase tracking-wider sm:text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            Latest update
          </span>
          <TimeValue value={marketUpdatedAt} />
        </div>
      </div>

      <div className="flex items-center gap-3 lg:justify-self-end">
        <div className="text-left lg:text-right">
          <span
            className="inline-flex rounded-full px-4 py-1.5 text-[14px] font-semibold sm:text-[15px]"
            style={{
              color: "var(--safety-pill-text)",
              background: "var(--safety-pill-bg)",
            }}
          >
            Not financial advice
          </span>
          <p
            className="mt-1 whitespace-nowrap text-[10px] leading-snug sm:text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            Not affiliated with or endorsed by Binance, Anthropic, or any
            exchange.
          </p>
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
