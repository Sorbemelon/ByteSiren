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
      <div className="flex items-center gap-3">
        <Image
          src="/brand/bytesiren_logo_transparent.png"
          alt="ByteSiren AI Crypto Market Intelligence"
          width={36}
          height={36}
          className="h-9 w-9 shrink-0"
          priority
        />
        <div>
          <h1
            className="text-[30px] font-bold leading-none tracking-tight"
            style={
              {
                color: "var(--text-primary)",
                letterSpacing: "-0.02em",
                textWrap: "balance",
              } as React.CSSProperties
            }
          >
            ByteSiren
          </h1>
          <p
            className="mt-0.5 text-[13px]"
            style={{ color: "var(--text-secondary)" }}
          >
            AI Crypto Market Intelligence
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {updatedAt && (
          <span
            className="text-xs tabular-nums"
            style={{ color: "var(--text-muted)" }}
          >
            Updated {formatUpdated(updatedAt)}
          </span>
        )}
        <span
          className="rounded-full border px-3 py-1 text-xs font-medium"
          style={{
            borderColor: "rgba(139, 92, 246, 0.5)",
            color: "#c4b5fd",
            background: "rgba(139, 92, 246, 0.08)",
          }}
        >
          Read-only · Not financial advice
        </span>
      </div>
    </header>
  );
}
