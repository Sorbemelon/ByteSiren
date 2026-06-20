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
import { DAY_STORIES_JSON_PATH } from "./generate-day-stories.mjs";
import { VNEXT_C_EVENTS_PATH } from "./run-vnext-c.mjs";
import {
  dailyClaudePayload,
  signalClaudePayload,
} from "./build-feed-contract.mjs";

export const CLAUDE_SIGNAL_PAYLOADS_PATH = `${OUTPUTS_DIR}/claude_payload_signal_events.json`;
export const CLAUDE_DAILY_PAYLOADS_PATH = `${OUTPUTS_DIR}/claude_payload_daily_overviews.json`;
export const CLAUDE_PAYLOAD_DESIGN_PATH = `${OUTPUTS_DIR}/claude_payload_design.md`;
export const CLAUDE_SIGNAL_PROMPT_PATH = `${OUTPUTS_DIR}/claude_prompt_signal_event_v02.md`;
export const CLAUDE_DAILY_PROMPT_PATH = `${OUTPUTS_DIR}/claude_prompt_daily_overview_v02.md`;

export function buildClaudePayloads({
  dailyOverviews,
  signalEvents,
  dayStories = [],
}) {
  const publicSignals = signalEvents.filter((event) => event.publish_candidate);
  const auditEvents = signalEvents.filter((event) => !event.publish_candidate);
  const signalPayloads = publicSignals.map(signalClaudePayload);
  const dailyPayloads = dailyOverviews.map((overview) => {
    const dayEvents = publicSignals.filter(
      (event) => event.window_start.slice(0, 10) === overview.date_utc,
    );
    const dayMarketStories = dayStories.filter(
      (story) => story.anchor_date_utc === overview.date_utc,
    );
    const dayAuditEvents = auditEvents.filter(
      (event) => event.window_start.slice(0, 10) === overview.date_utc,
    );
    return dailyClaudePayload(
      overview,
      dayEvents,
      dayMarketStories,
      dayAuditEvents,
    );
  });

  return {
    signalPayloads,
    dailyPayloads,
  };
}

function signalPromptMarkdown() {
  return [
    "# Signal Event Claude Prompt v0.2",
    "",
    "Mode: `signal_event`.",
    "",
    "Use the payload's exact UTC evidence window. If macro context may matter, also use the provided ET conversion.",
    "",
    "Search goal:",
    "- Find public context tied to the compact evidence window.",
    "- Attempt event-specific source matching first.",
    "- Use chart context only as descriptive evidence, not as proof of cause.",
    "- Do not infer a news cause from chart pattern alone.",
    "- If no time-aligned source supports a cause, return Market Backdrop or No Clear Cause.",
    "- Do not force a cause.",
    "- Do not provide trading advice, forecasts, price targets, or recommendations.",
    "- Return JSON only.",
    "",
    "Allowed public labels:",
    "- Focused Cause",
    "- Likely Cause",
    "- Market Backdrop",
    "- No Clear Cause",
    "- Claude Limited",
    "",
    "Source tags:",
    "- Focused catalyst source",
    "- Likely cause source",
    "- Backdrop source",
    "- Price check source",
    "",
    "Source rules:",
    "- Focused Cause requires at least one Focused catalyst source.",
    "- Likely Cause requires at least one Focused catalyst source or Likely cause source.",
    "- If only Backdrop sources remain, return Market Backdrop.",
    "- Price check source confirms levels or movement but does not explain cause.",
    "- Rejected, low-quality, stale, conflicting, or generic root URLs must not be public.",
    "",
    "Return a single JSON object that matches the future brief schema.",
    "",
  ].join("\n");
}

function dailyPromptMarkdown() {
  return [
    "# Daily Overview Claude Prompt v0.2",
    "",
    "Mode: `daily_overview`.",
    "",
    "Search goal:",
    "- Summarize the UTC day's public crypto market context.",
    "- Use relevant public sources for that UTC day.",
    "- Include major macro, regulatory, exchange, project, or broad market context only when source-supported.",
    "- Mention if no major public driver is found.",
    "- Do not force a cause.",
    "- Do not classify the whole day as Focused Cause or Likely Cause.",
    "- Use Daily Overview labels, not Signal Event cause labels.",
    "- Do not provide trading advice, forecasts, price targets, or recommendations.",
    "- Return JSON only.",
    "",
    "Suggested Daily Overview labels:",
    "- Daily Context",
    "- Quiet Day",
    "- Mixed Day",
    "- Volatile Day",
    "- Risk-on Day",
    "- Risk-off Day",
    "- No Major Driver",
    "- Claude Limited",
    "",
    "Source tags:",
    "- Main daily context source",
    "- Supporting daily source",
    "- Price check source",
    "- Backdrop source",
    "",
    "Rejected, low-quality, stale, conflicting, or generic root URLs must not be public.",
    "",
  ].join("\n");
}

