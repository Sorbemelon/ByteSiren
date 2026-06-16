"use client";

import Image from "next/image";

interface HeaderProps {
  updatedAt?: string | null;
}

function formatUpdated(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return (
      d.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
        hour12: false,
      }) + " UTC"
    );
  } catch {
    return "—";
  }
}

export default function Header({ updatedAt }: HeaderProps) {
  return (
    <header
      className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between"
      style={{ borderColor: "var(--border-panel)" }}
    >
      <div className="flex items-center gap-4">
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

      <div className="flex items-center gap-3">
        {updatedAt && (
          <span
            className="text-[13px] tabular-nums"
            style={{ color: "var(--text-muted)" }}
          >
            Updated {formatUpdated(updatedAt)}
          </span>
        )}
        <span
          className="rounded-full px-4 py-1.5 text-[14px] font-semibold sm:text-[15px]"
          style={{
            color: "#ddd6fe",
            background: "rgba(139, 92, 246, 0.1)",
          }}
        >
          Read-only · Not financial advice
        </span>
      </div>
    </header>
  );
}
