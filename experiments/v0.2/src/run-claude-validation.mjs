#!/usr/bin/env node

import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  EXPERIMENT_ROOT,
  isMain,
  readJson,
  readOption,
  writeJson,
  writeText,
} from "./shared.mjs";
import {
  CLAUDE_DAILY_PAYLOADS_PATH,
  CLAUDE_SIGNAL_PAYLOADS_PATH,
} from "./build-claude-payloads.mjs";

export const VALIDATION_ROOT = path.join(
  EXPERIMENT_ROOT,
  "claude-validation",
);
export const VALIDATION_INPUTS_DIR = path.join(VALIDATION_ROOT, "inputs");
export const VALIDATION_PROMPTS_DIR = path.join(VALIDATION_ROOT, "prompts");
export const VALIDATION_OUTPUTS_DIR = path.join(VALIDATION_ROOT, "outputs");
export const VALIDATION_CACHE_DIR = path.join(VALIDATION_ROOT, "cache");
export const VALIDATION_SIGNAL_INPUT_PATH = path.join(
  VALIDATION_INPUTS_DIR,
  "signal_events.json",
);
export const VALIDATION_DAILY_INPUT_PATH = path.join(
  VALIDATION_INPUTS_DIR,
  "daily_overviews.json",
);
export const VALIDATION_SIGNAL_PROMPT_PATH = path.join(
  VALIDATION_PROMPTS_DIR,
  "signal_event_prompt.md",
);
export const VALIDATION_DAILY_PROMPT_PATH = path.join(
  VALIDATION_PROMPTS_DIR,
  "daily_overview_prompt.md",
);

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_TOOL_TYPE = "web_search_20250305";
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TIMEOUT_MS = 120_000;
const SOURCE_DATE_WINDOW_DAYS = 3;

export const SIGNAL_CLASSIFICATIONS = [
  "Focused Cause",
  "Likely Cause",
  "Market Backdrop",
  "No Clear Cause",
  "Claude Limited",
];

export const DAILY_LABELS = [
  "Daily Context",
  "Quiet Day",
  "Mixed Day",
  "Volatile Day",
  "Risk-on Day",
  "Risk-off Day",
  "No Major Driver",
  "Claude Limited",
];

export const SIGNAL_SOURCE_TAGS = [
  "Focused catalyst source",
  "Likely cause source",
  "Backdrop source",
  "Price check source",
];

export const DAILY_SOURCE_TAGS = [
  "Main daily context source",
  "Supporting daily source",
  "Backdrop source",
  "Price check source",
];

const LOW_QUALITY_SOURCE_PATTERNS = [
  "price prediction",
  "forecast",
  "price target",
  "why-is-crypto",
  "coindcx.com/blog",
  "bitcoinfoundation.org/news",
  "tradingkey",
  "intellectia",
  "mexc/news",
  "bitget/wiki",
  "stealthex",
  "-price-prediction-",
];

const SYSTEM_PROMPT = [
  "You are a market-intelligence validation analyst for ByteSiren.",
  "ByteSiren is a public read-only crypto market intelligence dashboard.",
  "Use public web sources to validate context, not to create trading advice.",
  "Do not invent a cause and do not infer cause from chart context alone.",
  "Return one valid JSON object only.",
].join(" ");

function flag(argv, name) {
  return argv.includes(name);
}

