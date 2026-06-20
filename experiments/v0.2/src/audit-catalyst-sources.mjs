#!/usr/bin/env node

import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  EXPERIMENT_ROOT,
  OUTPUTS_DIR,
  readJson,
  writeJson,
  writeText,
} from "./shared.mjs";

const CLAUDE_OUTPUTS_DIR = path.join(
  EXPERIMENT_ROOT,
  "claude-validation",
  "outputs",
);
const CATALYSTS_PATH = path.join(
  CLAUDE_OUTPUTS_DIR,
  "independent_catalyst_events_30d.json",
);
const REFINEMENTS_PATH = path.join(OUTPUTS_DIR, "catalyst_time_refinements.json");
const TIMING_AUDIT_PATH = path.join(
  OUTPUTS_DIR,
  "catalyst_signal_timing_audit.json",
);
export const SOURCE_AUDIT_JSON_PATH = path.join(
  OUTPUTS_DIR,
  "catalyst_source_audit.json",
);
export const SOURCE_AUDIT_MD_PATH = path.join(
  OUTPUTS_DIR,
  "catalyst_source_audit.md",
);
const SOURCE_AUDIT_CACHE_DIR = path.join(
  EXPERIMENT_ROOT,
  "data",
  "catalyst_source_audit",
);
const execFileAsync = promisify(execFile);

const RECAP_TITLE_PATTERNS = [
  /\bdaily market report\b/i,
  /\bcrypto daily\b/i,
  /\bmarket update\b/i,
  /\bmarket recap\b/i,
  /\bcrypto market today\b/i,
  /\bprice today\b/i,
  /\blatest crypto news update\b/i,
  /\bthis week in crypto\b/i,
  /\bweekly preview\b/i,
  /\bweekly market outlook\b/i,
  /\blive markets?\b/i,
  /\blive updates?\b/i,
];

const PRICE_PAGE_PATTERNS = [
  /\/crypto\/[A-Z]+\/?$/i,
  /\/coins-ai\//i,
  /\bprice\b/i,
];

const BROAD_ASSET_SYMBOLS = new Set(["BTC", "ETH", "SOL", "XRP", "BNB"]);
const SINGLE_ASSET_CONTEXT_HINTS = [
  /\bstellar\b/i,
  /\bxlm\b/i,
  /\btoncoin\b/i,
  /\bhyperliquid\b/i,
  /\bbnb etf\b/i,
  /\bxrp etf\b/i,
  /\bsolana etf\b/i,
  /\bmetamask\b/i,
];

const DIRECT_EVENT_HINTS = [
  /\bfomc\b/i,
  /\bcpi\b/i,
  /\bpce\b/i,
  /\bppi\b/i,
  /\bnonfarm payrolls?\b/i,
  /\bretail sales\b/i,
  /\brates?\b/i,
  /\bsanctions?\b/i,
  /\bofac\b/i,
  /\btreasury\b/i,
  /\bstrikes?\b/i,
  /\bmissiles?\b/i,
  /\bceasefire\b/i,
  /\bpeace deal\b/i,
  /\bhormuz\b/i,
  /\bapproves?\b/i,
  /\bapproval\b/i,
  /\blists?\b/i,
  /\blaunched?\b/i,
  /\bannounces?\b/i,
  /\bfiles?\b/i,
  /\bpurchases?\b/i,
  /\bseizes?\b/i,
  /\bdiscloses?\b/i,
  /\bmalware\b/i,
  /\bipo\b/i,
];

const MARKET_MECHANICS_HINTS = [
  /\bliquidat/i,
  /\boutflows?\b/i,
  /\binflows?\b/i,
  /\betfs?\b/i,
  /\bopen interest\b/i,
  /\bleverage\b/i,
  /\bforced\b/i,
  /\brotation\b/i,
  /\bshort squeeze\b/i,
  /\brisk appetite\b/i,
];

const OFFICIAL_HOST_HINTS = [
  "treasury.gov",
  "bls.gov",
  "dtcc.com",
  "prnewswire.com",
  "coinbase.com",
  "metamask.io",
];

function hasFlag(argv, name) {
  return argv.includes(name);
}

