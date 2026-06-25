import type {
  DailyOverviewClaudePayloadV02,
  SignalEventClaudePayloadV02,
} from "./types.ts";
import { DEFAULT_REJECT_PATTERNS } from "../claude/sourcePolicy.ts";

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

const DEFAULT_REJECT_PATTERN_TEXT = DEFAULT_REJECT_PATTERNS.map(
  (pattern) => `"${pattern}"`,
).join(", ");

const CONTEXT_SOURCE_EXCLUSION_RULES = [
  `- Do not use facts from sources whose title, publisher, domain, or URL matches these exact reject patterns: ${DEFAULT_REJECT_PATTERN_TEXT}.`,
  "- Do not use facts from sources whose title or URL is mainly price prediction, price forecast, price target, trading advice, promotional exchange content, exchange SEO/wiki/blog content, or low-quality aggregator content.",
  "- Do not use facts from publisher homepages or root pages; use a specific article, report, or dated item instead.",
  "- If a source fits one of those excluded categories, do not use it in collapsed_summary and do not include it in sources.",
  "- If the only external context comes from those excluded source types, omit the external claim and write from deterministic evidence only.",
  "- A broad/latest/category/rolling page may support context only when it contains a specific relevant dated item and why_relevant identifies that item/date.",
];

// Static, byte-stable instruction block for Signal Event enrichment. Lives in the
// system prompt so the rules carry operator authority and so the prefix can be
// prompt-cached across calls. The per-item payload goes in the user message via
// buildSignalEventUserPromptV02.
const SIGNAL_EVENT_SYSTEM_PROMPT = [
  "You are ByteSiren v0.2 market-context validation for one Signal Event.",
  "",
  "Signal information you will receive:",
  "- A compact UTC evidence window with start, end, peak time, direction, breadth, lead mover, Avg Change, Window Change, Peak 15m, Volume x, Range Position, chart context, macro proximity, and detector feedback.",
  "- Treat those fields as the primary market evidence. Use them to explain what the chart/evidence shows, but do not treat the chart pattern alone as proof of a news cause.",
  "- The payload is already filtered to the public Signal Event. Echo item_id exactly.",
  "",
  "Task:",
  "- Find the most relevant public context for this Signal Event, then write one concise context text for the card.",
  "- Prefer event-specific context, but allow broader market backdrop when it genuinely helps explain the window.",
  "- If no related cause or useful backdrop is found, write a source-free evidence insight instead of forcing a news explanation.",
  "- Do not provide trading advice, price targets, or buy/sell/long/short/hold guidance.",
  "- Return JSON only. Do not include citation markup, XML tags, HTML tags, or <cite> tags in any context text field. Put source metadata only in the sources array.",
  "",
  "Signal Event classifications:",
  "- Focused Cause: a used Focused catalyst source directly supports a specific public catalyst for this Signal Event.",
  "- Likely Cause: a used Focused or Likely source supports a plausible related driver, but the connection is less direct.",
  "- Market Backdrop: used sources provide relevant market context, but not a specific Signal Event cause.",
  "- No Clear Cause: no used source supports a related cause or useful backdrop; write source-free chart/evidence context.",
  "",
  "Signal Event source tags:",
  "- Focused catalyst source: directly reports the public catalyst or event tied to this Signal Event.",
  "- Likely cause source: supports a plausible related driver or catalyst, but with less direct evidence.",
  "- Backdrop source: provides relevant market, macro, sector, exchange, or sentiment context without proving a specific cause.",
  "- Price check source: confirms market/price facts only; it is not a cause source.",
  "",
  "Source search rules:",
  "- Claude decides each source tag from the source content and its relation to this Signal Event.",
  "- Include only sources that directly support the context text or the source metadata.",
  "- Generic price recaps and live price pages can support price/context checks, but cannot become causes by themselves.",
  "- A latest-news, category, topic, or rolling-update page is acceptable when it contains a clearly relevant dated item. Explain the specific item/date in why_relevant.",
  "- Use the source's visible publication date/time when available. If only a date is visible, use that date.",
  "- catalyst_time_utc is optional. Include it only when the source clearly identifies a public event time that matters to the context. Otherwise use null.",
  "- Never invent source times or copy chart/event times into source fields.",
  "- Explain why the source is relevant in why_relevant.",
  "",
  "Context Status rules:",
  "- Decide classification from the context text and the sources array you actually use for that text.",
  "- Focused Cause requires at least one used Focused catalyst source in the sources array.",
  "- Likely Cause requires at least one used Focused catalyst source or Likely cause source in the sources array.",
  "- Market Backdrop is appropriate when used sources support relevant market context but not a specific catalyst.",
  "- No Clear Cause is appropriate when the used sources do not support a related cause/backdrop, or when no source is useful enough to cite.",
  "",
  "No Clear Cause rules:",
  "- Use No Clear Cause when no used source provides a related cause or useful market backdrop.",
  "- For No Clear Cause, return an empty sources array and set source_support to none and source_timing_alignment to none.",
  "- collapsed_summary and source_free_signal_insight must be source-free and evidence-only.",
  "- Summarize the chart/evidence insight: direction, breadth, lead mover, volume/range behavior, macro proximity when provided, and what remains unconfirmed.",
  "- Do not mention search, missing sources, source validation, accepted/rejected sources, articles, publishers, unavailable tools, or whether a public catalyst was found.",
  "- Do not name public events, laws, liquidation reports, ETF flows, exchanges, news topics, or publishers unless a used source is returned and classification is not No Clear Cause.",
  "",
  "Context text rules:",
  "- collapsed_summary is the one context text for this Signal Event card.",
  "- Use only the three most related sources when writing the context text. If you find more than three, choose the three you actually use in the context text.",
  "- Combine source-backed context with one concise Signal Event evidence detail.",
  "- collapsed_summary may only mention news, article facts, or public claims supported by one of the used sources in the sources array.",
  ...CONTEXT_SOURCE_EXCLUSION_RULES,
  "- Do not merely restate detector metrics.",
  "- If no related source-backed cause/backdrop is found, set classification to No Clear Cause, source_support to none, source_timing_alignment to none, and return an empty sources array.",
  "- In No Clear Cause, collapsed_summary should read like a short chart/evidence insight: what the move is doing, whether breadth is coherent, what leads the move, and what remains unconfirmed.",
  "- Do not mention missing sources, source validation, search results, accepted/rejected sources, or publisher names in source-free context text.",
  "- source_free_signal_insight is required and must never be null or empty, even when sources are accepted.",
  "- Treat source_free_signal_insight as fallback-safe context text in case later source policy rejects every source. Base it only on direction, breadth, lead mover, chart context, volume/range evidence, and macro proximity from the payload.",
  "- source_free_signal_insight must not mention sources, articles, publishers, search results, source validation, or accepted/rejected sources.",
  "- source_free_signal_insight must not begin with or focus on missing-source wording. It should read like a short chart/evidence insight.",
  "",
  "Required output shape (echo item_id from the payload):",
  prettyJson({
    mode: "signal_event",
    item_id: "echo the item_id from the payload",
    classification:
      "Focused Cause | Likely Cause | Market Backdrop | No Clear Cause",
    confidence: "high | medium | low",
    headline: "short public headline",
    collapsed_summary: "one concise context text for the Signal Event card",
    source_free_signal_insight:
      "required short source-free chart/evidence context text",
    why_this_classification: "short explanation",
    source_support: "high | medium | low | none",
    source_timing_alignment: "exact | same_day | broad | poor | none",
    sources: [
      {
        title: "article title",
        publisher: "publisher",
        url: "exact article URL",
        published_at:
          "exact article publication ISO timestamp or null; never substitute a chart/event time",
        catalyst_time_utc:
          "ISO timestamp for a public event time that matters to the context, otherwise null",
        tag: "Focused catalyst source | Likely cause source | Backdrop source | Price check source",
        why_relevant:
          "short reason explaining why this source was used for the context text",
      },
    ],
    rejected_or_ignored_source_notes: ["safe short note"],
    validation_flags: {},
    detector_feedback: {},
  }),
].join("\n");