function integerOption(argv, name, fallback) {
  const value = readOption(argv, name);
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function csvOption(argv, name) {
  const value = readOption(argv, name);
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function envCsv(value) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function arrayFromPayloadDoc(doc) {
  if (Array.isArray(doc)) {
    return doc;
  }

  if (Array.isArray(doc.items)) {
    return doc.items;
  }

  if (Array.isArray(doc.payloads)) {
    return doc.payloads;
  }

  return [];
}

function signalId(payload) {
  return payload.event_id ?? payload.id ?? null;
}

function dailyId(payload) {
  return payload.item_id ?? payload.id ?? `daily_${payload.date_utc}`;
}

function itemId(mode, payload) {
  return mode === "signal" ? signalId(payload) : dailyId(payload);
}

function safeFileName(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 160);
}

function utcDateForPayload(mode, payload) {
  if (mode === "signal") {
    return payload.evidence_window?.start ?? payload.date_utc;
  }

  return payload.date_utc ?? payload.day_start;
}

function itemSortTime(mode, payload) {
  const iso =
    mode === "signal"
      ? payload.evidence_window?.start
      : payload.day_start ?? `${payload.date_utc}T00:00:00.000Z`;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const live = flag(argv, "--live");
  const dryRun = flag(argv, "--dry-run") || !live;

  if (live && flag(argv, "--dry-run")) {
    throw new Error("Choose either --dry-run or --live, not both.");
  }

  const mode = readOption(argv, "--mode") ?? "all";

  if (!["signal", "daily", "all"].includes(mode)) {
    throw new Error("--mode must be signal, daily, or all.");
  }

  return {
    mode,
    dryRun,
    live,
    limit: integerOption(argv, "--limit", 0),
    ids: csvOption(argv, "--ids"),
    resume: flag(argv, "--resume"),
    force: flag(argv, "--force"),
    maxSearchesSignal: integerOption(argv, "--max-searches-signal", 3),
    maxSearchesDaily: integerOption(argv, "--max-searches-daily", 3),
    outputDir: readOption(argv, "--output-dir") ?? VALIDATION_OUTPUTS_DIR,
    cacheDir: readOption(argv, "--cache-dir") ?? VALIDATION_CACHE_DIR,
    signalPayloadPath:
      readOption(argv, "--signal-payloads") ?? CLAUDE_SIGNAL_PAYLOADS_PATH,
    dailyPayloadPath:
      readOption(argv, "--daily-payloads") ?? CLAUDE_DAILY_PAYLOADS_PATH,
    signalPromptPath:
      readOption(argv, "--signal-prompt") ?? VALIDATION_SIGNAL_PROMPT_PATH,
    dailyPromptPath:
      readOption(argv, "--daily-prompt") ?? VALIDATION_DAILY_PROMPT_PATH,
    signalInputPath:
      readOption(argv, "--signal-input") ?? VALIDATION_SIGNAL_INPUT_PATH,
    dailyInputPath:
      readOption(argv, "--daily-input") ?? VALIDATION_DAILY_INPUT_PATH,
  };
}

export async function loadValidationInputs(options = {}) {
  const signalDoc = await readJson(
    options.signalPayloadPath ?? CLAUDE_SIGNAL_PAYLOADS_PATH,
  );
  const dailyDoc = await readJson(
    options.dailyPayloadPath ?? CLAUDE_DAILY_PAYLOADS_PATH,
  );
  const signalItems = arrayFromPayloadDoc(signalDoc).filter(
    (item) => item?.mode === "signal_event",
  );
  const dailyItems = arrayFromPayloadDoc(dailyDoc).filter(
    (item) => item?.mode === "daily_overview",
  );
  const excludedMarketStories = [
    ...arrayFromPayloadDoc(signalDoc),
    ...arrayFromPayloadDoc(dailyDoc),
  ].filter(
    (item) => item?.mode === "market_story" || item?.item_type === "market_story",
  );

  return {
    signalDoc,
    dailyDoc,
    signalItems,
    dailyItems,
    excludedMarketStories,
  };
}

export async function syncValidationWorkspace(inputs, options = {}) {
  await writeJson(options.signalInputPath ?? VALIDATION_SIGNAL_INPUT_PATH, {
    generated_at: new Date().toISOString(),
    source_path: path.relative(process.cwd(), CLAUDE_SIGNAL_PAYLOADS_PATH),
    item_count: inputs.signalItems.length,
    items: inputs.signalItems,
  });
  await writeJson(options.dailyInputPath ?? VALIDATION_DAILY_INPUT_PATH, {
    generated_at: new Date().toISOString(),
    source_path: path.relative(process.cwd(), CLAUDE_DAILY_PAYLOADS_PATH),
    item_count: inputs.dailyItems.length,
    items: inputs.dailyItems,
  });
}

async function readPrompt(filePath) {
  return readFile(filePath, "utf8");
}

function composePrompt(mode, promptMarkdown, payload) {
  const label = mode === "signal" ? "SIGNAL_EVENT_PAYLOAD" : "DAILY_OVERVIEW_PAYLOAD";
  return `${promptMarkdown.trim()}

${label}:
${JSON.stringify(payload, null, 2)}

Return JSON only.`;
}

function selectStrongSignals(signalItems, count) {
  return [...signalItems]
    .sort(
      (a, b) =>
        Number(b.event_strength_score ?? b.chart_context?.chart_context_score ?? 0) -
        Number(a.event_strength_score ?? a.chart_context?.chart_context_score ?? 0),
    )
    .slice(0, count);
}

function selectQuestionableSignals(signalItems, excludedIds, count) {
  return [...signalItems]
    .filter((item) => !excludedIds.has(signalId(item)))
    .sort((a, b) => {
      const aScore = Number(a.chart_context?.chart_context_score ?? 0);
      const bScore = Number(b.chart_context?.chart_context_score ?? 0);
      return aScore - bScore;
    })
    .slice(0, count);
}

function selectDailyByTone(dailyItems, count) {
  const selected = [];
  const seenTones = new Set();

  for (const item of dailyItems) {
    if (selected.length >= count) {
      break;
    }

    if (!seenTones.has(item.market_tone)) {
      seenTones.add(item.market_tone);
      selected.push(item);
    }
  }

  for (const item of dailyItems) {
    if (selected.length >= count) {
      break;
    }

    if (!selected.includes(item)) {
      selected.push(item);
    }
  }

  return selected;
}

export function selectValidationItems(inputs, options) {
  const idFilter = new Set(options.ids ?? []);
  const filterByIds = (mode, items) =>
    idFilter.size === 0
      ? items
      : items.filter((item) => idFilter.has(itemId(mode, item)));
  const signalItems = filterByIds("signal", inputs.signalItems);
  const dailyItems = filterByIds("daily", inputs.dailyItems);

  if (options.live && options.mode === "all" && options.limit === 5 && idFilter.size === 0) {
    const strongSignals = selectStrongSignals(signalItems, 2);
    const selectedSignalIds = new Set(strongSignals.map(signalId));
    const questionableSignals = selectQuestionableSignals(
      signalItems,
      selectedSignalIds,
      1,
    );
    const daily = selectDailyByTone(dailyItems, 2);

    return {
      signal: [...strongSignals, ...questionableSignals],
      daily,
    };
  }

  const limit = options.limit > 0 ? options.limit : null;

  if (options.mode === "signal") {
    return {
      signal: limit ? signalItems.slice(0, limit) : signalItems,
      daily: [],
    };
  }

  if (options.mode === "daily") {
    return {
      signal: [],
      daily: limit ? dailyItems.slice(0, limit) : dailyItems,
    };
  }

  const combined = [
    ...signalItems.map((item) => ({ mode: "signal", item })),
    ...dailyItems.map((item) => ({ mode: "daily", item })),
  ].sort((a, b) => itemSortTime(a.mode, a.item) - itemSortTime(b.mode, b.item));
  const selected = limit ? combined.slice(0, limit) : combined;

  return {
    signal: selected.filter((entry) => entry.mode === "signal").map((entry) => entry.item),
    daily: selected.filter((entry) => entry.mode === "daily").map((entry) => entry.item),
  };
}

function promptPreviewSection(mode, promptMarkdown, items) {
  if (items.length === 0) {
    return "_No items selected._\n";
  }

  return items
    .slice(0, 2)
    .map((item, index) => {
      const id = itemId(mode, item);
      return [
        `## Preview ${index + 1}: ${id}`,
        "",
        "```text",
        composePrompt(mode, promptMarkdown, item).slice(0, 8000),
        "```",
        "",
      ].join("\n");
    })
    .join("\n");
}

function validationPlanMarkdown(input) {
  const signalIds = input.selected.signal.map(signalId);
  const dailyIds = input.selected.daily.map((item) => dailyId(item));
  const estimated = signalIds.length + dailyIds.length;

  return [
    "# v0.2 Claude Validation Plan",
    "",
    `Generated at: ${new Date().toISOString()}`,
    `Mode: ${input.options.mode}`,
    `Dry run: ${input.options.dryRun}`,
    `Live requested: ${input.options.live}`,
    `Signal Event payloads available: ${input.inputs.signalItems.length}`,
    `Daily Overview payloads available: ${input.inputs.dailyItems.length}`,
    `Market Story standalone payloads excluded: ${input.inputs.excludedMarketStories.length}`,
    `Signal Events selected: ${signalIds.length}`,
    `Daily Overviews selected: ${dailyIds.length}`,
    `Estimated request count: ${estimated}`,
    "",
    "## Signal Event IDs",
    "",
    signalIds.length ? signalIds.map((id) => `- ${id}`).join("\n") : "- none",
    "",
    "## Daily Overview IDs",
    "",
    dailyIds.length ? dailyIds.map((id) => `- ${id}`).join("\n") : "- none",
    "",
    "## Safety",
    "",
    "- Default run is dry-run.",
    "- Market Story is not a standalone Claude validation input.",
    "- Audit Events are not standalone Claude validation inputs.",
    "- Live mode requires ANTHROPIC_API_KEY in the environment.",
    "- Secrets are not printed.",
    "",
  ].join("\n");
}

async function writeDryRunOutputs(input) {
  await mkdir(input.options.outputDir, { recursive: true });
  await writeText(
    path.join(input.options.outputDir, "dry_run_signal_prompts.md"),
    [
      "# Dry Run Signal Event Prompt Previews",
      "",
      promptPreviewSection("signal", input.signalPrompt, input.selected.signal),
    ].join("\n"),
  );
  await writeText(
    path.join(input.options.outputDir, "dry_run_daily_prompts.md"),
    [
      "# Dry Run Daily Overview Prompt Previews",
      "",
      promptPreviewSection("daily", input.dailyPrompt, input.selected.daily),
    ].join("\n"),
  );
  await writeText(
    path.join(input.options.outputDir, "validation_plan.md"),
    validationPlanMarkdown(input),
  );
}

function normalizeDomainFilter(value) {
  const trimmed = String(value ?? "").trim().toLowerCase();

  if (!trimmed) {
    return null;
  }

  try {
    const host = trimmed.includes("://") ? new URL(trimmed).hostname : trimmed;
    const normalized = host.replace(/^\*\./, "").split(/[/?#]/)[0].trim();

    if (
      !normalized ||
      normalized.includes(":") ||
      normalized.startsWith(".") ||
      normalized.endsWith(".") ||
      !normalized.includes(".") ||
      !/^[a-z0-9.-]+$/.test(normalized)
    ) {
      return null;
    }

    return normalized;
  } catch {
    return null;
  }
}

function normalizedDomains(domains) {
  return [
    ...new Set(domains.map(normalizeDomainFilter).filter((item) => item)),
  ];
}

function anthropicConfigFromEnv(env = process.env) {
  const allowedDomains = normalizedDomains(envCsv(env.CLAUDE_ALLOWED_DOMAINS));
  const blockedDomains =
    allowedDomains.length > 0
      ? []
      : normalizedDomains(envCsv(env.CLAUDE_BLOCKED_DOMAINS));

  return {
    apiKey: env.ANTHROPIC_API_KEY?.trim() ?? "",
    model: env.CLAUDE_MODEL?.trim() || DEFAULT_MODEL,
    toolType: env.CLAUDE_WEB_SEARCH_TOOL_TYPE?.trim() || DEFAULT_TOOL_TYPE,
    allowedDomains,
    blockedDomains,
  };
}

function buildAnthropicRequest({
  config,
  prompt,
  maxSearches,
}) {
  const tool = {
    type: config.toolType,
    name: "web_search",
    max_uses: maxSearches,
  };

  if (config.allowedDomains.length > 0) {
    tool.allowed_domains = config.allowedDomains;
  } else if (config.blockedDomains.length > 0) {
    tool.blocked_domains = config.blockedDomains;
  }

  return {
    model: config.model,
    max_tokens: DEFAULT_MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    tools: [tool],
  };
}

function parseAssistantText(raw) {
  const content = Array.isArray(raw?.content) ? raw.content : [];
  return content
    .map((block) => (typeof block?.text === "string" ? block.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function stripJsonFence(text) {
  const match = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : text.trim();
}

export function parseJsonObjectFromText(text) {
  const candidates = [
    stripJsonFence(text),
    text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1),
  ].filter((candidate) => candidate && candidate.includes("{"));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function countSearches(raw) {
  const usageCount = raw?.usage?.server_tool_use?.web_search_requests;

  if (Number.isFinite(usageCount)) {
    return usageCount;
  }

  let count = 0;

  function visit(value) {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (!value || typeof value !== "object") {
      return;
    }

    if (value.type === "server_tool_use" && value.name === "web_search") {
      count += 1;
    }

    Object.values(value).forEach(visit);
  }

  visit(raw);
  return count;
}

async function callAnthropic({ config, prompt, maxSearches, fetcher = fetch }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const body = buildAnthropicRequest({ config, prompt, maxSearches });

  try {
    const response = await fetcher(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Claude request failed with HTTP ${response.status}.`);
    }

    const raw = await response.json();
    const text = parseAssistantText(raw);
    const parsedJson = parseJsonObjectFromText(text);

    return {
      ok: Boolean(parsedJson),
      raw,
      text,
      json: parsedJson,
      searches_used: countSearches(raw),
      error: parsedJson ? null : "Claude response was not valid JSON.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function sourceText(source) {
  return `${source.publisher ?? ""} ${source.title ?? ""} ${source.url ?? ""}`;
}

export function isRootUrl(url) {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);

    if (segments.length === 0) {
      return true;
    }

    return (
      segments.length === 1 &&
      ["home", "homepage", "index", "index.html", "default.aspx"].includes(
        segments[0].toLowerCase(),
      )
    );
  } catch {
    return true;
  }
}

function sourceDateMismatch(source, eventDate) {
  if (!source.published_at || !eventDate) {
    return false;
  }

  const published = Date.parse(source.published_at);
  const event = Date.parse(eventDate);

  if (!Number.isFinite(published) || !Number.isFinite(event)) {
    return false;
  }

  const days = Math.abs(published - event) / (24 * 60 * 60 * 1000);
  return days > SOURCE_DATE_WINDOW_DAYS;
}

function isLowQualitySource(source, blockedDomains = []) {
  const lower = sourceText(source).toLowerCase();

  return [...LOW_QUALITY_SOURCE_PATTERNS, ...blockedDomains].some((pattern) =>
    lower.includes(pattern.toLowerCase().replaceAll("*", "")),
  );
}

export function validateSources(
  sources = [],
  { eventDate, blockedDomains = [] } = {},
) {
  const accepted = [];
  const rejected = [];
  const seen = new Set();

  for (const source of Array.isArray(sources) ? sources : []) {
    const url = typeof source?.url === "string" ? source.url.trim() : "";

    if (!url) {
      rejected.push({ reason: "missing_url", title: source?.title ?? null });
      continue;
    }

    let parsedUrl;

    try {
      parsedUrl = new URL(url);
    } catch {
      rejected.push({ reason: "invalid_url", url });
      continue;
    }

    if (isRootUrl(url)) {
      rejected.push({ reason: "root_or_homepage_url", url });
      continue;
    }

    if (isLowQualitySource(source, blockedDomains)) {
      rejected.push({ reason: "blocked_or_low_quality_source", url });
      continue;
    }

    if (sourceDateMismatch(source, eventDate)) {
      rejected.push({ reason: "source_timing_mismatch", url });
      continue;
    }

    const key = `${parsedUrl.hostname.toLowerCase()}${parsedUrl.pathname.toLowerCase()}${parsedUrl.search}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    accepted.push({
      title: source.title ?? parsedUrl.hostname,
      publisher: source.publisher ?? parsedUrl.hostname.replace(/^www\./, ""),
      url,
      published_at: source.published_at ?? null,
      tag: source.tag ?? source.used_for ?? "Backdrop source",
      why_relevant: source.why_relevant ?? "",
    });
  }

  return { accepted, rejected };
}

function sourceFlags(mode, accepted, rejected, resultFlags = {}) {
  const tags = accepted.map((source) => source.tag);
  const hasFocused = tags.includes("Focused catalyst source");
  const hasLikely = tags.includes("Likely cause source");
  const backdropTags = mode === "signal" ? ["Backdrop source"] : ["Backdrop source", "Main daily context source", "Supporting daily source"];
  const hasOnlyBackdrop =
    accepted.length > 0 && tags.every((tag) => backdropTags.includes(tag));
  const hasOnlyPrice =
    accepted.length > 0 && tags.every((tag) => tag === "Price check source");

  return {
    ...resultFlags,
    has_focused_source: hasFocused,
    has_likely_source: hasLikely,
    has_only_backdrop_sources: hasOnlyBackdrop,
    has_only_price_check_sources: hasOnlyPrice,
    source_timing_mismatch:
      Boolean(resultFlags.source_timing_mismatch) ||
      rejected.some((source) => source.reason === "source_timing_mismatch"),
  };
}

function fallbackResult(mode, payload, error) {
  const id = itemId(mode, payload);

  if (mode === "signal") {
    return {
      mode: "signal_event",
      item_id: id,
      classification: "Claude Limited",
      confidence: "low",
      headline: "Claude validation unavailable",
      collapsed_summary: "Claude validation did not return a usable JSON result.",
      context_details: "Local validation could not complete for this item.",
      why_this_classification: error,
      source_support: "none",
      source_timing_alignment: "none",
      sources: [],
      rejected_or_ignored_source_notes: [error],
      validation_flags: {
        has_focused_source: false,
        has_likely_source: false,
        has_only_backdrop_sources: false,
        has_only_price_check_sources: false,
        generic_commentary_only: false,
        source_timing_mismatch: false,
        needs_prompt_improvement: true,
      },
      detector_feedback: {
        event_quality: "needs_more_data",
        reason: "Claude validation did not complete.",
      },
    };
  }

  return {
    mode: "daily_overview",
    item_id: id,
    date_utc: payload.date_utc,
    daily_label: "Claude Limited",
    confidence: "low",
    headline: "Claude validation unavailable",
    collapsed_summary: "Claude validation did not return a usable JSON result.",
    context_details: "Local validation could not complete for this item.",
    market_tone_summary: payload.market_tone ?? "",
    notable_drivers: [],
    sources: [],
    validation_flags: {
      generic_commentary_only: false,
      source_timing_mismatch: false,
      no_major_driver_found: false,
      needs_prompt_improvement: true,
    },
    detector_feedback: {
      daily_overview_quality: "needs_better_payload",
      reason: "Claude validation did not complete.",
    },
  };
}

function normalizeLiveResult(mode, payload, rawResult, config) {
  const id = itemId(mode, payload);
  const rawSources = Array.isArray(rawResult.sources)
    ? rawResult.sources
    : Array.isArray(rawResult.source_links)
      ? rawResult.source_links
      : [];
  const filtered = validateSources(rawSources, {
    eventDate: utcDateForPayload(mode, payload),
    blockedDomains: config.blockedDomains,
  });
  const rejectedNotes = filtered.rejected.map(
    (source) => `${source.reason}${source.url ? `: ${source.url}` : ""}`,
  );

  if (mode === "signal") {
    const validationFlags = sourceFlags(
      mode,
      filtered.accepted,
      filtered.rejected,
      rawResult.validation_flags ?? {},
    );

    return {
      mode: "signal_event",
      item_id: rawResult.item_id ?? id,
      classification: SIGNAL_CLASSIFICATIONS.includes(rawResult.classification)
        ? rawResult.classification
        : "Claude Limited",
      confidence: ["high", "medium", "low"].includes(rawResult.confidence)
        ? rawResult.confidence
        : "low",
      headline: rawResult.headline ?? "",
      collapsed_summary: rawResult.collapsed_summary ?? "",
      context_details: rawResult.context_details ?? "",
      why_this_classification: rawResult.why_this_classification ?? "",
      source_support: rawResult.source_support ?? "none",
      source_timing_alignment: rawResult.source_timing_alignment ?? "none",
      sources: filtered.accepted,
      rejected_or_ignored_source_notes: [
        ...(rawResult.rejected_or_ignored_source_notes ?? []),
        ...rejectedNotes,
      ],
      validation_flags: validationFlags,
      detector_feedback: rawResult.detector_feedback ?? {
        event_quality: "needs_more_data",
        reason: "Claude did not provide detector feedback.",
      },
    };
  }

  return {
    mode: "daily_overview",
    item_id: rawResult.item_id ?? id,
    date_utc: rawResult.date_utc ?? payload.date_utc,
    daily_label: DAILY_LABELS.includes(rawResult.daily_label)
      ? rawResult.daily_label
      : "Claude Limited",
    confidence: ["high", "medium", "low"].includes(rawResult.confidence)
      ? rawResult.confidence
      : "low",
    headline: rawResult.headline ?? "",
    collapsed_summary: rawResult.collapsed_summary ?? "",
    context_details: rawResult.context_details ?? "",
    market_tone_summary: rawResult.market_tone_summary ?? "",
    notable_drivers: Array.isArray(rawResult.notable_drivers)
      ? rawResult.notable_drivers
      : [],
    sources: filtered.accepted,
    rejected_or_ignored_source_notes: rejectedNotes,
    validation_flags: {
      ...(rawResult.validation_flags ?? {}),
      source_timing_mismatch:
        Boolean(rawResult.validation_flags?.source_timing_mismatch) ||
        filtered.rejected.some((source) => source.reason === "source_timing_mismatch"),
    },
    detector_feedback: rawResult.detector_feedback ?? {
      daily_overview_quality: "needs_better_payload",
      reason: "Claude did not provide detector feedback.",
    },
  };
}

function cachePath(cacheDir, mode, id) {
  return path.join(cacheDir, mode, `${safeFileName(id)}.json`);
}

async function readCache(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }

  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeCache(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function validateOneLive({
  mode,
  payload,
  promptMarkdown,
  options,
  config,
  logger,
  fetcher,
}) {
  const id = itemId(mode, payload);
  const filePath = cachePath(options.cacheDir, mode, id);
  const cached = !options.force ? await readCache(filePath) : null;

  if (cached) {
    logger.log(
      `cached ${mode} ${id}: ${cached.result?.classification ?? cached.result?.daily_label ?? "unknown"}`,
    );
    return {
      ...cached,
      cached: true,
    };
  }

  const prompt = composePrompt(mode, promptMarkdown, payload);
  const maxSearches =
    mode === "signal" ? options.maxSearchesSignal : options.maxSearchesDaily;

  try {
    const response = await callAnthropic({
      config,
      prompt,
      maxSearches,
      fetcher,
    });
    const result = response.ok
      ? normalizeLiveResult(mode, payload, response.json, config)
      : fallbackResult(mode, payload, response.error ?? "Claude parse error.");
    const output = {
      mode,
      item_id: id,
      generated_at: new Date().toISOString(),
      cached: false,
      searches_used: response.searches_used,
      result,
    };

    await writeCache(filePath, output);
    logger.log(
      `validated ${mode} ${id}: ${result.classification ?? result.daily_label}; sources=${result.sources.length}`,
    );
    return output;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Claude validation failed.";
    const output = {
      mode,
      item_id: id,
      generated_at: new Date().toISOString(),
      cached: false,
      searches_used: 0,
      result: fallbackResult(mode, payload, message),
    };

    await writeCache(filePath, output);
    logger.log(`limited ${mode} ${id}: ${message}`);
    return output;
  }
}

function countBy(items, getter, expected) {
  const counts = Object.fromEntries(expected.map((value) => [value, 0]));

  for (const item of items) {
    const key = getter(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return counts;
}

function summarizeResults(signalResults, dailyResults) {
  const signalItems = signalResults.map((item) => item.result);
  const dailyItems = dailyResults.map((item) => item.result);
  const signalCounts = countBy(
    signalItems,
    (item) => item.classification,
    SIGNAL_CLASSIFICATIONS,
  );
  const dailyCounts = countBy(
    dailyItems,
    (item) => item.daily_label,
    DAILY_LABELS,
  );
  const sourceSupported = signalItems.filter(
    (item) =>
      (item.classification === "Focused Cause" ||
        item.classification === "Likely Cause") &&
      item.sources.length > 0,
  ).length;
  const genericOnly = signalItems.filter(
    (item) => item.validation_flags?.generic_commentary_only,
  ).length;
  const timingIssues = [
    ...signalItems,
    ...dailyItems,
  ].filter((item) => item.validation_flags?.source_timing_mismatch).length;
  const usefulDaily = dailyItems.filter(
    (item) => item.detector_feedback?.daily_overview_quality === "useful",
  ).length;
  const genericDaily = dailyItems.filter(
    (item) => item.detector_feedback?.daily_overview_quality === "generic",
  ).length;

  return {
    generated_at: new Date().toISOString(),
    signal_events: {
      total_validated: signalItems.length,
      classification_counts: signalCounts,
      source_supported_count: sourceSupported,
      generic_only_count: genericOnly,
      source_timing_issue_count: signalItems.filter(
        (item) => item.validation_flags?.source_timing_mismatch,
      ).length,
      detector_feedback: countBy(
        signalItems,
        (item) => item.detector_feedback?.event_quality ?? "missing",
        ["keep", "suppress", "keep_but_adjust", "needs_more_data", "missing"],
      ),
    },
    daily_overviews: {
      total_validated: dailyItems.length,
      label_counts: dailyCounts,
      useful_count: usefulDaily,
      generic_count: genericDaily,
      source_timing_issue_count: dailyItems.filter(
        (item) => item.validation_flags?.source_timing_mismatch,
      ).length,
    },
    overall: {
      prompt_payload_issues_found: [...signalItems, ...dailyItems].filter(
        (item) => item.validation_flags?.needs_prompt_improvement,
      ).length,
      source_tag_problem_count: signalItems.filter((item) => {
        if (item.classification === "Focused Cause") {
          return !item.validation_flags?.has_focused_source;
        }

        if (item.classification === "Likely Cause") {
          return !(
            item.validation_flags?.has_focused_source ||
            item.validation_flags?.has_likely_source
          );
        }

        return false;
      }).length,
      source_timing_issue_count: timingIssues,
    },
  };
}

function summaryMarkdown(summary) {
  const signal = summary.signal_events.classification_counts;
  const daily = summary.daily_overviews.label_counts;

  return [
    "# v0.2 Claude Validation Summary",
    "",
    `Generated at: ${summary.generated_at}`,
    "",
    "## Signal Events",
    "",
    `- Total validated: ${summary.signal_events.total_validated}`,
    `- Focused Cause: ${signal["Focused Cause"] ?? 0}`,
    `- Likely Cause: ${signal["Likely Cause"] ?? 0}`,
    `- Market Backdrop: ${signal["Market Backdrop"] ?? 0}`,
    `- No Clear Cause: ${signal["No Clear Cause"] ?? 0}`,
    `- Claude Limited: ${signal["Claude Limited"] ?? 0}`,
    `- Source-supported: ${summary.signal_events.source_supported_count}`,
    `- Generic-only: ${summary.signal_events.generic_only_count}`,
    `- Source timing issues: ${summary.signal_events.source_timing_issue_count}`,
    "",
    "## Daily Overviews",
    "",
    `- Total validated: ${summary.daily_overviews.total_validated}`,
    `- Daily Context: ${daily["Daily Context"] ?? 0}`,
    `- Quiet Day: ${daily["Quiet Day"] ?? 0}`,
    `- Mixed Day: ${daily["Mixed Day"] ?? 0}`,
    `- Volatile Day: ${daily["Volatile Day"] ?? 0}`,
    `- Risk-on Day: ${daily["Risk-on Day"] ?? 0}`,
    `- Risk-off Day: ${daily["Risk-off Day"] ?? 0}`,
    `- No Major Driver: ${daily["No Major Driver"] ?? 0}`,
    `- Claude Limited: ${daily["Claude Limited"] ?? 0}`,
    `- Useful: ${summary.daily_overviews.useful_count}`,
    `- Generic: ${summary.daily_overviews.generic_count}`,
    "",
    "## Overall",
    "",
    `- Prompt/payload issues found: ${summary.overall.prompt_payload_issues_found}`,
    `- Source tag problems: ${summary.overall.source_tag_problem_count}`,
    `- Source timing issues: ${summary.overall.source_timing_issue_count}`,
    "",
  ].join("\n");
}

async function writeLiveOutputs({ signalResults, dailyResults, options }) {
  await mkdir(options.outputDir, { recursive: true });

  if (signalResults.length > 0 || options.mode !== "daily") {
    await writeJson(
      path.join(options.outputDir, "signal_validation_results.json"),
      {
        generated_at: new Date().toISOString(),
        item_count: signalResults.length,
        items: signalResults,
      },
    );
  }

  if (dailyResults.length > 0 || options.mode !== "signal") {
    await writeJson(
      path.join(options.outputDir, "daily_validation_results.json"),
      {
        generated_at: new Date().toISOString(),
        item_count: dailyResults.length,
        items: dailyResults,
      },
    );
  }

  const summary = summarizeResults(signalResults, dailyResults);
  await writeJson(path.join(options.outputDir, "validation_summary.json"), summary);
  await writeText(
    path.join(options.outputDir, "validation_summary.md"),
    summaryMarkdown(summary),
  );

  return summary;
}

export async function runClaudeValidation(
  options,
  { logger = console, env = process.env, fetcher = fetch } = {},
) {
  const inputs = await loadValidationInputs(options);
  await syncValidationWorkspace(inputs, {
    signalInputPath: options.signalInputPath,
    dailyInputPath: options.dailyInputPath,
  });

  const signalPrompt = await readPrompt(options.signalPromptPath);
  const dailyPrompt = await readPrompt(options.dailyPromptPath);
  const selected = selectValidationItems(inputs, options);
  const dryInput = {
    options,
    inputs,
    selected,
    signalPrompt,
    dailyPrompt,
  };

  if (options.dryRun) {
    await writeDryRunOutputs(dryInput);
    logger.log(
      `Claude validation dry-run: ${selected.signal.length} signal, ${selected.daily.length} daily, 0 market story.`,
    );
    return {
      mode: "dry-run",
      selected,
      inputs,
      liveSummary: null,
    };
  }

  const config = anthropicConfigFromEnv(env);

  if (!config.apiKey) {
    throw new Error(
      "Live Claude validation requires ANTHROPIC_API_KEY in the environment.",
    );
  }

  await writeDryRunOutputs(dryInput);

  const signalResults = [];
  const dailyResults = [];

  for (const payload of selected.signal) {
    signalResults.push(
      await validateOneLive({
        mode: "signal",
        payload,
        promptMarkdown: signalPrompt,
        options,
        config,
        logger,
        fetcher,
      }),
    );
  }

  for (const payload of selected.daily) {
    dailyResults.push(
      await validateOneLive({
        mode: "daily",
        payload,
        promptMarkdown: dailyPrompt,
        options,
        config,
        logger,
        fetcher,
      }),
    );
  }

  const liveSummary = await writeLiveOutputs({
    signalResults,
    dailyResults,
    options,
  });

  return {
    mode: "live",
    selected,
    inputs,
    liveSummary,
  };
}

if (isMain(import.meta.url)) {
  let options;

  try {
    options = parseArgs();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid options.");
    process.exit(1);
  }

  runClaudeValidation(options).catch((error) => {
    const digest = crypto
      .createHash("sha256")
      .update(error instanceof Error ? error.message : String(error))
      .digest("hex")
      .slice(0, 8);
    console.error(
      error instanceof Error
        ? `${error.message} (error ${digest})`
        : `Claude validation failed. (error ${digest})`,
    );
    process.exitCode = 1;
  });
}
