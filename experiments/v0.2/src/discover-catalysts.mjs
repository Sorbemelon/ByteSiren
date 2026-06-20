#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  EXPERIMENT_ROOT,
  isMain,
  readJson,
  readOption,
  roundNumber,
  writeJson,
  writeText,
} from "./shared.mjs";
import { CLAUDE_DAILY_PAYLOADS_PATH } from "./build-claude-payloads.mjs";
import { CLAUDE_SIGNAL_PAYLOADS_PATH } from "./build-claude-payloads.mjs";
import { validateSources } from "./run-claude-validation.mjs";

export const CATALYST_OUTPUTS_DIR = path.join(
  EXPERIMENT_ROOT,
  "claude-validation",
  "outputs",
);
export const CATALYST_CACHE_DIR = path.join(
  EXPERIMENT_ROOT,
  "claude-validation",
  "cache",
  "catalyst_discovery",
);
export const INDEPENDENT_CATALYSTS_JSON_PATH = path.join(
  CATALYST_OUTPUTS_DIR,
  "independent_catalyst_events_30d.json",
);
export const INDEPENDENT_CATALYSTS_MD_PATH = path.join(
  CATALYST_OUTPUTS_DIR,
  "independent_catalyst_events_30d.md",
);
export const CATALYST_SIGNAL_ALIGNMENT_JSON_PATH = path.join(
  CATALYST_OUTPUTS_DIR,
  "catalyst_signal_alignment.json",
);
export const CATALYST_SIGNAL_ALIGNMENT_MD_PATH = path.join(
  CATALYST_OUTPUTS_DIR,
  "catalyst_signal_alignment.md",
);

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_TOOL_TYPE = "web_search_20250305";
const DEFAULT_MAX_TOKENS = 8192;
const DEFAULT_TIMEOUT_MS = 300_000;

const CATALYST_TYPES = [
  "macro",
  "geopolitical",
  "regulatory",
  "etf_flows",
  "liquidation",
  "exchange_project",
  "security",
  "institutional",
  "market_structure",
  "other",
];

function flag(argv, name) {
  return argv.includes(name);
}