function integerOption(argv, name, fallback) {
  const index = argv.indexOf(name);
  const raw = index === -1 ? null : argv[index + 1];
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function hashUrl(url) {
  return crypto.createHash("sha256").update(String(url)).digest("hex").slice(0, 24);
}

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function matchesAny(value, patterns) {
  const input = text(value);
  return patterns.some((pattern) => pattern.test(input));
}

function safeHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function urlPathDepth(url) {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).length;
  } catch {
    return 0;
  }
}

function isRootUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/" || parsed.pathname === "";
  } catch {
    return false;
  }
}

function htmlTitle(html) {
  const match = String(html ?? "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return decodeHtml(match?.[1] ?? "").replace(/\s+/g, " ").trim() || null;
}

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "user-agent":
          "ByteSiren-v0.2-local-source-audit/1.0 (+offline experiment)",
      },
    });
    const contentType = response.headers.get("content-type") ?? "";
    const html = contentType.includes("text/html")
      ? await response.text()
      : "";
    return {
      checked_at: new Date().toISOString(),
      status: "fetched",
      ok: response.ok,
      http_status: response.status,
      final_url: response.url,
      content_type: contentType,
      page_title: htmlTitle(html.slice(0, 600_000)),
    };
  } catch (error) {
    return {
      checked_at: new Date().toISOString(),
      status: "fetch_failed",
      ok: false,
      http_status: null,
      final_url: null,
      content_type: null,
      page_title: null,
      error: error?.name === "AbortError" ? "timeout" : text(error?.message),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function curlHeaderCheck(url, timeoutMs) {
  const timeoutSec = Math.max(3, Math.ceil(timeoutMs / 1000));
  try {
    const result = await execFileAsync(
      "curl.exe",
      [
        "-I",
        "-L",
        "--max-time",
        String(timeoutSec),
        "--silent",
        "--show-error",
        "--write-out",
        "\nHTTP_CODE=%{http_code}\nFINAL_URL=%{url_effective}\n",
        url,
      ],
      {
        timeout: timeoutMs + 5000,
        windowsHide: true,
        maxBuffer: 2_000_000,
      },
    );
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    const codeMatch = output.match(/HTTP_CODE=(\d+)/);
    const finalUrlMatch = output.match(/FINAL_URL=(.+)/);
    const httpStatus = codeMatch ? Number.parseInt(codeMatch[1], 10) : null;
    const contentTypeMatch = output.match(/content-type:\s*([^\r\n]+)/i);
    return {
      checked_at: new Date().toISOString(),
      status: "fetched_via_curl",
      ok: Number.isFinite(httpStatus) && httpStatus >= 200 && httpStatus < 400,
      http_status: Number.isFinite(httpStatus) ? httpStatus : null,
      final_url: finalUrlMatch?.[1]?.trim() || url,
      content_type: contentTypeMatch?.[1]?.trim() ?? null,
      page_title: null,
      fetch_fallback_reason: "node_fetch_failed",
    };
  } catch (error) {
    const output = `${error?.stdout ?? ""}\n${error?.stderr ?? ""}`;
    const codeMatch = output.match(/HTTP_CODE=(\d+)/);
    const finalUrlMatch = output.match(/FINAL_URL=(.+)/);
    const httpStatus = codeMatch ? Number.parseInt(codeMatch[1], 10) : null;
    return {
      checked_at: new Date().toISOString(),
      status: "fetch_failed",
      ok: false,
      http_status: Number.isFinite(httpStatus) ? httpStatus : null,
      final_url: finalUrlMatch?.[1]?.trim() || null,
      content_type: null,
      page_title: null,
      error: text(error?.message) || "curl failed",
      fetch_fallback_reason: "node_fetch_failed",
    };
  }
}

async function powershellHeadCheck(url, timeoutMs) {
  const timeoutSec = Math.max(3, Math.ceil(timeoutMs / 1000));
  const escapedUrl = String(url).replaceAll("'", "''");
  const command = [
    "try {",
    `$r = Invoke-WebRequest -Uri '${escapedUrl}' -Method Head -TimeoutSec ${timeoutSec} -MaximumRedirection 5;`,
    "Write-Output ('STATUS=' + $r.StatusCode);",
    "Write-Output ('FINAL_URL=' + $r.BaseResponse.ResponseUri.AbsoluteUri);",
    "Write-Output ('CONTENT_TYPE=' + $r.Headers['Content-Type']);",
    "} catch {",
    "Write-Output ('ERROR=' + $_.Exception.Message);",
    "if ($_.Exception.Response) { Write-Output ('STATUS=' + [int]$_.Exception.Response.StatusCode) }",
    "}",
  ].join(" ");

  try {
    const result = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-Command", command],
      {
        timeout: timeoutMs + 5000,
        windowsHide: true,
        maxBuffer: 1_000_000,
      },
    );
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    const codeMatch = output.match(/STATUS=(\d+)/);
    const finalUrlMatch = output.match(/FINAL_URL=(.+)/);
    const contentTypeMatch = output.match(/CONTENT_TYPE=(.+)/);
    const errorMatch = output.match(/ERROR=(.+)/);
    const httpStatus = codeMatch ? Number.parseInt(codeMatch[1], 10) : null;
    return {
      checked_at: new Date().toISOString(),
      status:
        Number.isFinite(httpStatus) && httpStatus >= 200 && httpStatus < 400
          ? "fetched_via_powershell"
          : "fetch_failed",
      ok: Number.isFinite(httpStatus) && httpStatus >= 200 && httpStatus < 400,
      http_status: Number.isFinite(httpStatus) ? httpStatus : null,
      final_url: finalUrlMatch?.[1]?.trim() || url,
      content_type: contentTypeMatch?.[1]?.trim() ?? null,
      page_title: null,
      error: errorMatch?.[1]?.trim() ?? null,
      fetch_fallback_reason: "node_fetch_failed",
    };
  } catch (error) {
    const output = `${error?.stdout ?? ""}\n${error?.stderr ?? ""}`;
    const codeMatch = output.match(/STATUS=(\d+)/);
    const errorMatch = output.match(/ERROR=(.+)/);
    const httpStatus = codeMatch ? Number.parseInt(codeMatch[1], 10) : null;
    return {
      checked_at: new Date().toISOString(),
      status: "fetch_failed",
      ok: false,
      http_status: Number.isFinite(httpStatus) ? httpStatus : null,
      final_url: null,
      content_type: null,
      page_title: null,
      error: errorMatch?.[1]?.trim() || text(error?.message) || "PowerShell failed",
      fetch_fallback_reason: "node_fetch_failed",
    };
  }
}

async function checkUrl(url, options) {
  const cachePath = path.join(SOURCE_AUDIT_CACHE_DIR, `${hashUrl(url)}.json`);
  if (!options.force) {
    const cached = await readJsonIfExists(cachePath);
    if (cached) return { ...cached, cache_status: "hit" };
  }

  let checked = await fetchWithTimeout(url, options.timeoutMs);
  if (options.powershellFallback && checked.status === "fetch_failed") {
    checked = await powershellHeadCheck(url, options.timeoutMs);
  }
  if (options.curlFallback && checked.status === "fetch_failed") {
    checked = await curlHeaderCheck(url, options.timeoutMs);
  }
  await mkdir(SOURCE_AUDIT_CACHE_DIR, { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(checked, null, 2)}\n`, "utf8");
  return { ...checked, cache_status: "miss" };
}

async function checkUrls(urls, options) {
  if (!options.liveCheck) return new Map();
  const results = new Map();
  const queue = [...urls];
  const workerCount = Math.min(options.concurrency, queue.length);

  async function worker() {
    while (queue.length > 0) {
      const url = queue.shift();
      if (!url) continue;
      const result = await checkUrl(url, options);
      results.set(url, result);
      console.log(
        `source ${results.size}/${urls.length}: ${result.http_status ?? "fail"} ${url}`,
      );
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

function buildRefinementMap(refinements) {
  return new Map((refinements.items ?? []).map((item) => [item.event_id, item]));
}

function timestampForCatalyst(catalyst, refinementById) {
  if (
    catalyst.event_time_utc &&
    ["exact", "hour"].includes(catalyst.time_granularity)
  ) {
    return {
      timestamp_utc: catalyst.event_time_utc,
      timestamp_basis: "catalog_event_time",
      time_granularity: catalyst.time_granularity,
      refined_time_kind: null,
      timestamp_reliability:
        catalyst.time_granularity === "exact" ? "high" : "medium",
    };
  }

  const refinement = refinementById.get(catalyst.event_id);
  if (refinement?.refined_time_utc) {
    return {
      timestamp_utc: refinement.refined_time_utc,
      timestamp_basis: "source_published_time",
      time_granularity: catalyst.time_granularity ?? "day",
      refined_time_kind: refinement.refined_time_kind ?? null,
      timestamp_reliability:
        refinement.confidence === "medium"
          ? "medium"
          : refinement.refined_time_kind === "source_inline_iso_time"
            ? "medium"
            : "low",
    };
  }

  return {
    timestamp_utc: null,
    timestamp_basis: "missing",
    time_granularity: catalyst.time_granularity ?? null,
    refined_time_kind: null,
    timestamp_reliability: "none",
  };
}

function sourceFormat(source) {
  const value = `${source.title ?? ""} ${source.url ?? ""}`;
  if (isRootUrl(source.url)) return "root_or_homepage";
  if (matchesAny(value, RECAP_TITLE_PATTERNS)) return "daily_or_recap";
  if (matchesAny(value, PRICE_PAGE_PATTERNS)) return "price_page_or_coin_page";
  return "article_or_release";
}

function sourceAuthority(source) {
  const host = safeHost(source.url) ?? "";
  if (OFFICIAL_HOST_HINTS.some((hint) => host.endsWith(hint))) {
    return "official_or_primary";
  }
  if (
    /bloomberg|reuters|coindesk|cnbc|aljazeera|yahoo|theblock|bleepingcomputer/i.test(
      `${source.publisher ?? ""} ${host}`,
    )
  ) {
    return "major_or_specialist_media";
  }
  if (/kucoin|coinbase|kraken|robinhood|metamask/i.test(source.publisher ?? "")) {
    return "exchange_or_platform";
  }
  if (/coinstats|spotedcrypto|99bitcoins|blockchainreporter|phemex/i.test(
    `${source.publisher ?? ""} ${host}`,
  )) {
    return "aggregator_or_secondary";
  }
  return "specialist_or_unknown";
}

function broadAssetCoverage(catalyst) {
  const assets = catalyst.affected_assets ?? [];
  const tracked = assets.filter((asset) => BROAD_ASSET_SYMBOLS.has(asset));
  if (tracked.length >= 3) return "broad";
  if (tracked.includes("BTC") || tracked.includes("ETH")) return "btc_eth_anchor";
  if (tracked.length > 0) return "tracked_single_or_pair";
  return "outside_tracked_or_unclear";
}

function classifyContextQuality(catalyst, source, timingRow) {
  const combined = `${catalyst.headline ?? ""} ${catalyst.summary ?? ""} ${
    source.title ?? ""
  } ${source.why_relevant ?? ""}`;
  const format = sourceFormat(source);
  const coverage = broadAssetCoverage(catalyst);
  const isSingleAsset =
    coverage === "tracked_single_or_pair" &&
    matchesAny(combined, SINGLE_ASSET_CONTEXT_HINTS);
  const isRecapHeavy = format === "daily_or_recap";
  const direct = matchesAny(combined, DIRECT_EVENT_HINTS);
  const marketMechanics =
    ["liquidation", "etf_flows", "market_structure"].includes(
      catalyst.catalyst_type,
    ) || matchesAny(combined, MARKET_MECHANICS_HINTS);
  const afterSignal =
    timingRow?.timing_decision === "backdrop_after_signal" ? true : false;

  if (afterSignal) {
    return {
      context_quality: "backdrop_after_signal",
      context_decision: "demote_for_signal_cause",
      reason:
        "source timestamp is after the nearest Signal Event evidence window",
    };
  }

  if (isRootUrl(source.url) || format === "root_or_homepage") {
    return {
      context_quality: "root_or_generic_source",
      context_decision: "reject_or_replace",
      reason: "source URL is too generic for public attribution",
    };
  }

  if (format === "price_page_or_coin_page") {
    return {
      context_quality: "price_check_or_coin_page",
      context_decision: "demote_to_price_check",
      reason: "source is better as price confirmation than event cause",
    };
  }

  if (isSingleAsset) {
    return {
      context_quality: "single_asset_context",
      context_decision: "manual_review",
      reason: "source mainly supports a single-asset story, not broad market cause",
    };
  }

  if (marketMechanics && coverage !== "outside_tracked_or_unclear") {
    return {
      context_quality: "market_mechanics_catalyst",
      context_decision: isRecapHeavy ? "conditional_keep" : "keep",
      reason: isRecapHeavy
        ? "market mechanics are relevant, but source format is recap/daily-report"
        : "source supports flows, leverage, liquidation, or market-structure pressure",
    };
  }

  if (direct && coverage !== "outside_tracked_or_unclear") {
    return {
      context_quality: "direct_catalyst",
      context_decision: isRecapHeavy ? "conditional_keep" : "keep",
      reason: isRecapHeavy
        ? "discrete event is relevant, but source format is recap/daily-report"
        : "source supports a discrete macro, geopolitical, regulatory, or security event",
    };
  }

  if (isRecapHeavy) {
    return {
      context_quality: "recap_or_daily_backdrop",
      context_decision: "demote_to_backdrop",
      reason: "source is mainly daily/weekly recap context, not a clean trigger",
    };
  }

  return {
    context_quality: "conditional_backdrop",
    context_decision: "manual_review",
    reason: "source can provide context, but catalyst linkage is not direct",
  };
}

function compactSource(source) {
  return {
    title: source.title ?? null,
    publisher: source.publisher ?? null,
    url: source.url ?? null,
    published_at: source.published_at ?? null,
    tag: source.tag ?? null,
    why_relevant: source.why_relevant ?? null,
  };
}

function buildTimingMap(timingAudit) {
  const map = new Map();
  for (const scope of ["public_signals", "all_detected_events"]) {
    for (const row of timingAudit.scopes?.[scope]?.rows ?? []) {
      map.set(`${scope}:${row.catalyst_event_id}`, row);
    }
  }
  return map;
}

function rowForSource(catalyst, source, sourceIndex, refinementById, timingMap, live) {
  const timingPublic = timingMap.get(`public_signals:${catalyst.event_id}`) ?? null;
  const timingAll =
    timingMap.get(`all_detected_events:${catalyst.event_id}`) ?? null;
  const timestamp = timestampForCatalyst(catalyst, refinementById);
  const classification = classifyContextQuality(catalyst, source, timingPublic);
  const url = source.url ?? null;
  const liveCheck = url ? live.get(url) ?? null : null;
  const format = sourceFormat(source);
  const authority = sourceAuthority(source);

  return {
    catalyst_event_id: catalyst.event_id,
    catalyst_headline: catalyst.headline,
    catalyst_type: catalyst.catalyst_type,
    source_support: catalyst.source_support,
    confidence: catalyst.confidence,
    expected_market_direction: catalyst.expected_market_direction,
    affected_assets: catalyst.affected_assets ?? [],
    broad_asset_coverage: broadAssetCoverage(catalyst),
    source_index: sourceIndex,
    source: compactSource(source),
    source_url_hash: url ? hashUrl(url) : null,
    source_host: url ? safeHost(url) : null,
    source_path_depth: url ? urlPathDepth(url) : 0,
    source_format: format,
    source_authority: authority,
    event_timestamp: timestamp,
    public_signal_timing: timingPublic
      ? {
          timing_decision: timingPublic.timing_decision,
          nearest_signal: timingPublic.nearest_signal,
          catalyst_candidate_within_12h:
            timingPublic.catalyst_candidate_within_12h,
        }
      : null,
    all_detected_timing: timingAll
      ? {
          timing_decision: timingAll.timing_decision,
          nearest_signal: timingAll.nearest_signal,
          catalyst_candidate_within_12h: timingAll.catalyst_candidate_within_12h,
        }
      : null,
    context_quality: classification.context_quality,
    context_decision: classification.context_decision,
    context_reason: classification.reason,
    live_check: liveCheck
      ? {
          status: liveCheck.status,
          ok: liveCheck.ok,
          http_status: liveCheck.http_status,
          final_url: liveCheck.final_url,
          page_title: liveCheck.page_title,
          cache_status: liveCheck.cache_status,
          error: liveCheck.error ?? null,
        }
      : null,
  };
}

function countBy(rows, keyOrFn) {
  const out = {};
  const fn = typeof keyOrFn === "function" ? keyOrFn : (row) => row[keyOrFn];
  for (const row of rows) {
    const key = fn(row) ?? "unknown";
    out[key] = (out[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => a[0].localeCompare(b[0])));
}

function uniqueBy(rows, fn) {
  const map = new Map();
  for (const row of rows) {
    const key = fn(row);
    if (!map.has(key)) map.set(key, row);
  }
  return [...map.values()];
}

function uniqueUrlRows(rows) {
  return uniqueBy(
    rows.filter((row) => row.source.url),
    (row) => row.source.url,
  );
}

function buildSummary(rows, liveCheck) {
  const uniqueUrls = uniqueUrlRows(rows);
  const public12h = rows.filter(
    (row) => row.public_signal_timing?.catalyst_candidate_within_12h,
  );
  const public6h = rows.filter(
    (row) => row.public_signal_timing?.timing_decision === "strong_timing_match",
  );
  const allDetected12h = rows.filter(
    (row) => row.all_detected_timing?.catalyst_candidate_within_12h,
  );
  const auditEvidence12h = allDetected12h.filter(
    (row) =>
      row.all_detected_timing?.nearest_signal?.detection_scope ===
      "audit_event",
  );
  const public12hUnique = uniqueUrlRows(public12h);
  const allDetected12hUnique = uniqueUrlRows(allDetected12h);
  const auditEvidence12hUnique = uniqueUrlRows(auditEvidence12h);
  return {
    source_link_count: rows.length,
    unique_source_url_count: uniqueUrls.length,
    live_check_used: liveCheck,
    by_context_quality: countBy(rows, "context_quality"),
    by_context_decision: countBy(rows, "context_decision"),
    by_source_support: countBy(rows, "source_support"),
    by_source_format: countBy(rows, "source_format"),
    by_source_authority: countBy(rows, "source_authority"),
    by_timestamp_basis: countBy(rows, (row) => row.event_timestamp.timestamp_basis),
    by_timestamp_reliability: countBy(rows, (row) => row.event_timestamp.timestamp_reliability),
    by_public_signal_timing: countBy(
      rows,
      (row) => row.public_signal_timing?.timing_decision ?? "no_exact_public_timing",
    ),
    by_live_http_status: liveCheck
      ? countBy(uniqueUrls, (row) => row.live_check?.http_status ?? "fetch_failed")
      : {},
    public_signal_12h_source_link_count: public12h.length,
    public_signal_12h_unique_url_count: public12hUnique.length,
    public_signal_12h_by_context_decision: countBy(
      public12h,
      "context_decision",
    ),
    public_signal_12h_unique_url_by_context_decision: countBy(
      public12hUnique,
      "context_decision",
    ),
    public_signal_12h_by_context_quality: countBy(public12h, "context_quality"),
    public_signal_6h_source_link_count: public6h.length,
    public_signal_6h_by_context_decision: countBy(public6h, "context_decision"),
    all_detected_12h_source_link_count: allDetected12h.length,
    all_detected_12h_unique_url_count: allDetected12hUnique.length,
    all_detected_12h_by_context_decision: countBy(
      allDetected12h,
      "context_decision",
    ),
    all_detected_12h_unique_url_by_context_decision: countBy(
      allDetected12hUnique,
      "context_decision",
    ),
    audit_evidence_12h_source_link_count: auditEvidence12h.length,
    audit_evidence_12h_unique_url_count: auditEvidence12hUnique.length,
    audit_evidence_12h_by_context_decision: countBy(
      auditEvidence12h,
      "context_decision",
    ),
    audit_evidence_12h_unique_url_by_context_decision: countBy(
      auditEvidence12hUnique,
      "context_decision",
    ),
  };
}

function mdEscape(value) {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ")
    .trim();
}

function sourceLink(source) {
  const label = mdEscape(source.title || source.url || "-");
  return source.url ? `[${label}](${source.url})` : label;
}

function tableRows(rows, options = {}) {
  const limit = options.limit ?? 80;
  const selected = rows.slice(0, limit);
  return [
    "| Decision | Quality | Support | Timing | Catalyst | Source | Reason |",
    "|---|---|---|---|---|---|---|",
    ...selected.map((row) =>
      [
        row.context_decision,
        row.context_quality,
        row.source_support,
        row.public_signal_timing?.timing_decision ?? "-",
        mdEscape(row.catalyst_headline),
        sourceLink(row.source),
        mdEscape(row.context_reason),
      ].join(" | "),
    ),
    rows.length > limit ? `\n_Omitted ${rows.length - limit} rows._` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function bulletCounts(counts) {
  return Object.entries(counts)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n");
}

function buildMarkdown(audit) {
  const rows = audit.rows;
  const keepRows = rows.filter((row) => row.context_decision === "keep");
  const conditionalRows = rows.filter(
    (row) => row.context_decision === "conditional_keep",
  );
  const demoteRows = rows.filter((row) =>
    ["demote_to_backdrop", "demote_to_price_check", "demote_for_signal_cause"].includes(
      row.context_decision,
    ),
  );
  const reviewRows = rows.filter((row) => row.context_decision === "manual_review");
  const rejectRows = rows.filter((row) => row.context_decision === "reject_or_replace");

  return [
    "# Catalyst Source Audit",
    "",
    `Generated: ${audit.generated_at}`,
    "",
    "No Claude was used for this audit. It rechecks every accepted source link in the independent 30-day catalyst list and classifies whether the source supports a clean catalyst, market-mechanics catalyst, backdrop, price check, or manual-review context.",
    "",
    "## Scope",
    "",
    `- Catalyst candidates: ${audit.inputs.catalyst_count}`,
    `- Accepted source links: ${audit.summary.source_link_count}`,
    `- Unique source URLs: ${audit.summary.unique_source_url_count}`,
    `- Live URL check: ${audit.summary.live_check_used ? "yes" : "no"}`,
    "",
    "## Context Decision Counts",
    "",
    bulletCounts(audit.summary.by_context_decision),
    "",
    "## Timing-Supported Public Source Links",
    "",
    `Public Signal Event source links inside/leading by <=12h: ${audit.summary.public_signal_12h_source_link_count}`,
    `Public Signal Event unique source URLs inside/leading by <=12h: ${audit.summary.public_signal_12h_unique_url_count}`,
    "",
    bulletCounts(audit.summary.public_signal_12h_by_context_decision),
    "",
    "Public Signal Event unique URL decisions:",
    "",
    bulletCounts(audit.summary.public_signal_12h_unique_url_by_context_decision),
    "",
    `Public Signal Event source links inside/leading by <=6h: ${audit.summary.public_signal_6h_source_link_count}`,
    "",
    bulletCounts(audit.summary.public_signal_6h_by_context_decision),
    "",
    `All detected event source links inside/leading by <=12h: ${audit.summary.all_detected_12h_source_link_count}`,
    `All detected event unique source URLs inside/leading by <=12h: ${audit.summary.all_detected_12h_unique_url_count}`,
    "",
    bulletCounts(audit.summary.all_detected_12h_by_context_decision),
    "",
    "All detected event unique URL decisions:",
    "",
    bulletCounts(audit.summary.all_detected_12h_unique_url_by_context_decision),
    "",
    `Audit Evidence source links inside/leading by <=12h: ${audit.summary.audit_evidence_12h_source_link_count}`,
    `Audit Evidence unique source URLs inside/leading by <=12h: ${audit.summary.audit_evidence_12h_unique_url_count}`,
    "",
    bulletCounts(audit.summary.audit_evidence_12h_by_context_decision),
    "",
    "Audit Evidence unique URL decisions:",
    "",
    bulletCounts(audit.summary.audit_evidence_12h_unique_url_by_context_decision),
    "",
    "## Context Quality Counts",
    "",
    bulletCounts(audit.summary.by_context_quality),
    "",
    "## Timestamp Basis",
    "",
    bulletCounts(audit.summary.by_timestamp_basis),
    "",
    "## Source Format",
    "",
    bulletCounts(audit.summary.by_source_format),
    "",
    audit.summary.live_check_used
      ? ["## Live HTTP Status Counts", "", bulletCounts(audit.summary.by_live_http_status), ""].join("\n")
      : "",
    "## Keep",
    "",
    tableRows(keepRows, { limit: 80 }),
    "",
    "## Conditional Keep",
    "",
    tableRows(conditionalRows, { limit: 80 }),
    "",
    "## Manual Review",
    "",
    tableRows(reviewRows, { limit: 80 }),
    "",
    "## Demote",
    "",
    tableRows(demoteRows, { limit: 100 }),
    "",
    "## Reject Or Replace",
    "",
    tableRows(rejectRows, { limit: 80 }),
    "",
    "## Interpretation",
    "",
    "- `keep` means the source/catalyst pair can support a public catalyst candidate if timing also fits the Signal Event.",
    "- `conditional_keep` means the event is plausible, but the source is daily/recap-like or timestamp basis is weak enough to avoid strong intraday cause wording.",
    "- `manual_review` means the source may be useful, but it is single-asset, indirect, or not cleanly tied to the broad tracked basket.",
    "- `demote_*` means use as backdrop, price check, or post-event explanation rather than Signal Event cause.",
    "- `source_published_time` is not proof that the underlying catalyst happened at that minute.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function main() {
  const argv = process.argv.slice(2);
  const liveCheck = hasFlag(argv, "--live-check");
  const force = hasFlag(argv, "--force");
  const timeoutMs = integerOption(argv, "--timeout-ms", 15_000);
  const concurrency = integerOption(argv, "--concurrency", 5);
  const curlFallback = !hasFlag(argv, "--no-curl-fallback");
  const powershellFallback = !hasFlag(argv, "--no-powershell-fallback");

  const [catalystsData, refinements, timingAudit] = await Promise.all([
    readJson(CATALYSTS_PATH),
    readJson(REFINEMENTS_PATH),
    readJson(TIMING_AUDIT_PATH),
  ]);

  const catalysts = catalystsData.items ?? [];
  const sourceUrls = [
    ...new Set(
      catalysts.flatMap((catalyst) =>
        (catalyst.sources ?? []).map((source) => source.url).filter(Boolean),
      ),
    ),
  ].sort();

  const liveResults = await checkUrls(sourceUrls, {
    liveCheck,
    force,
    timeoutMs,
    concurrency,
    powershellFallback,
    curlFallback,
  });

  const refinementById = buildRefinementMap(refinements);
  const timingMap = buildTimingMap(timingAudit);
  const rows = catalysts.flatMap((catalyst) =>
    (catalyst.sources ?? []).map((source, sourceIndex) =>
      rowForSource(
        catalyst,
        source,
        sourceIndex,
        refinementById,
        timingMap,
        liveResults,
      ),
    ),
  );

  const audit = {
    generated_at: new Date().toISOString(),
    no_claude_used: true,
    inputs: {
      catalysts_path: CATALYSTS_PATH,
      refinements_path: REFINEMENTS_PATH,
      timing_audit_path: TIMING_AUDIT_PATH,
      catalyst_count: catalysts.length,
    },
    summary: buildSummary(rows, liveCheck),
    rows,
  };

  await writeJson(SOURCE_AUDIT_JSON_PATH, audit);
  await writeText(SOURCE_AUDIT_MD_PATH, buildMarkdown(audit));

  console.log("Catalyst source audit written:");
  console.log(`- ${SOURCE_AUDIT_JSON_PATH}`);
  console.log(`- ${SOURCE_AUDIT_MD_PATH}`);
  console.log(
    `Sources: ${audit.summary.source_link_count} links, ${audit.summary.unique_source_url_count} unique URLs`,
  );
  console.log(
    `Context decisions: ${JSON.stringify(audit.summary.by_context_decision)}`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
