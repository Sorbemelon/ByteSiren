"use client";

import { Moon, Sun } from "lucide-react";
import { setTheme, useTheme } from "../lib/theme";

export default function ThemeToggle() {
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-md border transition-colors hover:bg-white/5"
      style={{
        borderColor: "var(--border-row)",
        color: "var(--text-secondary)",
      }}
    >
      {theme === "dark" ? (
        <Sun size={23} aria-hidden />
      ) : (
        <Moon size={23} aria-hidden />
      )}
    </button>
  );
}
