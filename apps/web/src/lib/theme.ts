"use client";

import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "bytesiren-theme";
const THEME_EVENT = "bytesiren:themechange";

/**
 * Inline script injected into <head> so the theme attribute is set before
 * first paint — prevents a flash of the wrong theme and any hydration
 * mismatch (React never owns this attribute). Defaults to dark.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k="${THEME_STORAGE_KEY}";var s=localStorage.getItem(k);var t=s==="light"||s==="dark"?s:"dark";document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="dark";}})();`;

function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function setTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore storage failures (private mode, etc.)
  }
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
}

/**
 * Current theme, kept in sync with the <html data-theme> attribute. Returns
 * "dark" on the server and first client render (matching the no-flash script's
 * default) and reconciles in an effect to avoid hydration mismatch.
 */
export function useTheme(): Theme {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    setThemeState(readTheme());
    const sync = () => setThemeState(readTheme());
    window.addEventListener(THEME_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(THEME_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return theme;
}
