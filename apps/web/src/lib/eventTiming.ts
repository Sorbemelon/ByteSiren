import type { FeedItem } from "./types";

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

function formatUtcDateTime(iso: string | null | undefined): {
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

function formatUtcTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(
    d.getUTCMinutes(),
  ).padStart(2, "0")} UTC`;
}

export function formatAge(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;

  const minutes = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
}

export function evidenceWindowLabel(
  item: Pick<FeedItem, "event_start_time" | "event_end_time">,
): string {
  const start = formatUtcDateTime(item.event_start_time);
  const end = formatUtcDateTime(item.event_end_time);
  const startMs = Date.parse(item.event_start_time);
  const endMs = Date.parse(item.event_end_time);

  if (!start || !end || !Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return "Evidence window: unavailable";
  }

  const durationMs = Math.max(0, endMs - startMs);
  const isSingleCandle = durationMs <= 15 * 60 * 1000;

  if (isSingleCandle) {
    return `Evidence window: 15m candle ending ${end.date}, ${end.time}`;
  }

  const startDay = item.event_start_time.slice(0, 10);
  const endDay = item.event_end_time.slice(0, 10);

  if (startDay === endDay) {
    const startTime = formatUtcTime(item.event_start_time);
    const endTime = formatUtcTime(item.event_end_time);
    return `Evidence window: ${start.date}, ${startTime?.replace(" UTC", "")}-${endTime}`;
  }

  return `Evidence window: ${start.date}, ${start.time}-${end.date}, ${end.time}`;
}

export function peakSignalLabel(item: Pick<FeedItem, "peak_time">): string {
  const peak = formatUtcDateTime(item.peak_time);
  return peak
    ? `Peak signal: ${peak.date}, ${peak.time}`
    : "Peak signal: unavailable";
}