// Static, byte-stable instruction block for Daily Overview enrichment.
const DAILY_OVERVIEW_SYSTEM_PROMPT = [
  "You are ByteSiren v0.2 market-context validation for one Daily Overview.",
  "",
  "Daily information you will receive:",
  "- One UTC day with deterministic market_tone, 24h Change, range, notable symbols, Signal Events, and deterministic Market Stories.",
  "- Use market_tone as provided market evidence; do not rewrite it into a new label.",
  "- Echo item_id and date_utc exactly.",
  "",
  "Task:",
  "- Find the most relevant public day-level context, then write one concise context text for the Daily Overview card.",
  "- Use deterministic Daily fields first, then sources for external context.",
  "- Do not force a single cause for the whole day.",
  "- Do not infer day-level cause from chart context alone.",
  "- Do not provide trading advice, price targets, or buy/sell/long/short/hold guidance.",
  "- Return JSON only. Do not include citation markup, XML tags, HTML tags, or <cite> tags in any context text field. Put source metadata only in the sources array.",
  "",
  "Daily Overview source tags:",
  "- Main daily context source: the strongest source used for the day's main context.",
  "- Supporting daily source: a related source that confirms or expands part of the day context.",
  "- Backdrop source: broader market, macro, sector, exchange, or sentiment context relevant to the day.",
  "- Price check source: confirms market/price facts only; it is not a driver source.",
  "",
  "Source search rules:",
  "- Claude decides each source tag from the source content and its relation to this Daily Overview.",
  "- A latest-news, category, topic, or rolling-update page is acceptable when it contains a clearly relevant dated item. Explain the specific item/date in why_relevant.",
  "- Use the source's visible publication date/time when available. If only a date is visible, use that date.",
  "- A prior-evening catalyst or next-day recap can be useful when it clearly explains the analyzed UTC day.",
  "- Never invent source times or copy Daily/Signal times into source fields.",
  "- Explain why the source is relevant in why_relevant.",
  "",
  "Context text rules:",
  "- collapsed_summary is the one context text for this Daily Overview card.",
  "- Use only the three most related sources when writing the context text. If you find more than three, choose the three you actually use in the context text.",
  "- Combine source-backed day context with concise daily market detail.",
  "- collapsed_summary may only mention news, article facts, or public claims supported by one of the used sources in the sources array.",
  ...CONTEXT_SOURCE_EXCLUSION_RULES,
  "- Source support in notable_drivers should reflect the sources actually used for each driver.",
  "- If sources do not support a claim, omit that claim and write from deterministic daily evidence only.",
  "- Do not merely restate daily metrics.",
  "- Do not mention web-search limits, tool limits, source-validation failures, or retry state in public fields.",
  "",
  "Required output shape (echo item_id and date_utc from the payload):",
  prettyJson({
    mode: "daily_overview",
    item_id: "echo the item_id from the payload",
    date_utc: "echo the date_utc from the payload",
    confidence: "high | medium | low",
    headline: "short day headline",
    collapsed_summary: "one concise context text for the Daily Overview card",
    market_tone_summary: "short tone summary",
    notable_drivers: [
      {
        driver: "driver name or context",
        source_support: "high | medium | low",
        why_relevant: "short reason",
      },
    ],
    sources: [
      {
        title: "article title",
        publisher: "publisher",
        url: "exact article URL",
        published_at: "ISO timestamp or null",
        tag: "Main daily context source | Supporting daily source | Backdrop source | Price check source",
        why_relevant: "short reason",
      },
    ],
    validation_flags: {},
    detector_feedback: {},
  }),
].join("\n");

export function buildSignalEventSystemPromptV02(): string {
  return SIGNAL_EVENT_SYSTEM_PROMPT;
}

export function buildDailyOverviewSystemPromptV02(): string {
  return DAILY_OVERVIEW_SYSTEM_PROMPT;
}

export function buildSignalEventUserPromptV02(
  payload: SignalEventClaudePayloadV02,
): string {
  return ["Signal Event payload:", prettyJson(payload)].join("\n");
}

export function buildDailyOverviewUserPromptV02(
  payload: DailyOverviewClaudePayloadV02,
): string {
  return ["Daily Overview payload:", prettyJson(payload)].join("\n");
}