function designMarkdown({ signalPayloads, dailyPayloads }) {
  return [
    "# v0.2 Claude Payload Design",
    "",
    "This is a local-only proposal for future prompt inputs. It does not change the production Claude prompt or call Claude.",
    "",
    "Claude is designed for two future feed modes only: Signal Event and Daily Overview. Market Story is deterministic-only.",
    "",
    "## Signal Event Payload",
    "",
    "- Mode: `signal_event`.",
    "- Uses Claude.",
    "- Compact evidence-window context.",
    "- Event-specific source search.",
    "- Includes UTC date/time, evidence window start/end, direction, Signals, Avg Change, event strength, Range Position, per-symbol Window Change, macro alignment, source route hints, and suggested search queries.",
    "- Includes chart context fields: chart_context_label, event_story_type, trend_context, momentum_context, volatility_context, event_range_context, chart_context_reasons, and chart_context_warnings.",
    "- Includes table-highlight metadata for lead mover and strongest Peak 15m diagnostics.",
    "- Chart context is descriptive market structure, not trading advice or cause proof.",
    "- Range Position is not support/resistance advice.",
    "- Claude should use chart context to decide search route, but must not infer cause from chart context alone.",
    "- If no source supports a cause, return No Clear Cause or Market Backdrop instead of forcing a narrative.",
    "- Peak 15m and lead mover are supporting diagnostics, not the main event headline.",
    "- Main event evidence is the evidence window, Avg Change, Signals, and Range Position.",
    "- Claude should classify the signal as Focused Cause, Likely Cause, Market Backdrop, No Clear Cause, or Claude Limited.",
    "- Source tags should map to Focused catalyst source, Likely cause source, Backdrop source, and Price check source.",
    "- Focused Cause requires at least one Focused catalyst source.",
    "- Likely Cause requires at least one Focused catalyst source or Likely cause source.",
    "- If only Backdrop sources remain, status should become Market Backdrop.",
    "- Price check source confirms levels/move but does not explain cause.",
    "- Rejected, low-quality, stale, conflicting, or generic root URLs must not be public.",
    "- Claude must not provide trading advice or return non-JSON prose.",
    "",
    `Current local payload count: ${signalPayloads.length}`,
    "",
    "## Daily Overview Payload",
    "",
    "- Mode: `daily_overview`.",
    "- Uses Claude.",
    "- Full UTC-day context.",
    "- Includes UTC date, 24h Change, market tone, notable symbols, daily range, same-day Signal Event IDs, Market Story IDs for the day, audit-event count, and source query hints.",
    "- Claude should summarize the day's market context using relevant public sources.",
    "- Daily Overview labels are separate from Signal Event labels.",
    "- Do not classify the Daily Overview itself with Focused Cause or Likely Cause.",
    "- Suggested labels: Daily Context, Quiet Day, Mixed Day, Volatile Day, Risk-on Day, Risk-off Day, No Major Driver, Claude Limited.",
    "- Source tags should map to Main daily context source, Supporting daily source, Price check source, and Backdrop source.",
    "- Claude must not provide trading advice or return non-JSON prose.",
    "",
    `Current local payload count: ${dailyPayloads.length}`,
    "",
    "## Market Story",
    "",
    "- Mode: deterministic chart-pattern context only.",
    "- Does NOT use Claude.",
    "- Does NOT have Claude status, Claude source tags, source placeholders, or a Claude payload.",
    "- Standalone feed section.",
    "- Does not nest Signal Event cards.",
    "- Supports broader chart-pattern context around Signal Events and audit-only detections.",
    "- Uses deterministic fields such as Story window, Swing Change, Pattern, Range/trend/momentum/volatility context, and decision reasons.",
    "- It can appear publicly only when the existing Market Story criteria pass.",
    "- Daily Overview already covers day-level Claude context, so Market Story should not ask Claude for another narrative.",
    "",
    "## Daily Overview Claude Usage Model",
    "",
    "- Initial 30-day backfill: generate a Claude Daily Overview for every UTC day in the visible window.",
    "- Ongoing production: generate one Claude Daily Overview after each UTC day closes.",
    "- Suggested schedule: after 00:30 UTC, or after daily cleanup if that creates a cleaner operational sequence.",
    "- Daily Overview should be included in the same future `GET /api/intelligence/feed` endpoint.",
    "- Daily Overview should not replace Signal Events.",
    "- Signal Event and Daily Overview should use different labels and different prompt modes.",
    "- Market Story remains deterministic and is not part of the Claude usage model.",
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
  const dailyOverviews =
    (await readJson(options.dailyOverviewPath)).items ?? [];
  let dayStories = [];
  try {
    dayStories = (await readJson(options.dayStoriesPath)).items ?? [];
  } catch {
    dayStories = [];
  }
  const signalEvents = (await readJson(options.signalEventsPath)).events ?? [];
  const payloads = buildClaudePayloads({
    dailyOverviews,
    signalEvents,
    dayStories,
  });

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
  await writeText(options.signalPromptOutputPath, signalPromptMarkdown());
  await writeText(options.dailyPromptOutputPath, dailyPromptMarkdown());
  logger.log(
    `Claude payloads complete: ${payloads.signalPayloads.length} signal, ${payloads.dailyPayloads.length} daily, 0 market story.`,
  );

  return payloads;
}

export function parseArgs(argv = process.argv.slice(2)) {
  return {
    dailyOverviewPath: readOption(argv, "--daily") ?? DAILY_OVERVIEWS_PATH,
    dayStoriesPath: readOption(argv, "--stories") ?? DAY_STORIES_JSON_PATH,
    signalEventsPath: readOption(argv, "--events") ?? VNEXT_C_EVENTS_PATH,
    signalOutputPath:
      readOption(argv, "--signal-output") ?? CLAUDE_SIGNAL_PAYLOADS_PATH,
    dailyOutputPath:
      readOption(argv, "--daily-output") ?? CLAUDE_DAILY_PAYLOADS_PATH,
    designOutputPath:
      readOption(argv, "--design-output") ?? CLAUDE_PAYLOAD_DESIGN_PATH,
    signalPromptOutputPath:
      readOption(argv, "--signal-prompt-output") ?? CLAUDE_SIGNAL_PROMPT_PATH,
    dailyPromptOutputPath:
      readOption(argv, "--daily-prompt-output") ?? CLAUDE_DAILY_PROMPT_PATH,
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
