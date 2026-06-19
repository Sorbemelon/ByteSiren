#!/usr/bin/env node

import {
  OUTPUTS_DIR,
  isMain,
  readJson,
  readOption,
  writeJson,
  writeText,
} from "./shared.mjs";
import { DAILY_OVERVIEWS_PATH } from "./generate-daily-overviews.mjs";
import { VNEXT_B_EVENTS_PATH } from "./run-vnext-b.mjs";
import {
  dailyClaudePayload,
  signalClaudePayload,
} from "./build-feed-contract.mjs";

export const CLAUDE_SIGNAL_PAYLOADS_PATH = `${OUTPUTS_DIR}/claude_payload_signal_events.json`;
export const CLAUDE_DAILY_PAYLOADS_PATH = `${OUTPUTS_DIR}/claude_payload_daily_overviews.json`;
export const CLAUDE_PAYLOAD_DESIGN_PATH = `${OUTPUTS_DIR}/claude_payload_design.md`;

export function buildClaudePayloads({ dailyOverviews, signalEvents }) {
  const publicSignals = signalEvents.filter((event) => event.publish_candidate);
  const signalPayloads = publicSignals.map(signalClaudePayload);
  const dailyPayloads = dailyOverviews.map((overview) => {
    const dayEvents = publicSignals.filter(
      (event) => event.window_start.slice(0, 10) === overview.date_utc,
    );
    return dailyClaudePayload(overview, dayEvents);
  });

  return {
    signalPayloads,
    dailyPayloads,
  };
}

function designMarkdown({ signalPayloads, dailyPayloads }) {
  return [
    "# v0.2 Claude Payload Design",
    "",
    "This is a local-only proposal for future prompt inputs. It does not change the production Claude prompt or call Claude.",
    "",
    "## Signal Event Payload",
    "",
    "- Mode: `signal_event`.",
    "- Includes UTC date/time, evidence window start/end, direction, signals count, Avg Change, signal strength, Range Position, per-symbol Window Change, macro alignment, and source route hints.",
    "- Includes table highlight metadata for lead mover and strongest Peak 15m diagnostics.",
    "- Peak 15m and lead mover are supporting diagnostics, not the main event headline.",
    "- Main event evidence is the evidence window, Avg Change, Signals, and Range Position.",
    "- Claude should not over-focus on one 15-minute candle unless the event is macro-aligned or a sharp impulse.",
    "- Claude should classify the signal as Focused Cause, Likely Cause, Market Backdrop, No Clear Cause, or Claude Limited.",
    "- Source tags should map to Focused catalyst source, Likely cause source, Backdrop source, and Price check source.",
    "- Claude must not force a cause, provide trading advice, or return non-JSON prose.",
    "",
    `Current local payload count: ${signalPayloads.length}`,
    "",
    "## Daily Overview Payload",
    "",
    "- Mode: `daily_overview`.",
    "- Includes UTC date, 24h Change, market tone, notable symbols, daily range, same-day signal events, and source query hints.",
    "- Claude should summarize the day's market context using relevant public sources.",
    "- Daily Overview labels are separate from Signal Event labels.",
    "- Do not classify the Daily Overview itself with Focused Cause or Likely Cause unless referring to a specific included Signal Event.",
    "- Claude must not provide trading advice or return non-JSON prose.",
    "",
    `Current local payload count: ${dailyPayloads.length}`,
    "",
    "## Daily Overview Claude Usage Model",
    "",
    "- Initial 30-day backfill: generate a Claude Daily Overview for every UTC day in the visible window.",
    "- Ongoing production: generate one Claude Daily Overview after each UTC day closes.",
    "- Suggested schedule: after 00:30 UTC, or after daily cleanup if that creates a cleaner operational sequence.",
    "- Daily Overview should be included in the same future `GET /api/intelligence/feed` endpoint.",
    "- Daily Overview should not replace Signal Events.",
    "- Signal Event and Daily Overview should use different labels and different prompt modes.",
    "",
    "## Output Expectations",
    "",
    "- Return JSON only.",
    "- Preserve source links separately from generated summaries.",
    "- Keep source claims source-backed.",
    "- Use No Clear Cause or market context language when no specific cause is supported.",
    "- Avoid trading/advice wording.",
    "",
  ].join("\n");
}

export async function runClaudePayloads(options, { logger = console } = {}) {
  const dailyOverviews = (await readJson(options.dailyOverviewPath)).items ?? [];
  const signalEvents = (await readJson(options.signalEventsPath)).events ?? [];
  const payloads = buildClaudePayloads({ dailyOverviews, signalEvents });

  await writeJson(options.signalOutputPath, {
    generated_at: new Date().toISOString(),
    item_count: payloads.signalPayloads.length,
    items: payloads.signalPayloads,
  });
  await writeJson(options.dailyOutputPath, {
    generated_at: new Date().toISOString(),
    item_count: payloads.dailyPayloads.length,
    items: payloads.dailyPayloads,
  });
  await writeText(options.designOutputPath, designMarkdown(payloads));
  logger.log(
    `Claude payloads complete: ${payloads.signalPayloads.length} signal, ${payloads.dailyPayloads.length} daily.`,
  );

  return payloads;
}

export function parseArgs(argv = process.argv.slice(2)) {
  return {
    dailyOverviewPath: readOption(argv, "--daily") ?? DAILY_OVERVIEWS_PATH,
    signalEventsPath: readOption(argv, "--events") ?? VNEXT_B_EVENTS_PATH,
    signalOutputPath:
      readOption(argv, "--signal-output") ?? CLAUDE_SIGNAL_PAYLOADS_PATH,
    dailyOutputPath:
      readOption(argv, "--daily-output") ?? CLAUDE_DAILY_PAYLOADS_PATH,
    designOutputPath:
      readOption(argv, "--design-output") ?? CLAUDE_PAYLOAD_DESIGN_PATH,
  };
}

if (isMain(import.meta.url)) {
  runClaudePayloads(parseArgs()).catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Claude payload build failed.",
    );
    process.exitCode = 1;
  });
}