function integerOption(argv, name, fallback) {
  const value = readOption(argv, name);
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function envCsv(value) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseArgs(argv = process.argv.slice(2)) {
  const live = flag(argv, "--live");

  return {
    live,
    dryRun: flag(argv, "--dry-run") || !live,
    resume: flag(argv, "--resume"),
    force: flag(argv, "--force"),
    chunkDays: integerOption(argv, "--chunk-days", 7),
    maxSearches: integerOption(argv, "--max-searches", 5),
    rangeStart: readOption(argv, "--range-start") ?? null,
    rangeEnd: readOption(argv, "--range-end") ?? null,
    dailyPayloadPath:
      readOption(argv, "--daily-payloads") ?? CLAUDE_DAILY_PAYLOADS_PATH,
    signalPayloadPath:
      readOption(argv, "--signal-payloads") ?? CLAUDE_SIGNAL_PAYLOADS_PATH,
    outputDir: readOption(argv, "--output-dir") ?? CATALYST_OUTPUTS_DIR,
    cacheDir: readOption(argv, "--cache-dir") ?? CATALYST_CACHE_DIR,
  };
}

function arrayFromDoc(doc) {
  if (Array.isArray(doc)) return doc;
  if (Array.isArray(doc.items)) return doc.items;
  return [];
}

function dayKey(iso) {
  return iso.slice(0, 10);
}

function dateRangeFromDailyPayloads(dailyPayloads, options) {
  const dates = dailyPayloads.map((item) => item.date_utc).filter(Boolean).sort();
  const rangeStart = options.rangeStart ?? dates[0];
  const rangeEnd = options.rangeEnd ?? dates.at(-1);

  if (!rangeStart || !rangeEnd) {
    throw new Error("No date range is available for catalyst discovery.");
  }

  return { rangeStart, rangeEnd };
}

function addDays(dateUtc, days) {
  const date = new Date(`${dateUtc}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function compareDate(a, b) {
  return a.localeCompare(b);
}

function chunkDates(rangeStart, rangeEnd, chunkDays) {
  const chunks = [];
  let start = rangeStart;

  while (compareDate(start, rangeEnd) <= 0) {
    const end = [addDays(start, chunkDays - 1), rangeEnd].sort()[0];
    chunks.push({ start, end });
    start = addDays(end, 1);
  }

  return chunks;
}

function normalizeDomainFilter(value) {
  const trimmed = String(value ?? "").trim().toLowerCase();
  if (!trimmed) return null;

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
  return [...new Set(domains.map(normalizeDomainFilter).filter(Boolean))];
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

function buildPrompt(chunk, dailyPayloads) {
  const days = dailyPayloads.filter(
    (item) =>
      compareDate(item.date_utc, chunk.start) >= 0 &&
      compareDate(item.date_utc, chunk.end) <= 0,
  );

  return [
    "Find source-backed crypto market catalyst events independently of ByteSiren Signal Events.",
    "",
    `Date range: ${chunk.start} through ${chunk.end} UTC.`,
    "",
    "Scope:",
    "- BTC, ETH, BNB, SOL, XRP, and broad crypto market.",
    "- Include macro, geopolitical, regulatory, ETF/flow, liquidation, exchange/project, security, institutional, and broad risk-sentiment catalysts.",
    "- Do not include a pure price move as a catalyst unless a source ties it to an event/context.",
    "- Do not use ByteSiren Signal Events as evidence.",
    "- No trading advice, forecasts, price targets, or recommendations.",
    "- Return at most 10 catalyst_events for this chunk.",
    "- Return compact valid JSON only. No markdown. No prose outside JSON.",
    "",
    "Daily market context, for orientation only:",
    JSON.stringify(
      days.map((day) => ({
        date_utc: day.date_utc,
        market_tone: day.market_tone,
        daily_change_pct: day.daily_change_pct,
        market_range_pct: day.market_range_pct,
        notable_symbols: day.notable_symbols,
      })),
      null,
      2,
    ),
    "",
    "Return one JSON object only:",
    JSON.stringify(
      {
        range_start: chunk.start,
        range_end: chunk.end,
        catalyst_events: [
          {
            event_id: "stable-short-id",
            event_date_utc: "YYYY-MM-DD",
            event_time_utc: "YYYY-MM-DDTHH:mm:ss.sssZ or null",
            time_granularity: "exact | hour | day",
            catalyst_type: CATALYST_TYPES.join(" | "),
            headline: "short factual headline",
            summary: "source-backed description",
            affected_assets: ["BTC", "ETH", "SOL"],
            expected_market_direction: "risk_on | risk_off | mixed | unclear",
            source_support: "high | medium | low",
            confidence: "high | medium | low",
            sources: [
              {
                title: "article title",
                publisher: "publisher",
                url: "https://example.com/article",
                published_at: "YYYY-MM-DD or ISO timestamp",
                tag: "Primary catalyst source | Supporting catalyst source | Price check source",
                why_relevant: "why this source supports the event",
              },
            ],
          },
        ],
        omitted_notes: ["short safe notes for broad or rejected source classes"],
      },
      null,
      2,
    ),
  ].join("\n");
}

function buildAnthropicRequest(config, prompt, maxSearches) {
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
    system:
      "You are a source-grounded market catalyst researcher for a read-only crypto market intelligence experiment. Return JSON only.",
    messages: [{ role: "user", content: prompt }],
    tools: [tool],
  };
}

function parseAssistantText(raw) {
  return (Array.isArray(raw?.content) ? raw.content : [])
    .map((block) => (typeof block?.text === "string" ? block.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function parseJsonObject(text) {
  const candidates = [
    text.trim().replace(/^```(?:json)?\s*|\s*```$/gi, ""),
    text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1),
  ].filter((candidate) => candidate && candidate.includes("{"));

  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return value;
      }
    } catch {
      // Try next candidate.
    }
  }

  return null;
}

async function callAnthropic(config, prompt, maxSearches, fetcher = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetcher(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(buildAnthropicRequest(config, prompt, maxSearches)),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Claude request failed with HTTP ${response.status}.`);
    }

    const raw = await response.json();
    const text = parseAssistantText(raw);
    const parsed = parseJsonObject(text);

    if (!parsed) {
      throw new Error(
        `Claude catalyst discovery response was not JSON. Text excerpt: ${text.slice(0, 500)}`,
      );
    }

    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

function cachePath(cacheDir, chunk) {
  return path.join(cacheDir, `${chunk.start}_${chunk.end}.json`);
}

async function readCache(filePath) {
  if (!existsSync(filePath)) return null;
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeCache(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function stableCatalystId(event) {
  const seed = [
    event.event_date_utc,
    event.event_time_utc ?? "",
    event.catalyst_type,
    event.headline,
  ].join("|");
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return `cat_${event.event_date_utc?.replaceAll("-", "")}_${hash.toString(16).slice(0, 8)}`;
}

function normalizeCatalyst(event, blockedDomains) {
  const eventDate = event.event_date_utc;
  const filtered = validateSources(event.sources ?? [], {
    eventDate,
    blockedDomains,
  });

  return {
    event_id: event.event_id || stableCatalystId(event),
    event_date_utc: eventDate,
    event_time_utc: event.event_time_utc ?? null,
    time_granularity: event.time_granularity ?? (event.event_time_utc ? "exact" : "day"),
    catalyst_type: CATALYST_TYPES.includes(event.catalyst_type)
      ? event.catalyst_type
      : "other",
    headline: event.headline ?? "Untitled catalyst",
    summary: event.summary ?? "",
    affected_assets: Array.isArray(event.affected_assets)
      ? event.affected_assets
      : [],
    expected_market_direction: event.expected_market_direction ?? "unclear",
    source_support: event.source_support ?? "low",
    confidence: event.confidence ?? "low",
    sources: filtered.accepted,
    rejected_source_notes: filtered.rejected.map(
      (source) => `${source.reason}${source.url ? `: ${source.url}` : ""}`,
    ),
  };
}

function dedupeCatalysts(catalysts) {
  const byKey = new Map();

  for (const catalyst of catalysts) {
    const key = [
      catalyst.event_date_utc,
      catalyst.catalyst_type,
      catalyst.headline.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
    ].join("|");
    const existing = byKey.get(key);

    if (!existing || catalyst.sources.length > existing.sources.length) {
      byKey.set(key, catalyst);
    }
  }

  return [...byKey.values()].sort((a, b) => {
    const aTime = Date.parse(a.event_time_utc ?? `${a.event_date_utc}T12:00:00.000Z`);
    const bTime = Date.parse(b.event_time_utc ?? `${b.event_date_utc}T12:00:00.000Z`);
    return aTime - bTime;
  });
}

function inRange(catalyst, range) {
  return (
    compareDate(catalyst.event_date_utc, range.rangeStart) >= 0 &&
    compareDate(catalyst.event_date_utc, range.rangeEnd) <= 0
  );
}

function mdText(value) {
  return String(value ?? "")
    .replaceAll("โ€”", "-")
    .replaceAll("โ€“", "-")
    .replaceAll("—", "-")
    .replaceAll("–", "-")
    .replaceAll("’", "'")
    .replaceAll("“", "\"")
    .replaceAll("”", "\"")
    .replaceAll("…", "...");
}

function signalTime(signal) {
  return {
    start: Date.parse(signal.evidence_window?.start),
    end: Date.parse(signal.evidence_window?.end),
  };
}

function catalystTime(catalyst) {
  const dateIso = `${catalyst.event_date_utc}T12:00:00.000Z`;
  const time = Date.parse(catalyst.event_time_utc ?? dateIso);
  return Number.isFinite(time) ? time : Date.parse(dateIso);
}

function relationFor(minutes, overlap) {
  if (overlap) return "overlap";
  if (minutes <= 180) return "near_0_3h";
  if (minutes <= 360) return "near_3_6h";
  if (minutes <= 1440) return "same_day";
  return "outside_24h";
}

function nearestSignal(catalyst, signalPayloads) {
  const cTime = catalystTime(catalyst);
  let best = null;

  for (const signal of signalPayloads) {
    const times = signalTime(signal);
    if (!Number.isFinite(times.start) || !Number.isFinite(times.end)) continue;

    const overlap = cTime >= times.start && cTime <= times.end;
    const distanceMs = overlap
      ? 0
      : Math.min(Math.abs(cTime - times.start), Math.abs(cTime - times.end));
    const distanceMin = Math.round(distanceMs / 60000);

    if (!best || distanceMin < best.delta_min) {
      best = {
        signal_event_id: signal.event_id,
        signal_window: signal.evidence_window?.display,
        signal_start: signal.evidence_window?.start,
        signal_end: signal.evidence_window?.end,
        signal_direction: signal.direction,
        signal_avg_change_pct: signal.avg_change_pct,
        relation: relationFor(distanceMin, overlap),
        delta_min: distanceMin,
      };
    }
  }

  return best;
}

function buildAlignment(catalysts, signalPayloads) {
  const catalystRows = catalysts.map((catalyst) => ({
    catalyst_event_id: catalyst.event_id,
    catalyst_date_utc: catalyst.event_date_utc,
    catalyst_time_utc: catalyst.event_time_utc,
    catalyst_headline: catalyst.headline,
    catalyst_type: catalyst.catalyst_type,
    source_support: catalyst.source_support,
    nearest_signal: nearestSignal(catalyst, signalPayloads),
  }));
  const catalystMatches = new Map(
    catalystRows
      .filter((row) => row.nearest_signal)
      .map((row) => [row.catalyst_event_id, row.nearest_signal]),
  );
  const matchedSignalIds = new Set(
    catalystRows
      .filter((row) => row.nearest_signal?.relation !== "outside_24h")
      .map((row) => row.nearest_signal.signal_event_id),
  );

  return {
    generated_at: new Date().toISOString(),
    catalyst_count: catalysts.length,
    signal_count: signalPayloads.length,
    catalyst_alignment: catalystRows,
    catalysts_near_signal_count: catalystRows.filter(
      (row) => row.nearest_signal?.relation !== "outside_24h",
    ).length,
    catalyst_without_near_signal_count: catalystRows.filter(
      (row) => row.nearest_signal?.relation === "outside_24h",
    ).length,
    signals_near_catalyst_count: matchedSignalIds.size,
    signal_without_near_catalyst_count: signalPayloads.length - matchedSignalIds.size,
    _debug_catalyst_matches: Object.fromEntries(catalystMatches),
  };
}

function catalystMarkdown(catalysts) {
  return [
    "# Independent Catalyst Events",
    "",
    "Source-found catalyst candidates discovered independently of Signal Event windows.",
    "",
    `Total catalysts: ${catalysts.length}`,
    "",
    ...catalysts.flatMap((event) => [
      `## ${event.event_date_utc} - ${mdText(event.headline)}`,
      "",
      `- Time: ${event.event_time_utc ?? event.time_granularity}`,
      `- Type: ${event.catalyst_type}`,
      `- Direction context: ${event.expected_market_direction}`,
      `- Source support: ${event.source_support}`,
      `- Confidence: ${event.confidence}`,
      `- Affected assets: ${event.affected_assets.join(", ") || "broad crypto"}`,
      `- Summary: ${mdText(event.summary)}`,
      "",
      "Sources:",
      ...(event.sources.length
        ? event.sources.map(
            (source) =>
              `- ${mdText(source.publisher)}: [${mdText(source.title)}](${source.url}) (${source.published_at ?? "date unknown"})`,
          )
        : ["- none accepted"]),
      "",
    ]),
  ].join("\n");
}

function alignmentMarkdown(alignment) {
  return [
    "# Catalyst To Signal Alignment",
    "",
    `Catalysts: ${alignment.catalyst_count}`,
    `Signal Events: ${alignment.signal_count}`,
    `Catalysts within 24h of a Signal Event: ${alignment.catalysts_near_signal_count}`,
    `Catalysts without a nearby Signal Event: ${alignment.catalyst_without_near_signal_count}`,
    `Signal Events within 24h of a catalyst: ${alignment.signals_near_catalyst_count}`,
    `Signal Events without nearby catalyst: ${alignment.signal_without_near_catalyst_count}`,
    "",
    "## Catalyst Rows",
    "",
    ...alignment.catalyst_alignment.map((row) => {
      const signal = row.nearest_signal;
      return [
        `- ${row.catalyst_date_utc} ${mdText(row.catalyst_headline)}`,
        `  - Catalyst: ${row.catalyst_type}, ${row.source_support}`,
        signal
          ? `  - Nearest signal: ${signal.signal_event_id} (${signal.relation}, ${signal.delta_min} min) ${signal.signal_window}`
          : "  - Nearest signal: none",
      ].join("\n");
    }),
    "",
  ].join("\n");
}

async function discoverCatalysts(options, { logger = console, env = process.env } = {}) {
  const dailyDoc = await readJson(options.dailyPayloadPath);
  const signalDoc = await readJson(options.signalPayloadPath);
  const dailyPayloads = arrayFromDoc(dailyDoc).filter(
    (item) => item.mode === "daily_overview",
  );
  const signalPayloads = arrayFromDoc(signalDoc).filter(
    (item) => item.mode === "signal_event",
  );
  const range = dateRangeFromDailyPayloads(dailyPayloads, options);
  const chunks = chunkDates(range.rangeStart, range.rangeEnd, options.chunkDays);
  const prompts = chunks.map((chunk) => ({
    chunk,
    prompt: buildPrompt(chunk, dailyPayloads),
  }));

  await mkdir(options.outputDir, { recursive: true });
  await writeText(
    path.join(options.outputDir, "independent_catalyst_discovery_plan.md"),
    [
      "# Independent Catalyst Discovery Plan",
      "",
      `Range: ${range.rangeStart} through ${range.rangeEnd}`,
      `Chunks: ${chunks.length}`,
      `Dry run: ${options.dryRun}`,
      `Live: ${options.live}`,
      `Max searches per chunk: ${options.maxSearches}`,
      "",
      "## Chunks",
      "",
      ...chunks.map((chunk) => `- ${chunk.start} through ${chunk.end}`),
      "",
    ].join("\n"),
  );

  if (options.dryRun) {
    await writeText(
      path.join(options.outputDir, "independent_catalyst_discovery_prompts.md"),
      prompts
        .map(
          (item, index) =>
            `# Prompt ${index + 1}: ${item.chunk.start} through ${item.chunk.end}\n\n\`\`\`text\n${item.prompt}\n\`\`\`\n`,
        )
        .join("\n"),
    );
    logger.log(
      `Catalyst discovery dry-run: ${chunks.length} chunks, ${signalPayloads.length} signals for comparison.`,
    );
    return { catalysts: [], alignment: null };
  }

  const config = anthropicConfigFromEnv(env);
  if (!config.apiKey) {
    throw new Error("Live catalyst discovery requires ANTHROPIC_API_KEY.");
  }

  const allCatalysts = [];

  for (const item of prompts) {
    const filePath = cachePath(options.cacheDir, item.chunk);
    const cached = !options.force ? await readCache(filePath) : null;
    const result =
      cached ??
      (await callAnthropic(config, item.prompt, options.maxSearches).then(
        async (value) => {
          await writeCache(filePath, value);
          return value;
        },
      ));
    const catalysts = (Array.isArray(result.catalyst_events)
      ? result.catalyst_events
      : []
    ).map((event) => normalizeCatalyst(event, config.blockedDomains));

    logger.log(
      `${cached ? "cached" : "discovered"} catalysts ${item.chunk.start}..${item.chunk.end}: ${catalysts.length}`,
    );
    allCatalysts.push(...catalysts);
  }

  const catalysts = dedupeCatalysts(allCatalysts).filter(
    (catalyst) => inRange(catalyst, range) && catalyst.sources.length > 0,
  );
  const alignment = buildAlignment(catalysts, signalPayloads);

  await writeJson(INDEPENDENT_CATALYSTS_JSON_PATH, {
    generated_at: new Date().toISOString(),
    range_start: range.rangeStart,
    range_end: range.rangeEnd,
    catalyst_count: catalysts.length,
    items: catalysts,
  });
  await writeText(INDEPENDENT_CATALYSTS_MD_PATH, catalystMarkdown(catalysts));
  await writeJson(CATALYST_SIGNAL_ALIGNMENT_JSON_PATH, alignment);
  await writeText(CATALYST_SIGNAL_ALIGNMENT_MD_PATH, alignmentMarkdown(alignment));

  return { catalysts, alignment };
}

if (isMain(import.meta.url)) {
  discoverCatalysts(parseArgs()).catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Catalyst discovery failed.",
    );
    process.exitCode = 1;
  });
}
