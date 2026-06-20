#!/usr/bin/env node

import crypto from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import {
  EXPERIMENT_ROOT,
  OUTPUTS_DIR,
  isMain,
  readJson,
  readOption,
  writeJson,
  writeText,
} from "./shared.mjs";

export const CATALYST_TIME_REFINEMENTS_JSON_PATH = path.join(
  OUTPUTS_DIR,
  "catalyst_time_refinements.json",
);
export const CATALYST_TIME_REFINEMENTS_MD_PATH = path.join(
  OUTPUTS_DIR,
  "catalyst_time_refinements.md",
);
export const CATALYST_TIME_REFINEMENT_CACHE_DIR = path.join(
  EXPERIMENT_ROOT,
  "data",
  "catalyst_time_refinement",
);
export const INDEPENDENT_CATALYSTS_JSON_PATH = path.join(
  EXPERIMENT_ROOT,
  "claude-validation",
  "outputs",
  "independent_catalyst_events_30d.json",
);

const DEFAULT_TIMEOUT_MS = 30_000;

function flag(argv, name) {
  return argv.includes(name);
}

function integerOption(argv, name, fallback) {
  const value = readOption(argv, name);
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function htmlText(value) {
  return decodeEntities(
    String(value ?? "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function isoOrNull(value) {
  if (!value) return null;
  const trimmed = decodeEntities(String(value).trim());
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function epochIsoOrNull(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const timestamp =
    numeric > 1_000_000_000_000
      ? numeric
      : numeric > 1_000_000_000
        ? numeric * 1000
        : null;
  if (!timestamp) return null;
  const parsed = new Date(timestamp);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function dateCandidateFromValue(value) {
  return epochIsoOrNull(value) ?? isoOrNull(value);
}

function hasTimeComponent(iso) {
  if (!iso) return false;
  return !iso.endsWith("T00:00:00.000Z");
}

function sameUtcDate(aIso, dateUtc) {
  if (!aIso || !dateUtc) return false;
  return aIso.slice(0, 10) === dateUtc;
}

function shortText(value, max = 220) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function normalizeUrlToCacheName(url) {
  const hash = crypto.createHash("sha256").update(String(url)).digest("hex");
  return hash.slice(0, 24);
}

function metaCandidates(html) {
  const candidates = [];
  const metaRe =
    /<meta\b[^>]*(?:property|name|itemprop)=["']([^"']+)["'][^>]*content=["']([^"']+)["'][^>]*>|<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["']([^"']+)["'][^>]*>/gi;
  const wanted = [
    "article:published_time",
    "article:modified_time",
    "og:updated_time",
    "datepublished",
    "datemodified",
    "pubdate",
    "publishdate",
    "published_date",
    "sailthru.date",
    "parsely-pub-date",
    "bt:pubdate",
    "cseomodifiedtime",
    "timestamp",
    "date",
    "dc.date",
    "dc.date.issued",
    "cxenseparse:recs:publishtime",
  ];

  for (const match of html.matchAll(metaRe)) {
    const key = String(match[1] ?? match[4] ?? "").toLowerCase();
    const value = match[2] ?? match[3];
    if (!wanted.some((item) => key.includes(item))) continue;
    const iso = isoOrNull(value);
    if (!iso) continue;
    candidates.push({
      iso,
      basis: key.includes("modified") || key.includes("updated")
        ? "source_modified_metadata"
        : "source_published_metadata",
      raw: value,
      field: key,
    });
  }

  return candidates;
}

function jsonLdCandidates(html) {
  const candidates = [];
  const scriptRe =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(scriptRe)) {
    const raw = decodeEntities(match[1]).trim();
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      const stack = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (stack.length) {
        const value = stack.pop();
        if (!value || typeof value !== "object") continue;
        if (Array.isArray(value)) {
          stack.push(...value);
          continue;
        }

        for (const child of Object.values(value)) {
          if (child && typeof child === "object") stack.push(child);
        }

        for (const field of ["datePublished", "dateModified", "uploadDate"]) {
          const iso = isoOrNull(value[field]);
          if (!iso) continue;
          candidates.push({
            iso,
            basis:
              field === "datePublished"
                ? "source_published_json_ld"
                : "source_modified_json_ld",
            raw: value[field],
            field,
          });
        }
      }
    } catch {
      continue;
    }
  }

  return candidates;
}

function embeddedJsonCandidates(html) {
  const candidates = [];
  const wantedFields = new Set([
    "createdAt",
    "createAt",
    "createTime",
    "dateModified",
    "datePublished",
    "firstPublishedAt",
    "first_publish_time",
    "publicAt",
    "publicFirstAt",
    "publishAt",
    "publishedAt",
    "published_at",
    "publishTime",
    "releaseTime",
    "updatedAt",
    "updateTime",
  ]);
  const scriptRe =
    /<script\b[^>]*(?:id=["']__NEXT_DATA__["'][^>]*|type=["']application\/json["'][^>]*)>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(scriptRe)) {
    const raw = decodeEntities(match[1]).trim();
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      const stack = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (stack.length) {
        const value = stack.pop();
        if (!value || typeof value !== "object") continue;
        if (Array.isArray(value)) {
          stack.push(...value);
          continue;
        }

        for (const [field, child] of Object.entries(value)) {
          if (child && typeof child === "object") stack.push(child);
          if (!wantedFields.has(field)) continue;

          const iso = dateCandidateFromValue(child);
          if (!iso) continue;
          candidates.push({
            iso,
            basis: field.toLowerCase().includes("updat") ||
              field.toLowerCase().includes("modif")
              ? "source_modified_embedded_json"
              : "source_published_embedded_json",
            raw: child,
            field,
          });
        }
      }
    } catch {
      continue;
    }
  }

  return candidates;
}

function timeTagCandidates(html) {
  const candidates = [];
  const timeRe =
    /<time\b[^>]*datetime=["']([^"']+)["'][^>]*>([\s\S]*?)<\/time>|<time\b[^>]*>([\s\S]*?)<\/time>/gi;

  for (const match of html.matchAll(timeRe)) {
    const raw = match[1] ?? htmlText(match[2] ?? match[3]);
    const iso = isoOrNull(raw);
    if (!iso) continue;
    candidates.push({
      iso,
      basis: "source_time_tag",
      raw,
      field: "time",
    });
  }

  return candidates;
}

function inlineIsoCandidates(html) {
  const candidates = [];
  const isoRe =
    /\b20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})\b/g;

  for (const match of html.matchAll(isoRe)) {
    const iso = isoOrNull(match[0]);
    if (!iso) continue;
    candidates.push({
      iso,
      basis: "source_inline_iso_time",
      raw: match[0],
      field: "inline_iso",
    });
  }

  return candidates;
}

function headerCandidate(headers) {
  const lastModified = headers.get("last-modified");
  const iso = isoOrNull(lastModified);
  return iso
    ? [
        {
          iso,
          basis: "source_last_modified_header",
          raw: lastModified,
          field: "last-modified",
        },
      ]
    : [];
}

function sourcePublishedAtCandidate(source) {
  const iso = isoOrNull(source?.published_at);
  return iso
    ? [
        {
          iso,
          basis: "accepted_source_published_at",
          raw: source.published_at,
          field: "source.published_at",
        },
      ]
    : [];
}

function uniqueCandidates(candidates) {
  const seen = new Set();
  const result = [];
  for (const candidate of candidates) {
    const key = `${candidate.iso}|${candidate.basis}|${candidate.field}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

function rankCandidate(candidate, item) {
  let score = 0;
  if (sameUtcDate(candidate.iso, item.event_date_utc)) score += 100;
  if (hasTimeComponent(candidate.iso)) score += 20;
  if (candidate.basis.includes("published")) score += 15;
  if (candidate.basis.includes("json_ld")) score += 8;
  if (candidate.basis.includes("metadata")) score += 6;
  if (candidate.basis.includes("time_tag")) score += 4;
  if (candidate.basis.includes("modified")) score -= 12;
  if (candidate.basis.includes("last_modified")) score -= 20;
  return score;
}

function chooseBestCandidate(candidates, item) {
  return candidates
    .filter((candidate) => hasTimeComponent(candidate.iso))
    .sort((a, b) => rankCandidate(b, item) - rankCandidate(a, item))[0];
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "ByteSiren-v0.2-local-experiment/1.0 (+offline validation)",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      final_url: response.url,
      headers: response.headers,
      text,
    };
  } finally {
    clearTimeout(timer);
  }
}

function sourceSlug(sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    return url.pathname
      .split("/")
      .filter(Boolean)
      .at(-1)
      ?.replace(/\.[a-z0-9]+$/i, "");
  } catch {
    return null;
  }
}

function originFor(sourceUrl) {
  try {
    return new URL(sourceUrl).origin;
  } catch {
    return null;
  }
}

async function fetchTextIfOk(url, timeoutMs, accept) {
  const fetched = await fetchWithTimeout(url, timeoutMs);
  if (!fetched.ok) return null;
  const contentType = fetched.headers.get("content-type") ?? "";
  if (accept && !contentType.toLowerCase().includes(accept)) return null;
  return fetched.text;
}

async function wordpressRestCandidates(source, options) {
  const origin = originFor(source.url);
  const slug = sourceSlug(source.url);
  if (!origin || !slug) return [];

  try {
    const url = `${origin}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}`;
    const text = await fetchTextIfOk(url, options.timeoutMs, "json");
    if (!text) return [];
    const posts = JSON.parse(text);
    if (!Array.isArray(posts)) return [];
    return posts.flatMap((post) => {
      const values = [
        ["date_gmt", post.date_gmt],
        ["date", post.date],
        ["modified_gmt", post.modified_gmt],
      ];
      return values
        .map(([field, value]) => {
          const iso =
            field.endsWith("_gmt") &&
            typeof value === "string" &&
            !/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)
              ? isoOrNull(`${value}Z`)
              : dateCandidateFromValue(value);
          if (!iso) return null;
          return {
            iso,
            basis: field.includes("modified")
              ? "source_modified_wordpress_rest"
              : "source_published_wordpress_rest",
            raw: value,
            field,
          };
        })
        .filter(Boolean);
    });
  } catch {
    return [];
  }
}

async function rssFeedCandidates(source, options) {
  const origin = originFor(source.url);
  const slug = sourceSlug(source.url);
  if (!origin || !slug) return [];

  const feedUrls = [
    `${origin}/feed/`,
    `${origin}/rss/`,
    `${origin}/news/feed/`,
  ];
  const candidates = [];

  for (const feedUrl of feedUrls) {
    try {
      const text = await fetchTextIfOk(feedUrl, options.timeoutMs, null);
      if (!text) continue;
      const itemRe = /<item\b[\s\S]*?<\/item>/gi;
      for (const match of text.matchAll(itemRe)) {
        const itemXml = match[0];
        if (!itemXml.toLowerCase().includes(slug.toLowerCase())) continue;
        const pubDate =
          itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ??
          itemXml.match(/<dc:date>([\s\S]*?)<\/dc:date>/i)?.[1];
        const iso = isoOrNull(htmlText(pubDate));
        if (!iso) continue;
        candidates.push({
          iso,
          basis: "source_published_rss_feed",
          raw: htmlText(pubDate),
          field: "rss.pubDate",
        });
      }
    } catch {
      continue;
    }
  }

  return candidates;
}

async function auxiliarySourceCandidates(source, options) {
  const [wordpress, rss] = await Promise.all([
    wordpressRestCandidates(source, options),
    rssFeedCandidates(source, options),
  ]);
  return uniqueCandidates([...wordpress, ...rss]);
}

async function refineItem(item, options) {
  const sources = (item.sources ?? []).filter((source) => source?.url);
  if (!sources.length) {
    return {
      event_id: item.event_id,
      status: "no_source_url",
      refined_time_utc: null,
      refined_time_kind: null,
      confidence: "none",
      source_url: null,
      candidates: [],
      note: "No accepted source URL was available.",
    };
  }

  const checkedSources = [];
  for (const [sourceIndex, source] of sources.entries()) {
    try {
    const fetched = await fetchWithTimeout(source.url, options.timeoutMs);
    let candidates = uniqueCandidates([
      ...sourcePublishedAtCandidate(source),
      ...headerCandidate(fetched.headers),
      ...metaCandidates(fetched.text),
      ...jsonLdCandidates(fetched.text),
      ...embeddedJsonCandidates(fetched.text),
      ...timeTagCandidates(fetched.text),
      ...inlineIsoCandidates(fetched.text),
    ]).sort((a, b) => rankCandidate(b, item) - rankCandidate(a, item));
    let best = chooseBestCandidate(candidates, item);
    if (!best) {
      candidates = uniqueCandidates([
        ...candidates,
        ...(await auxiliarySourceCandidates(source, options)),
      ]).sort((a, b) => rankCandidate(b, item) - rankCandidate(a, item));
      best = chooseBestCandidate(candidates, item);
    }
    const sameDay = best ? sameUtcDate(best.iso, item.event_date_utc) : false;

      checkedSources.push({
        source_index: sourceIndex,
        status: "fetched",
        source_url: source.url,
        source_title: source.title ?? null,
        publisher: source.publisher ?? null,
        published_at: source.published_at ?? null,
        http_status: fetched.status,
        final_url: fetched.final_url,
        best,
        candidates: candidates.slice(0, 8).map((candidate) => ({
          ...candidate,
          score: rankCandidate(candidate, item),
        })),
      });
    } catch (error) {
      checkedSources.push({
        source_index: sourceIndex,
        status: "fetch_failed",
        source_url: source.url,
        source_title: source.title ?? null,
        publisher: source.publisher ?? null,
        published_at: source.published_at ?? null,
        best: null,
        candidates: [],
        note: shortText(error instanceof Error ? error.message : error),
      });
    }
  }

  const bestSource = checkedSources
    .filter((source) => source.best)
    .sort((a, b) => rankCandidate(b.best, item) - rankCandidate(a.best, item))[0];
  const fallbackSource = bestSource ?? checkedSources[0];
  const best = bestSource?.best ?? null;
  const sameDay = best ? sameUtcDate(best.iso, item.event_date_utc) : false;
  const anyCandidates = checkedSources.some((source) => source.candidates.length);
  const allFetchFailed = checkedSources.every(
    (source) => source.status === "fetch_failed",
  );

  return {
    event_id: item.event_id,
    headline: item.headline,
    event_date_utc: item.event_date_utc,
    old_event_time_utc: item.event_time_utc ?? null,
    old_time_granularity: item.time_granularity,
    status: best
      ? sameDay
        ? "refined_source_time_same_day"
        : "refined_source_time_other_day"
      : allFetchFailed
        ? "fetch_failed"
        : anyCandidates
          ? "timestamp_without_time_component"
          : "no_timestamp_found",
    refined_time_utc: best?.iso ?? null,
    refined_time_kind: best?.basis ?? null,
    confidence: best ? (sameDay ? "medium" : "low") : "none",
    source_index: fallbackSource?.source_index ?? null,
    source_url: fallbackSource?.source_url ?? null,
    source_title: fallbackSource?.source_title ?? null,
    publisher: fallbackSource?.publisher ?? null,
    published_at: fallbackSource?.published_at ?? null,
    http_status: fallbackSource?.http_status ?? null,
    final_url: fallbackSource?.final_url ?? null,
    candidates: fallbackSource?.candidates ?? [],
    checked_sources: checkedSources.map((source) => ({
      ...source,
      best: source.best
        ? {
            ...source.best,
            score: rankCandidate(source.best, item),
          }
        : null,
    })),
    note: best
      ? "Refined time is the accepted source page timestamp, not proof of exact catalyst occurrence time."
      : allFetchFailed
        ? "All accepted source fetches failed."
        : "No exact timestamp was found in accepted source metadata/time tags.",
  };
}

function markdownReport(payload) {
  const lines = [
    "# Catalyst Time Refinements",
    "",
    `Generated: ${payload.generated_at}`,
    `Input catalysts: ${payload.input_count}`,
    `Targets without exact time: ${payload.target_count}`,
    `Refined source timestamps: ${payload.refined_count}`,
    `Same-day refined timestamps: ${payload.same_day_refined_count}`,
    `Fetch failures: ${payload.fetch_failed_count}`,
    "",
    "Note: refined times are accepted source page timestamps unless a future pass marks an explicit event-time basis. They help chart inspection, but do not prove the catalyst occurred at that exact minute.",
    "",
    "## Refined",
    "",
  ];

  for (const item of payload.items.filter((entry) => entry.refined_time_utc)) {
    lines.push(
      `- ${item.event_id} — ${item.refined_time_utc} (${item.refined_time_kind}, ${item.confidence})`,
    );
    lines.push(`  - ${item.headline}`);
    lines.push(`  - ${item.source_url}`);
  }

  lines.push("", "## Not Refined", "");

  for (const item of payload.items.filter((entry) => !entry.refined_time_utc)) {
    lines.push(`- ${item.event_id} — ${item.status}`);
    lines.push(`  - ${item.note}`);
    if (item.source_url) lines.push(`  - ${item.source_url}`);
  }

  return lines.join("\n");
}

export function parseArgs(argv = process.argv.slice(2)) {
  return {
    inputPath: readOption(argv, "--input") ?? INDEPENDENT_CATALYSTS_JSON_PATH,
    outputPath:
      readOption(argv, "--output") ?? CATALYST_TIME_REFINEMENTS_JSON_PATH,
    markdownPath:
      readOption(argv, "--markdown") ?? CATALYST_TIME_REFINEMENTS_MD_PATH,
    limit: integerOption(argv, "--limit", Infinity),
    timeoutMs: integerOption(argv, "--timeout-ms", DEFAULT_TIMEOUT_MS),
    live: flag(argv, "--live"),
  };
}

export async function runCatalystTimeRefinement(
  options = parseArgs(),
  { logger = console } = {},
) {
  if (!options.live) {
    throw new Error(
      "Catalyst time refinement fetches public source pages. Re-run with --live to allow network fetching.",
    );
  }

  await mkdir(CATALYST_TIME_REFINEMENT_CACHE_DIR, { recursive: true });
  const input = await readJson(options.inputPath);
  const items = input.items ?? [];
  const targets = items
    .filter((item) => !item.event_time_utc || item.time_granularity === "day")
    .slice(0, options.limit);

  const results = [];
  for (const [index, item] of targets.entries()) {
    logger.log(
      `[${index + 1}/${targets.length}] refining ${item.event_id} ${item.sources?.[0]?.url ?? ""}`,
    );
    const result = await refineItem(item, options);
    results.push(result);
    const cacheName = `${normalizeUrlToCacheName(result.source_url ?? item.event_id)}.json`;
    await writeJson(path.join(CATALYST_TIME_REFINEMENT_CACHE_DIR, cacheName), result);
  }

  const payload = {
    generated_at: new Date().toISOString(),
    input_path: options.inputPath,
    input_count: items.length,
    target_count: targets.length,
    refined_count: results.filter((item) => item.refined_time_utc).length,
    same_day_refined_count: results.filter(
      (item) => item.status === "refined_source_time_same_day",
    ).length,
    fetch_failed_count: results.filter((item) => item.status === "fetch_failed")
      .length,
    items: results,
  };

  await writeJson(options.outputPath, payload);
  await writeText(options.markdownPath, markdownReport(payload));

  logger.log(
    `Catalyst time refinement complete: ${payload.refined_count}/${payload.target_count} exact source timestamps found.`,
  );

  return payload;
}

if (isMain(import.meta.url)) {
  runCatalystTimeRefinement().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Catalyst time refinement failed.",
    );
    process.exitCode = 1;
  });
}
