"use client";

import Image from "next/image";
import ThemeToggle from "./ThemeToggle";

interface HeaderProps {
  updatedAt?: string | null;
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
];

function formatUpdated(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const datePart = `${UTC_MONTHS[d.getUTCMonth()] ?? "UTC"} ${d.getUTCDate()}`;
  const timePart = `${String(d.getUTCHours()).padStart(2, "0")}:${String(
    d.getUTCMinutes(),
  ).padStart(2, "0")}`;
  return `${datePart}, ${timePart} UTC`;
}

export default function Header({ updatedAt }: HeaderProps) {
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
          className="inline-flex flex-wrap items-baseline gap-x-2 rounded-md px-0 text-[14px] font-semibold tabular-nums sm:text-[15px] lg:text-[16px]"
          style={{ color: "var(--text-secondary)" }}
        >
          <span
            className="text-[11px] font-medium uppercase tracking-wider sm:text-[12px]"
            style={{ color: "var(--text-muted)" }}
          >
            Latest update
          </span>
          <span>{formatUpdated(updatedAt)}</span>
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
