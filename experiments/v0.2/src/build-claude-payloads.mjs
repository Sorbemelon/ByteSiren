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
  dayStoryClaudePayload,
  dailyClaudePayload,
  signalClaudePayload,
} from "./build-feed-contract.mjs";

export const CLAUDE_SIGNAL_PAYLOADS_PATH = `${OUTPUTS_DIR}/claude_payload_signal_events.json`;
export const CLAUDE_DAILY_PAYLOADS_PATH = `${OUTPUTS_DIR}/claude_payload_daily_overviews.json`;
export const CLAUDE_MARKET_STORY_PAYLOADS_PATH = `${OUTPUTS_DIR}/claude_payload_market_stories.json`;
export const CLAUDE_PAYLOAD_DESIGN_PATH = `${OUTPUTS_DIR}/claude_payload_design.md`;

export function buildClaudePayloads({
  dailyOverviews,
  signalEvents,
  dayStories = [],
}) {
  const publicSignals = signalEvents.filter((event) => event.publish_candidate);
  const signalPayloads = publicSignals.map(signalClaudePayload);
  const dayStoryPayloads = dayStories.map(dayStoryClaudePayload);
  const dailyPayloads = dailyOverviews.map((overview) => {
    const dayEvents = publicSignals.filter(
      (event) => event.window_start.slice(0, 10) === overview.date_utc,
    );
    return dailyClaudePayload(overview, dayEvents);
  });

  return {
    signalPayloads,
    dayStoryPayloads,
    dailyPayloads,
  };
}

function designMarkdown({ signalPayloads, dayStoryPayloads, dailyPayloads }) {
  return [
    "# v0.2 Claude Payload Design",
    "",
    "This is a local-only proposal for future prompt inputs. It does not change the production Claude prompt or call Claude.",
    "",
    "## Signal Event Payload",
    "",
    "- Mode: `signal_event`.",
    "- Includes UTC date/time, evidence window start/end, direction, signals count, Avg Change, signal strength, Range Position, per-symbol Window Change, macro alignment, and source route hints.",
    "- Includes chart_context_label, event_story_type, trend_context, momentum_context, volatility_context, event_range_context, chart_context_reasons, and chart_context_warnings.",
    "- Includes table highlight metadata for lead mover and strongest Peak 15m diagnostics.",
    "- Chart context is descriptive market structure, not trading advice or cause proof.",
    "- Range Position is not support/resistance advice.",
    "- Claude should use chart context to decide how hard to search and what route to try.",
    "- Gate search effort by source_likelihood: high -> search harder and expect Focused/Likely; low -> No Clear Cause is acceptable and preferred over forcing a narrative.",
    "- history_support_type names the prior-chart structure that supports the event (range break, compression breakout, trend continuation, relief reversal).",
    "- retrospective_post_window stats are post-event only and must never be treated as the cause or as detection evidence.",
    "- If no source supports a cause, return No Clear Cause or Market Backdrop.",
    "- Peak 15m and lead mover are supporting diagnostics, not the main event headline.",
    "- Main event evidence is the evidence window, Avg Change, Signals, and Range Position.",
    "- Claude should not over-focus on one 15-minute candle unless the event is macro-aligned or a sharp impulse.",
    "- Claude should classify the signal as Focused Cause, Likely Cause, Market Backdrop, No Clear Cause, or Claude Limited.",
    "- Source tags should map to Focused catalyst source, Likely cause source, Backdrop source, and Price check source.",
    "- Claude must not force a cause, provide trading advice, or return non-JSON prose.",
    "",
    `Current local payload count: ${signalPayloads.length}`,
    "",
    "## Market Story Payload",
    "",
    "- Mode: `market_story`.",
    "- Includes the story window, anchor UTC day, included Signal Event IDs, included audit-event IDs, supporting audit-event IDs, direction, Swing Change, and story context label.",
    "- Uses one selected story_context_label for the Market Story; structural scores remain diagnostics, not extra public labels.",
    "- Includes story_window_context and story_label_decision_reasons so Claude can see how the full candle path influenced the single Market Story label.",
    "- Includes adaptive gap metadata so Claude can see whether the story was bridged by chart context rather than a fixed clock rule.",
    "- Includes primary_story_family, story_context_scores, two_sided_swing, and minimum_story_range so Claude can see the headline direction, structural family, and why the wrapper is broader than a single Signal Event.",
    "- Market Stories are multi-swing context wrappers and can cross UTC day boundaries.",
    "- Market Stories may be signal-only, mixed signal/audit, or audit-only when strong audit detections form the full sequence.",
    "- Audit-only Market Stories require strong chart context and no full market reset across the adaptive bridge.",
    "- A one Signal Event plus one audit-event sequence can qualify when chart context is strong.",
    "- Audit-only detections can be story members without becoming standalone public Signal Events.",
    "- Market Stories appear on the UTC day where the first trigger starts.",
    "- Claude should summarize the chart-context sequence only and should not infer a news cause from chart context alone.",
    "- Claude must not provide trading advice or return non-JSON prose.",
    "",
    `Current local payload count: ${dayStoryPayloads.length}`,
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
  await writeJson(options.dayStoryOutputPath, {
    generated_at: new Date().toISOString(),
    item_count: payloads.dayStoryPayloads.length,
    items: payloads.dayStoryPayloads,
  });
  await writeText(options.designOutputPath, designMarkdown(payloads));
  logger.log(
    `Claude payloads complete: ${payloads.signalPayloads.length} signal, ${payloads.dayStoryPayloads.length} market story, ${payloads.dailyPayloads.length} daily.`,
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
    dayStoryOutputPath:
      readOption(argv, "--story-output") ?? CLAUDE_MARKET_STORY_PAYLOADS_PATH,
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
