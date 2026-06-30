import assert from "node:assert/strict";
import test from "node:test";

import worker from "./index.ts";
import type { Env } from "./types/env.ts";
import { createMemoryD1 } from "./test/d1Memory.ts";
import type { IncidentRow } from "./db/incidentRepository.ts";
import type { MarketCandle } from "./types/market.ts";
import { persistClaudeFixtureBriefForTest } from "./db/claudeRepository.ts";
import {
  CLAUDE_ENRICHMENT_CRON,
  CLEANUP_CRON,
  DETECTOR_CRON,
  GITHUB_INGEST_DISPATCH_CRON,
  LEGACY_POLL_MARKET_CRON,
} from "./config.ts";

const symbols = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
] as const;
const now = new Date("2026-06-16T12:00:00.000Z");
const removedV02SnapshotCron = "30 1 * * *";

function seededRows(): MarketCandle[] {
  return symbols.flatMap((symbol) =>
    Array.from({ length: 97 }, (_, offset) => {
      const minutesAgo = 96 - offset;
      const open = new Date(now.getTime() - minutesAgo * 15 * 60 * 1000);
      const close = new Date(open.getTime() + 15 * 60 * 1000 - 1);
      const basePrice = symbol === "BTCUSDT" ? 100 : 50;

      return {
        symbol,
        interval: "15m",
        open_time: open.toISOString(),
        close_time: close.toISOString(),
        open: basePrice + offset,
        high: basePrice + offset + 2,
        low: basePrice + offset - 2,
        close: basePrice + offset + 1,
        volume: 100 + offset,
        quote_volume: 1000 + offset,
        trade_count: offset,
      };
    }),
  );
}

function seededDetectorRows(): MarketCandle[] {
  const startMs = Date.parse("2026-06-14T00:00:00.000Z");

  return symbols.flatMap((symbol) => {
    let price = symbol === "BTCUSDT" ? 100 : 50;

    return Array.from({ length: 98 }, (_, offset) => {
      const open = new Date(startMs + offset * 15 * 60 * 1000);
      const close = new Date(open.getTime() + 15 * 60 * 1000 - 1);
      const isLast = offset === 97;
      const change = isLast ? 0.02 : offset % 2 === 0 ? 0.001 : -0.0008;
      const openPrice = price;
      price *= 1 + change;

      return {
        symbol,
        interval: "15m",
        open_time: open.toISOString(),
        close_time: close.toISOString(),
        open: openPrice,
        high: isLast ? price * 1.012 : price * 1.003,
        low: isLast ? openPrice * 0.988 : price * 0.997,
        close: price,
        volume: 100,
        quote_volume: isLast ? 5000 : 1000,
        trade_count: 10,
      };
    });
  });
}

function seededCompleteDayRows(dateUtc = "2026-06-15"): MarketCandle[] {
  const startMs = Date.parse(`${dateUtc}T00:00:00.000Z`);
  const changes: Record<(typeof symbols)[number], number> = {
    BTCUSDT: 5,
    ETHUSDT: 4,
    BNBUSDT: 3,
    SOLUSDT: 2,
    XRPUSDT: 1,
  };

  return symbols.flatMap((symbol) =>
    Array.from({ length: 96 }, (_, offset) => {
      const open = new Date(startMs + offset * 15 * 60 * 1000);
      const close = new Date(open.getTime() + 15 * 60 * 1000 - 1);
      const progress = offset / 95;
      const finalClose = 100 * (1 + changes[symbol] / 100);

      return {
        symbol,
        interval: "15m",
        open_time: open.toISOString(),
        close_time: close.toISOString(),
        open: 100,
        high: 103,
        low: 97,
        close: 100 + (finalClose - 100) * progress,
        volume: 100 + offset,
        quote_volume: 1000 + offset,
        trade_count: offset,
      };
    }),
  );
}

function seededIncident(): IncidentRow {
  const evidence = symbols.map((symbol, index) => ({
    symbol,
    included_in_event: true,
    direction: "up",
    signal_window: "15m",
    baseline_window: "24h",
    change_15m_pct: 1 + index / 10,
    price_z: 4 + index / 10,
    volume_ratio: 3,
    volatility_ratio: 3,
    severity_score: 80,
  }));

  return {
    id: "bs_20260615_market_wide_up_0900",
    incident_key: "bs_20260615_market_wide_up_0900",
    macro_day_cache_key: "2026-06-15_market_wide_observed_up_all",
    scope: "market_wide",
    direction: "observed_up",
    started_at: "2026-06-15T09:00:00.000Z",
    ended_at: "2026-06-15T09:14:59.999Z",
    signal_window: "15m",
    baseline_window: "24h",
    headline_severity: 82,
    severity_label: "Strong Move",
    breadth_count: 5,
    breadth_label: "5/5 pairs",
    symbols_json: JSON.stringify(symbols),
    tags_json: JSON.stringify(["same_day_context"]),
    sub_events_json: "[]",
    symbol_evidence_json: JSON.stringify(evidence),
    query_hints_json: JSON.stringify({
      route: "market_wide_up",
      date_bound_query_required: true,
      second_search_allowed: false,
      no_trading_advice: true,
    }),
    status: "queued_for_analysis",
    brief_status: "queued_for_analysis",
    created_at: "2026-06-15T09:00:00.000Z",
    updated_at: "2026-06-15T09:00:00.000Z",
  };
}

function seededSignalEventV02() {
  return {
    id: "sig_v02_route",
    date_utc: "2026-06-15",
    event_start: "2026-06-15T09:00:00.000Z",
    event_end: "2026-06-15T09:45:00.000Z",
    duration_min: 45,
    peak_time: "2026-06-15T09:15:00.000Z",
    direction: "observed_up",
    signals_count: 4,
    n_tracked: 5,
    avg_change_pct: 1.8,
    avg_change_method: "median_participating_symbols",
    event_strength_score: 82,
    impact_label: "High",
    chart_context_score: 88,
    chart_context_label: "Strong chart context",
    event_story_type: "range_break_up",
    trend_context: "trend_up",
    momentum_context: "impulse",
    volatility_context: "expansion_after_compression",
    event_range_context: "broad_broke_high",
    chart_context_reasons_json: JSON.stringify(["range break"]),
    chart_context_warnings_json: "[]",
    macro_aligned: 0,
    nearest_macro_event: null,
    macro_delta_min: null,
    source_route_hint: "broad_market",
    publish_candidate: 1,
    publish_reason: "strong context",
    suppress_reason: null,
    detector_version: "v02",
    created_at: "2026-06-15T09:00:00.000Z",
    updated_at: "2026-06-15T09:00:00.000Z",
  };
}

function seededSignalSymbolV02(signalEventId = "sig_v02_route") {
  return {
    id: `${signalEventId}_BTCUSDT`,
    signal_event_id: signalEventId,
    symbol: "BTCUSDT",
    window_change_pct: 2.2,
    peak_15m_change_pct: 1.1,
    volume_ratio: 2.5,
    range_position: "broke_high",
    prev_24h_high: 100,
    prev_24h_low: 90,
    range_break_direction: "up",
    range_break_pct: 1.2,
    range_break_strength: 0.7,
    distance_to_range_high_pct: 0.2,
    distance_to_range_low_pct: 8.2,
    is_lead_mover: 1,
    is_peak_15m_highlight: 1,
    participated: 1,
    evidence_json: "{}",
    created_at: "2026-06-15T09:00:00.000Z",
    updated_at: "2026-06-15T09:00:00.000Z",
  };
}

function seededDailyOverviewV02() {
  return {
    id: "daily_2026-06-15",
    date_utc: "2026-06-15",
    day_start: "2026-06-15T00:00:00.000Z",
    day_end: "2026-06-15T23:59:59.999Z",
    market_tone: "volatile",
    daily_change_pct: 2.2,
    daily_change_label: "24h Change",
    market_range_pct: 5.1,
    notable_symbols_json: JSON.stringify(["BTCUSDT"]),
    top_symbol_moves_json: JSON.stringify([
      { symbol: "BTCUSDT", change_pct: 2.2 },
    ]),
    signal_event_ids_json: JSON.stringify(["sig_v02_route"]),
    market_story_ids_json: "[]",
    audit_event_count: 0,
    daily_chart_context_summary_json: "{}",
    claude_status: "queued_for_analysis",
    claude_brief_id: null,
    created_at: "2026-06-16T00:10:00.000Z",
    updated_at: "2026-06-16T00:10:00.000Z",
  };
}

function makeEnv(
  options: {
    incidents?: IncidentRow[];
    publicWebOrigins?: string;
    adminEnabled?: boolean;
    v02AdminToolsEnabled?: boolean;
    v02ClaudeSampleToolsEnabled?: boolean;
    adminToken?: string;
    marketImportEnabled?: boolean;
    marketImportToken?: string;
    emptyMarket?: boolean;
  } = {},
): Env {
  const { db } = createMemoryD1({
    market_candles: options.emptyMarket ? [] : seededRows(),
    incidents: options.incidents,
  });

  return {
    DB: db,
    APP_VERSION: "0.1.0-placeholder",
    BUILD_PHASE: "phase-4a5-deployment-boundary",
    PUBLIC_WEB_ORIGINS: options.publicWebOrigins,
    ENABLE_ADMIN_MAINTENANCE: options.adminEnabled ? "true" : "false",
    ENABLE_V02_ADMIN_TOOLS: options.v02AdminToolsEnabled ? "true" : "false",
    ENABLE_V02_CLAUDE_SAMPLE_TOOLS: options.v02ClaudeSampleToolsEnabled
      ? "true"
      : "false",
    ADMIN_BACKFILL_TOKEN: options.adminToken,
    ENABLE_MARKET_IMPORT: options.marketImportEnabled ? "true" : "false",
    MARKET_IMPORT_TOKEN: options.marketImportToken,
  };
}

function sampleBinanceRow(openTimeMs = 1718327700000) {
  return [
    openTimeMs,
    "63000.00",
    "65000.00",
    "62800.00",
    "64775.20",
    "123.45",
    openTimeMs + 15 * 60 * 1000 - 1,
    "8000000.00",
    42,
    "0",
    "0",
    "0",
  ];
}

function sampleImportCandle(openTime = "2026-06-18T00:00:00.000Z") {
  const open = Date.parse(openTime);

  return {
    open_time: new Date(open).toISOString(),
    close_time: new Date(open + 15 * 60 * 1000 - 1).toISOString(),
    open: 65000,
    high: 65100,
    low: 64900,
    close: 65050,
    volume: 123.45,
    quote_volume: 8020000,
    trade_count: 12345,
  };
}

function importRequest(
  body: Record<string, unknown>,
  token = "market-import-token",
  headers: Record<string, string> = {},
): Request {
  return new Request("http://localhost/api/ingest/candles", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-bytesiren-market-token": token,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function scheduledController(cron: string): ScheduledController {
  return {
    cron,
    scheduledTime: now.getTime(),
    noRetry() {},
  } as ScheduledController;
}

function claudeFixture(incidentId: string) {
  return {
    schema_version: "1.0",
    generated_at: "2026-06-16T00:00:00.000Z",
    incident_id: incidentId,
    analysis_mode: "fixture_test",
    catalyst_status: "cause_likely",
    ui_label: "Likely Cause",
    headline: "Same-day context for broad crypto movement",
    brief_summary:
      "Same-day public reporting connected the broad crypto movement to macro context.",
    confidence: "medium",
    price_context_check: "matches_binance",
    main_catalyst: {
      type: "macro_context",
      why_it_matches_this_event:
        "The source discusses the same-day market backdrop near the detected event window.",
      confirmed_facts: [
        "The public report was published near the detected event date.",
      ],
    },
    broader_context: [{ note: "Same-day public context." }],
    caveats: [
      "This is same-day public context, not proof of exact 15-minute causation.",
    ],
    tags: ["same_day_context"],
    source_links: [
      {
        publisher: "Reuters",
        title: "Crypto market context",
        url: "https://www.reuters.com/markets/2026/06/15/crypto-context/",
        published_at: "2026-06-15",
        accessed_at: "2026-06-16T00:00:00.000Z",
        used_for: "likely_cause",
        source_strength: "strong",
      },
      {
        publisher: "Rejected Page",
        title: "Crypto forecast page",
        url: "https://example.com/forecast",
        used_for: "backdrop",
        source_strength: "weak",
      },
    ],
  };
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

async function withMockFetch<T>(
  fetcher: typeof fetch,
  fn: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetcher;

  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("worker returns health and version JSON", async () => {
  const env = makeEnv();

  const health = await worker.fetch(
    new Request("http://localhost/api/health"),
    env,
  );
  const version = await worker.fetch(
    new Request("http://localhost/api/version"),
    env,
  );

  assert.equal(health.status, 200);
  assert.equal(version.status, 200);
  assert.equal((await readJson(health)).service, "bytesiren-worker");
  assert.equal(
    (await readJson(version)).phase,
    "phase-4a5-deployment-boundary",
  );
});

test("worker allows local web origin for public API GET requests", async () => {
  const response = await worker.fetch(
    new Request("http://localhost/api/health", {
      headers: {
        origin: "http://localhost:3000",
      },
    }),
    makeEnv(),
  );

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    "http://localhost:3000",
  );
  assert.equal(response.headers.get("access-control-allow-credentials"), null);
});

test("worker allows configured production web origin for public API GET requests", async () => {
  const response = await worker.fetch(
    new Request("http://localhost/api/health", {
      headers: {
        origin: "https://bytesiren.pages.dev",
      },
    }),
    makeEnv({
      publicWebOrigins:
        "https://bytesiren.pages.dev, https://preview.bytesiren.pages.dev/path",
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    "https://bytesiren.pages.dev",
  );
  assert.equal(response.headers.get("access-control-allow-credentials"), null);
});

test("worker includes secondary local development origins by default", async () => {
  const response = await worker.fetch(
    new Request("http://localhost/api/health", {
      headers: {
        origin: "http://127.0.0.1:3001",
      },
    }),
    makeEnv(),
  );

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    "http://127.0.0.1:3001",
  );
});

test("worker handles local web CORS preflight without credentials", async () => {
  const response = await worker.fetch(
    new Request("http://localhost/api/market/latest", {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "GET",
      },
    }),
    makeEnv(),
  );

  assert.equal(response.status, 204);
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    "http://localhost:3000",
  );
  assert.match(
    response.headers.get("access-control-allow-methods") ?? "",
    /GET/,
  );
  assert.equal(response.headers.get("access-control-allow-credentials"), null);
});

test("worker allows POST CORS only for public view metrics", async () => {
  const metricsPreflight = await worker.fetch(
    new Request("http://localhost/api/metrics/views", {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "POST",
      },
    }),
    makeEnv(),
  );
  const marketPreflight = await worker.fetch(
    new Request("http://localhost/api/market/latest", {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "POST",
      },
    }),
    makeEnv(),
  );

  assert.equal(metricsPreflight.status, 204);
  assert.match(
    metricsPreflight.headers.get("access-control-allow-methods") ?? "",
    /POST/,
  );
  assert.doesNotMatch(
    marketPreflight.headers.get("access-control-allow-methods") ?? "",
    /POST/,
  );
});

test("worker rejects POST on non-metrics API routes without advertising POST CORS", async () => {
  const response = await worker.fetch(
    new Request("http://localhost/api/health", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
      },
    }),
    makeEnv(),
  );

  assert.equal(response.status, 405);
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    "http://localhost:3000",
  );
  assert.doesNotMatch(
    response.headers.get("access-control-allow-methods") ?? "",
    /POST/,
  );
});

test("worker does not allow arbitrary CORS origins", async () => {
  const response = await worker.fetch(
    new Request("http://localhost/api/health", {
      headers: {
        origin: "https://example.com",
      },
    }),
    makeEnv(),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});

test("scheduled crons no-op when scheduled jobs are frozen", async () => {
  const incident = seededIncident();
  const { db, tables } = createMemoryD1({
    market_candles: seededRows(),
    incidents: [incident],
    signal_events_v02: [seededSignalEventV02()],
  });
  const env: Env = {
    DB: db,
    ENABLE_SCHEDULED_JOBS: "false",
    MARKET_FETCH_MODE: "worker_fetch",
    DETECTOR_VERSION: "v02",
    ENABLE_DAILY_OVERVIEWS: "true",
    ENABLE_SIGNAL_CLAUDE_V02: "true",
    ENABLE_GITHUB_INGEST_DISPATCH: "true",
    ENABLE_V02_REFRESH_WORKFLOW_DISPATCH: "true",
    GITHUB_INGEST_DISPATCH_TOKEN: "secret-github-token",
    ANTHROPIC_API_KEY: "",
  };
  const fetcher: typeof fetch = async () => {
    throw new Error("fetch should not be called while scheduled jobs freeze");
  };

  await withMockFetch(fetcher, async () => {
    await worker.scheduled(
      scheduledController(GITHUB_INGEST_DISPATCH_CRON),
      env,
    );
    await worker.scheduled(scheduledController(removedV02SnapshotCron), env);
    await worker.scheduled(scheduledController(DETECTOR_CRON), env);
    await worker.scheduled(scheduledController(LEGACY_POLL_MARKET_CRON), env);
    await worker.scheduled(scheduledController(CLEANUP_CRON), env);
    await worker.scheduled(scheduledController(CLAUDE_ENRICHMENT_CRON), env);
  });

  assert.equal(tables.job_runs.length, 0);
  assert.equal(tables.incidents[0].status, incident.status);
  assert.equal(tables.signal_events_v02.length, 1);
  assert.equal(tables.daily_overviews_v02.length, 0);
  assert.equal(tables.claude_briefs.length, 0);
  assert.equal(tables.claude_briefs_v02.length, 0);
  assert.equal(tables.source_references.length, 0);
  assert.equal(tables.source_references_v02.length, 0);
});

test("scheduled detector cron runs detector only", async () => {
  const { db, tables } = createMemoryD1({
    market_candles: seededRows(),
  });
  const env: Env = {
    DB: db,
    MARKET_FETCH_MODE: "external_import",
  };

  await worker.scheduled(scheduledController(DETECTOR_CRON), env);

  assert.equal(
    tables.job_runs.some((row) => row.job_name === "run_detector"),
    true,
  );
  assert.equal(tables.signal_events_v02.length, 0);
  assert.equal(
    tables.job_runs.some(
      (row) => row.job_name === "run_incremental_signals_v02",
    ),
    false,
  );
  assert.equal(
    tables.job_runs.some((row) => row.job_name === "poll_market"),
    false,
  );
});

test("scheduled detector cron runs incremental v0.2 refresh only when enabled", async () => {
  const { db, tables } = createMemoryD1({
    market_candles: seededRows(),
  });
  const env: Env = {
    DB: db,
    MARKET_FETCH_MODE: "external_import",
    ENABLE_V02_INCREMENTAL_REFRESH: "true",
    ENABLE_V02_INCREMENTAL_SIGNALS: "true",
    ENABLE_V02_INCREMENTAL_MARKET_STORIES: "true",
  };

  await worker.scheduled(scheduledController(DETECTOR_CRON), env);

  const jobNames = tables.job_runs.map((row) => row.job_name);
  assert.equal(
    jobNames.indexOf("run_incremental_signals_v02") <
      jobNames.indexOf("run_detector"),
    true,
  );
  assert.equal(
    tables.job_runs.some((row) => row.job_name === "run_detector"),
    true,
  );
  assert.equal(
    tables.job_runs.some(
      (row) => row.job_name === "run_incremental_signals_v02",
    ),
    true,
  );
  assert.equal(
    tables.job_runs.some(
      (row) => row.job_name === "run_incremental_market_stories_v02",
    ),
    true,
  );
  assert.equal(tables.claude_briefs_v02.length, 0);
  assert.equal(tables.source_references_v02.length, 0);
});

test("scheduled detector cron can run v0.2 detector behind DETECTOR_VERSION", async () => {
  const { db, tables } = createMemoryD1({
    market_candles: seededRows(),
  });
  const env: Env = {
    DB: db,
    MARKET_FETCH_MODE: "external_import",
    DETECTOR_VERSION: "v02",
  };

  await worker.scheduled(scheduledController(DETECTOR_CRON), env);

  assert.equal(
    tables.job_runs.some((row) => row.job_name === "run_detector_v02"),
    true,
  );
  assert.equal(
    tables.job_runs.some((row) => row.job_name === "run_detector"),
    false,
  );
  assert.equal(tables.incidents.length, 0);
});

test("scheduled Claude cron runs enrichment only", async () => {
  const { db, tables } = createMemoryD1({
    market_candles: seededRows(),
    incidents: [seededIncident()],
  });
  const env: Env = {
    DB: db,
    MARKET_FETCH_MODE: "external_import",
  };

  await worker.scheduled(scheduledController(CLAUDE_ENRICHMENT_CRON), env);

  assert.equal(tables.incidents[0].status, "analysis_limited");
  assert.equal(tables.incidents[0].brief_status, "analysis_limited");
  assert.equal(
    tables.job_runs.some((row) => row.job_name === "claude_enrichment"),
    true,
  );
  assert.equal(
    tables.job_runs.some((row) => row.job_name === "run_detector"),
    false,
  );
});

test("scheduled Claude cron runs incremental v0.2 fallback when detector refresh is stale", async () => {
  const { db, tables } = createMemoryD1({
    market_candles: seededRows(),
    incidents: [seededIncident()],
  });
  const env: Env = {
    DB: db,
    MARKET_FETCH_MODE: "external_import",
    ENABLE_V02_INCREMENTAL_REFRESH: "true",
    ENABLE_V02_INCREMENTAL_SIGNALS: "true",
    ENABLE_V02_INCREMENTAL_MARKET_STORIES: "false",
  };

  await worker.scheduled(scheduledController(CLAUDE_ENRICHMENT_CRON), env);

  const incrementalJob = tables.job_runs.find(
    (row) => row.job_name === "run_incremental_signals_v02",
  );
  const metadata = JSON.parse(incrementalJob?.metadata_json ?? "{}") as {
    trigger_source?: string;
  };

  assert.ok(["success", "skipped"].includes(incrementalJob?.status ?? ""));
  assert.equal(metadata.trigger_source, "cloudflare_cron_fallback");
  assert.equal(
    tables.job_runs.some((row) => row.job_name === "claude_enrichment"),
    true,
  );
  assert.equal(
    tables.job_runs.some(
      (row) => row.job_name === "run_incremental_market_stories_v02",
    ),
    false,
  );
  assert.equal(tables.claude_briefs_v02.length, 0);
  assert.equal(tables.source_references_v02.length, 0);
});

test("scheduled Claude cron skips incremental v0.2 fallback after recent successful refresh", async () => {
  const recentStartedAt = new Date().toISOString();
  const { db, tables } = createMemoryD1({
    market_candles: seededRows(),
    incidents: [seededIncident()],
    job_runs: [
      {
        id: "recent_incremental_refresh",
        job_name: "run_incremental_signals_v02",
        status: "success",
        started_at: recentStartedAt,
        finished_at: recentStartedAt,
        message: "Recent incremental refresh.",
        metadata_json: "{}",
      },
    ],
  });
  const env: Env = {
    DB: db,
    MARKET_FETCH_MODE: "external_import",
    ENABLE_V02_INCREMENTAL_REFRESH: "true",
    ENABLE_V02_INCREMENTAL_SIGNALS: "true",
    ENABLE_V02_INCREMENTAL_MARKET_STORIES: "true",
  };

  await worker.scheduled(scheduledController(CLAUDE_ENRICHMENT_CRON), env);

  assert.equal(
    tables.job_runs.filter(
      (row) => row.job_name === "run_incremental_signals_v02",
    ).length,
    1,
  );
  assert.equal(
    tables.job_runs.some(
      (row) => row.job_name === "run_incremental_market_stories_v02",
    ),
    false,
  );
  assert.equal(
    tables.job_runs.some((row) => row.job_name === "claude_enrichment"),
    true,
  );
});

test("scheduled Claude cron uses v0.2 enrichment only when v0.2 Claude flags are enabled", async () => {
  const incident = seededIncident();
  const { db, tables } = createMemoryD1({
    market_candles: seededRows(),
    incidents: [incident],
    signal_events_v02: [seededSignalEventV02()],
  });
  const env: Env = {
    DB: db,
    MARKET_FETCH_MODE: "external_import",
    ENABLE_SIGNAL_CLAUDE_V02: "true",
    ANTHROPIC_API_KEY: "",
  };

  await worker.scheduled(scheduledController(CLAUDE_ENRICHMENT_CRON), env);

  assert.equal(tables.incidents[0].status, "queued_for_analysis");
  assert.equal(tables.incidents[0].brief_status, "queued_for_analysis");
  assert.equal(tables.claude_briefs_v02.length, 0);
  assert.equal(
    tables.job_runs.some((row) => row.job_name === "claude_enrichment_v02"),
    true,
  );
  assert.equal(
    tables.job_runs.some((row) => row.job_name === "claude_enrichment"),
    false,
  );
});

test("scheduled Claude cron ignores v0.2 sample tools flag alone", async () => {
  const incident = seededIncident();
  const { db, tables } = createMemoryD1({
    market_candles: seededRows(),
    incidents: [incident],
    signal_events_v02: [seededSignalEventV02()],
  });
  const env: Env = {
    DB: db,
    MARKET_FETCH_MODE: "external_import",
    ENABLE_V02_CLAUDE_SAMPLE_TOOLS: "true",
    ANTHROPIC_API_KEY: "",
  };

  await worker.scheduled(scheduledController(CLAUDE_ENRICHMENT_CRON), env);

  assert.equal(tables.claude_briefs_v02.length, 0);
  assert.equal(
    tables.job_runs.some((row) => row.job_name === "claude_enrichment_v02"),
    false,
  );
  assert.equal(
    tables.job_runs.some((row) => row.job_name === "claude_enrichment"),
    true,
  );
});

test("legacy poll cron is inert unless Worker fetch mode is enabled", async () => {
  const { db, tables } = createMemoryD1();
  const env: Env = {
    DB: db,
    MARKET_FETCH_MODE: "external_import",
  };

  await worker.scheduled(scheduledController(LEGACY_POLL_MARKET_CRON), env);

  assert.equal(tables.job_runs.length, 0);
});

test("scheduled GitHub ingest dispatch cron records successful dispatch", async () => {
  const { db, tables } = createMemoryD1();
  const env: Env = {
    DB: db,
    ENABLE_GITHUB_INGEST_DISPATCH: "true",
    GITHUB_INGEST_OWNER: "Sorbemelon",
    GITHUB_INGEST_REPO: "ByteSiren",
    GITHUB_INGEST_WORKFLOW: "market-ingest.yml",
    GITHUB_INGEST_REF: "main",
    GITHUB_INGEST_HOURS: "6",
    GITHUB_INGEST_SYMBOLS: "BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT,XRPUSDT",
    GITHUB_INGEST_DRY_RUN: "false",
    GITHUB_INGEST_DISPATCH_TOKEN: "secret-github-token",
  };
  let requestedUrl = "";
  const fetcher: typeof fetch = async (input, init) => {
    requestedUrl = String(input);
    const body = JSON.parse(String(init?.body)) as {
      ref: string;
      inputs: Record<string, string>;
    };

    assert.equal(body.ref, "main");
    assert.equal(body.inputs.hours, "6");
    assert.equal(body.inputs.dry_run, "false");
    assert.equal(Object.hasOwn(body.inputs, "days"), false);

    return new Response(null, { status: 204 });
  };

  await withMockFetch(fetcher, async () => {
    await worker.scheduled(
      scheduledController(GITHUB_INGEST_DISPATCH_CRON),
      env,
    );
  });

  const job = tables.job_runs.find(
    (row) => row.job_name === "github_ingest_dispatch",
  );
  const serializedJob = JSON.stringify(job);
  const metadata = JSON.parse(job?.metadata_json ?? "{}") as {
    status: number;
    workflow: string;
    ref: string;
    hours: string;
    symbols: string[];
  };

  assert.match(
    requestedUrl,
    /actions\/workflows\/market-ingest\.yml\/dispatches$/,
  );
  assert.equal(job?.status, "success");
  assert.equal(
    job?.message,
    "GitHub ingest workflow dispatched: market-ingest.yml on main for hours=6.",
  );
  assert.equal(metadata.status, 204);
  assert.equal(metadata.workflow, "market-ingest.yml");
  assert.equal(metadata.ref, "main");
  assert.equal(metadata.hours, "6");
  assert.deepEqual(metadata.symbols, [
    "BTCUSDT",
    "ETHUSDT",
    "BNBUSDT",
    "SOLUSDT",
    "XRPUSDT",
  ]);
  assert.equal(serializedJob.includes("secret-github-token"), false);
});

test("scheduled GitHub ingest dispatch records skipped when disabled", async () => {
  const { db, tables } = createMemoryD1();
  const env: Env = {
    DB: db,
    ENABLE_GITHUB_INGEST_DISPATCH: "false",
  };
  const fetcher: typeof fetch = async () => {
    throw new Error("fetch should not be called");
  };

  await withMockFetch(fetcher, async () => {
    await worker.scheduled(
      scheduledController(GITHUB_INGEST_DISPATCH_CRON),
      env,
    );
  });

  const job = tables.job_runs.find(
    (row) => row.job_name === "github_ingest_dispatch",
  );

  assert.equal(job?.status, "skipped");
  assert.equal(
    job?.message,
    "GitHub ingest dispatch skipped: ENABLE_GITHUB_INGEST_DISPATCH is not true.",
  );
});

test("old scheduled v0.2 snapshot refresh cron is inert", async () => {
  const { db, tables } = createMemoryD1();
  const env: Env = {
    DB: db,
    ENABLE_V02_REFRESH_WORKFLOW_DISPATCH: "true",
    GITHUB_REFRESH_WORKFLOW_REPO: "Sorbemelon/ByteSiren",
    GITHUB_REFRESH_WORKFLOW_FILE: "v02-snapshot-refresh.yml",
    GITHUB_REFRESH_WORKFLOW_REF: "main",
    GITHUB_INGEST_DISPATCH_TOKEN: "secret-github-token",
  };
  let called = false;
  const fetcher: typeof fetch = async (input, init) => {
    called = true;
    assert.equal(String(input).includes("/dispatches"), false);
    assert.equal(init, undefined);
    return new Response(null, { status: 204 });
  };

  await withMockFetch(fetcher, async () => {
    await worker.scheduled(scheduledController(removedV02SnapshotCron), env);
  });

  assert.equal(called, false);
  assert.equal(
    tables.job_runs.some(
      (row) => row.job_name === "v02_snapshot_refresh_dispatch",
    ),
    false,
  );
});

test("old scheduled v0.2 snapshot refresh cron is inert even when disabled", async () => {
  const { db, tables } = createMemoryD1();
  const env: Env = {
    DB: db,
    ENABLE_V02_REFRESH_WORKFLOW_DISPATCH: "false",
  };
  const fetcher: typeof fetch = async () => {
    throw new Error("fetch should not be called");
  };

  await withMockFetch(fetcher, async () => {
    await worker.scheduled(scheduledController(removedV02SnapshotCron), env);
  });

  const job = tables.job_runs.find(
    (row) => row.job_name === "v02_snapshot_refresh_dispatch",
  );

  assert.equal(job, undefined);
});

test("scheduled cleanup cron runs cleanup only", async () => {
  const { db, tables } = createMemoryD1({
    market_candles: seededRows(),
  });
  const env: Env = {
    DB: db,
  };

  await worker.scheduled(scheduledController(CLEANUP_CRON), env);

  assert.equal(
    tables.job_runs.some((row) => row.job_name === "cleanup_old_data"),
    true,
  );
  assert.equal(
    tables.job_runs.some((row) => row.job_name === "run_detector"),
    false,
  );
  assert.equal(
    tables.job_runs.some((row) => row.job_name === "run_daily_overviews_v02"),
    false,
  );
  assert.equal(tables.daily_overviews_v02.length, 0);
});

test("scheduled cleanup cron removes legacy Claude children before old incidents", async () => {
  const oldIncident: IncidentRow = {
    ...seededIncident(),
    id: "bs_20000101_market_wide_up_0900",
    incident_key: "bs_20000101_market_wide_up_0900",
    macro_day_cache_key: "2000-01-01_market_wide_observed_up_all",
    started_at: "2000-01-01T09:00:00.000Z",
    ended_at: "2000-01-01T09:14:59.999Z",
    created_at: "2000-01-01T09:00:00.000Z",
    updated_at: "2000-01-01T09:00:00.000Z",
  };
  const { db, tables } = createMemoryD1({
    incidents: [oldIncident],
    claude_briefs: [
      {
        id: "legacy_brief_old_incident",
        incident_id: oldIncident.id,
        analysis_mode: "market_day",
        catalyst_status: "cause_supported",
        ui_label: "Focused Cause",
        confidence: "medium",
        price_context_check: "matches_binance",
        headline: "Old brief",
        summary: "Old summary",
        focused_catalyst_json: "{}",
        main_catalyst_json: "{}",
        broader_context_json: "[]",
        caveats_json: "[]",
        tags_json: "[]",
        source_quality_meta_json: "{}",
        generated_at: "2000-01-01T10:00:00.000Z",
        created_at: "2000-01-01T10:00:00.000Z",
        updated_at: "2000-01-01T10:00:00.000Z",
      },
      {
        id: "legacy_brief_newer_than_cutoff_old_incident",
        incident_id: oldIncident.id,
        analysis_mode: "market_day",
        catalyst_status: "cause_likely",
        ui_label: "Likely Cause",
        confidence: "medium",
        price_context_check: "matches_binance",
        headline: "Newer brief attached to old incident",
        summary: "Newer summary",
        focused_catalyst_json: "{}",
        main_catalyst_json: "{}",
        broader_context_json: "[]",
        caveats_json: "[]",
        tags_json: "[]",
        source_quality_meta_json: "{}",
        generated_at: "2026-06-15T10:00:00.000Z",
        created_at: "2026-06-15T10:00:00.000Z",
        updated_at: "2026-06-15T10:00:00.000Z",
      },
    ],
    source_references: [
      {
        id: 1,
        brief_id: "legacy_brief_old_incident",
        publisher: "CoinDesk",
        title: "Old source",
        url: "https://www.coindesk.com/markets/2000/01/01/old",
        normalized_url: "www.coindesk.com/markets/2000/01/01/old",
        published_at: "2000-01-01",
        accessed_at: "2000-01-01T10:01:00.000Z",
        used_for: "backdrop",
        source_strength: "acceptable",
        created_at: "2000-01-01T10:01:00.000Z",
      },
      {
        id: 2,
        brief_id: "legacy_brief_newer_than_cutoff_old_incident",
        publisher: "CoinDesk",
        title: "Newer source for old incident",
        url: "https://www.coindesk.com/markets/2026/06/15/newer",
        normalized_url: "www.coindesk.com/markets/2026/06/15/newer",
        published_at: "2026-06-15",
        accessed_at: "2026-06-15T10:01:00.000Z",
        used_for: "backdrop",
        source_strength: "acceptable",
        created_at: "2026-06-15T10:01:00.000Z",
      },
    ],
  });
  const env: Env = {
    DB: db,
  };

  await worker.scheduled(scheduledController(CLEANUP_CRON), env);

  assert.equal(tables.source_references.length, 0);
  assert.equal(tables.claude_briefs.length, 0);
  assert.equal(tables.incidents.length, 0);
  assert.equal(tables.job_runs.at(-1)?.job_name, "cleanup_old_data");
  assert.equal(tables.job_runs.at(-1)?.status, "success");
});

test("scheduled cleanup cron can generate v0.2 Daily Overviews behind flag", async () => {
  const { db, tables } = createMemoryD1({
    market_candles: seededCompleteDayRows(),
  });
  const env: Env = {
    DB: db,
    ENABLE_DAILY_OVERVIEWS: "true",
  };

  await worker.scheduled(scheduledController(CLEANUP_CRON), env);

  assert.equal(
    tables.job_runs.some((row) => row.job_name === "cleanup_old_data"),
    true,
  );
  assert.equal(
    tables.job_runs.some((row) => row.job_name === "run_daily_overviews_v02"),
    true,
  );
  assert.equal(tables.daily_overviews_v02.length, 1);
  assert.equal(
    tables.daily_overviews_v02[0].claude_status,
    "queued_for_analysis",
  );
  assert.equal(tables.claude_briefs_v02.length, 0);
  assert.equal(tables.source_references_v02.length, 0);
});

test("scheduled cleanup cron can generate bounded v0.2 Daily Overviews behind incremental flag", async () => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const { db, tables } = createMemoryD1({
    market_candles: seededCompleteDayRows(yesterday),
  });
  const env: Env = {
    DB: db,
    ENABLE_DAILY_OVERVIEWS: "false",
    ENABLE_V02_INCREMENTAL_DAILY_OVERVIEWS: "true",
    V02_DAILY_OVERVIEW_LOOKBACK_DAYS: "5",
  };

  await worker.scheduled(scheduledController(CLEANUP_CRON), env);

  assert.equal(
    tables.job_runs.some((row) => row.job_name === "cleanup_old_data"),
    true,
  );
  assert.equal(
    tables.job_runs.some((row) => row.job_name === "run_daily_overviews_v02"),
    true,
  );
  assert.equal(tables.daily_overviews_v02.length, 1);
  assert.equal(
    tables.daily_overviews_v02[0].claude_status,
    "queued_for_analysis",
  );
  assert.equal(tables.claude_briefs_v02.length, 0);
  assert.equal(tables.source_references_v02.length, 0);
});

test("admin endpoint disabled returns not found without public CORS", async () => {
  const response = await worker.fetch(
    new Request("http://localhost/api/admin/binance-check?symbol=BTCUSDT", {
      headers: {
        origin: "http://localhost:3000",
        "x-bytesiren-admin-token": "test-admin-token",
      },
    }),
    makeEnv({ adminEnabled: false, adminToken: "test-admin-token" }),
  );

  assert.equal(response.status, 404);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});

test("admin endpoint rejects wrong token without exposing token value", async () => {
  const response = await worker.fetch(
    new Request("http://localhost/api/admin/binance-check?symbol=BTCUSDT", {
      headers: {
        "x-bytesiren-admin-token": "wrong-token",
      },
    }),
    makeEnv({ adminEnabled: true, adminToken: "secret-test-token" }),
  );
  const body = await response.text();

  assert.equal(response.status, 404);
  assert.equal(body.includes("secret-test-token"), false);
  assert.equal(body.includes("wrong-token"), false);
});

test("admin binance-check validates approved symbols", async () => {
  const response = await worker.fetch(
    new Request("http://localhost/api/admin/binance-check?symbol=DOGEUSDT", {
      headers: {
        "x-bytesiren-admin-token": "test-admin-token",
      },
    }),
    makeEnv({ adminEnabled: true, adminToken: "test-admin-token" }),
  );
  const body = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal(body.error && typeof body.error === "object", true);
});

test("admin binance-check uses small limit=1 request with mocked fetch", async () => {
  const requestedUrls: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    requestedUrls.push(String(input));
    return new Response(JSON.stringify([sampleBinanceRow()]), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  };

  await withMockFetch(fetcher, async () => {
    const response = await worker.fetch(
      new Request("http://localhost/api/admin/binance-check?symbol=BTCUSDT", {
        headers: {
          "x-bytesiren-admin-token": "test-admin-token",
        },
      }),
      makeEnv({ adminEnabled: true, adminToken: "test-admin-token" }),
    );
    const body = await readJson(response);
    const url = new URL(requestedUrls[0]);

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.symbol, "BTCUSDT");
    assert.equal(body.parsed_rows_count, 1);
    assert.equal(body.first_open_time, "2024-06-14T01:15:00.000Z");
    assert.equal(url.pathname, "/api/v3/klines");
    assert.equal(url.searchParams.get("symbol"), "BTCUSDT");
    assert.equal(url.searchParams.get("interval"), "15m");
    assert.equal(url.searchParams.get("limit"), "1");
  });
});

test("admin binance-check reports HTTP error safely", async () => {
  const upstreamBody = `Region unavailable.\n${"x".repeat(260)}`;
  const fetcher: typeof fetch = async () =>
    new Response(upstreamBody, {
      status: 451,
      headers: {
        "content-type": "text/plain",
      },
    });

  await withMockFetch(fetcher, async () => {
    const response = await worker.fetch(
      new Request("http://localhost/api/admin/binance-check?symbol=BTCUSDT", {
        headers: {
          "x-bytesiren-admin-token": "test-admin-token",
        },
      }),
      makeEnv({ adminEnabled: true, adminToken: "test-admin-token" }),
    );
    const body = await readJson(response);

    assert.equal(response.status, 200);
    assert.equal(body.ok, false);
    assert.equal(body.status, 451);
    assert.equal(body.error_code, "fetch_http_451");
    assert.equal(typeof body.message, "string");
    assert.equal((body.message as string).includes("\n"), false);
    assert.equal((body.message as string).length, 200);
  });
});

test("admin manual market poll requires token", async () => {
  const response = await worker.fetch(
    new Request("http://localhost/api/admin/market-poll", {
      method: "POST",
    }),
    makeEnv({ adminEnabled: true, adminToken: "test-admin-token" }),
  );

  assert.equal(response.status, 404);
});

test("admin manual market poll supports small recent one-symbol seed", async () => {
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("symbol"), "BTCUSDT");
    assert.equal(url.searchParams.get("limit"), "10");

    return new Response(JSON.stringify([sampleBinanceRow()]), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  };

  await withMockFetch(fetcher, async () => {
    const response = await worker.fetch(
      new Request(
        "http://localhost/api/admin/market-poll?mode=recent&limit=10&symbol=BTCUSDT",
        {
          method: "POST",
          headers: {
            "x-bytesiren-admin-token": "test-admin-token",
          },
        },
      ),
      makeEnv({
        adminEnabled: true,
        adminToken: "test-admin-token",
        emptyMarket: true,
      }),
    );
    const body = await readJson(response);

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.mode, "recent");
    assert.equal(body.symbols_attempted, 1);
    assert.equal(body.symbols_updated, 1);
    assert.deepEqual(body.failures, []);
  });
});

test("admin claude catch-up requires token", async () => {
  const response = await worker.fetch(
    new Request("http://localhost/api/admin/claude-catchup", {
      method: "POST",
    }),
    makeEnv({ adminEnabled: true, adminToken: "test-admin-token" }),
  );

  assert.equal(response.status, 404);
});

test("admin claude catch-up respects limit and returns safe summary", async () => {
  const first = seededIncident();
  const second: IncidentRow = {
    ...seededIncident(),
    id: "bs_20260615_market_wide_down_0915",
    incident_key: "bs_20260615_market_wide_down_0915",
    direction: "observed_down",
    started_at: "2026-06-15T09:15:00.000Z",
    ended_at: "2026-06-15T09:29:59.999Z",
  };
  const { db, tables } = createMemoryD1({
    market_candles: seededRows(),
    incidents: [first, second],
  });
  const env: Env = {
    DB: db,
    ENABLE_ADMIN_MAINTENANCE: "true",
    ADMIN_BACKFILL_TOKEN: "test-admin-token",
    ANTHROPIC_API_KEY: "",
  };
  const response = await worker.fetch(
    new Request("http://localhost/api/admin/claude-catchup", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bytesiren-admin-token": "test-admin-token",
      },
      body: JSON.stringify({
        limit: 1,
        include_limited: false,
        newest_first: true,
      }),
    }),
    env,
  );
  const body = await readJson(response);
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.processed, 1);
  assert.equal(body.limited, 1);
  assert.equal(body.failed_retryable, 0);
  assert.equal(body.brief_ready, 0);
  assert.equal(
    tables.incidents.filter(
      (incident) => incident.status === "analysis_limited",
    ).length,
    1,
  );
  assert.equal(serialized.includes("analysis_count"), false);
  assert.equal(serialized.includes("web_search_requests"), false);
  assert.equal(serialized.includes("test-admin-token"), false);
});

test("admin v0.2 pipeline is hidden unless both admin gates are enabled", async () => {
  const request = new Request("http://localhost/api/admin/v02/run-pipeline", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-bytesiren-admin-token": "test-admin-token",
      origin: "http://localhost:3000",
    },
    body: JSON.stringify({ steps: ["daily_overviews"] }),
  });
  const maintenanceOff = await worker.fetch(
    request.clone(),
    makeEnv({
      adminEnabled: false,
      v02AdminToolsEnabled: true,
      adminToken: "test-admin-token",
    }),
  );
  const toolsOff = await worker.fetch(
    request.clone(),
    makeEnv({
      adminEnabled: true,
      v02AdminToolsEnabled: false,
      adminToken: "test-admin-token",
    }),
  );
  const wrongToken = await worker.fetch(
    request.clone(),
    makeEnv({
      adminEnabled: true,
      v02AdminToolsEnabled: true,
      adminToken: "secret-admin-token",
    }),
  );
  const wrongTokenBody = await wrongToken.text();

  assert.equal(maintenanceOff.status, 404);
  assert.equal(toolsOff.status, 404);
  assert.equal(wrongToken.status, 404);
  assert.equal(maintenanceOff.headers.get("access-control-allow-origin"), null);
  assert.equal(toolsOff.headers.get("access-control-allow-origin"), null);
  assert.equal(wrongTokenBody.includes("secret-admin-token"), false);
  assert.equal(wrongTokenBody.includes("test-admin-token"), false);
});

test("admin v0.2 diagnostics is protected, read-only, and has no public CORS", async () => {
  const { db, tables } = createMemoryD1({
    market_candles: seededCompleteDayRows("2026-06-15"),
    signal_events_v02: [seededSignalEventV02()],
    daily_overviews_v02: [seededDailyOverviewV02()],
  });
  const request = new Request("http://localhost/api/admin/v02/diagnostics", {
    headers: {
      "x-bytesiren-admin-token": "test-admin-token",
      origin: "http://localhost:3000",
    },
  });
  const hidden = await worker.fetch(request.clone(), {
    DB: db,
    ENABLE_ADMIN_MAINTENANCE: "true",
    ENABLE_V02_ADMIN_TOOLS: "false",
    ADMIN_BACKFILL_TOKEN: "test-admin-token",
  });
  const response = await worker.fetch(request, {
    DB: db,
    ENABLE_ADMIN_MAINTENANCE: "true",
    ENABLE_V02_ADMIN_TOOLS: "true",
    ADMIN_BACKFILL_TOKEN: "test-admin-token",
    DETECTOR_VERSION: "v01",
    FEED_VERSION: "v01",
    ENABLE_DAILY_OVERVIEWS: "false",
  });
  const body = await readJson(response);
  const serialized = JSON.stringify(body);

  assert.equal(hidden.status, 404);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(body.ok, true);
  assert.equal(body.diagnostics_version, "v02_admin_diagnostics_v1");
  assert.equal(
    (body.feature_flags as Record<string, unknown>).enable_scheduled_jobs,
    true,
  );
  assert.equal(
    (body.v02_table_counts as Record<string, unknown>).signal_events_v02,
    1,
  );
  assert.equal(
    (body.v02_table_counts as Record<string, unknown>).daily_overviews_v02,
    1,
  );
  assert.equal(
    (body.estimated_work_size as Record<string, unknown>).symbol_count,
    5,
  );
  assert.equal(tables.job_runs.length, 0);
  assert.equal(serialized.includes("test-admin-token"), false);
});

test("admin v0.2 diagnostics reports stale started breadcrumbs without mutating", async () => {
  const { db, tables } = createMemoryD1({
    job_runs: [
      {
        id: "stale_started_detector",
        job_name: "admin_v02_pipeline",
        status: "started",
        started_at: "2026-06-12T00:00:00.000Z",
        finished_at: "2026-06-12T00:00:00.000Z",
        message: "v0.2 admin pipeline step started: detector.",
        metadata_json: JSON.stringify({
          step: "detector",
          date_from: "2026-06-12",
          date_to: "2026-06-12",
        }),
      },
      {
        id: "successful_detector",
        job_name: "run_detector_v02",
        status: "success",
        started_at: "2026-06-11T00:00:00.000Z",
        finished_at: "2026-06-11T00:00:01.000Z",
        message: "completed",
        metadata_json: "{}",
      },
    ],
  });
  const response = await worker.fetch(
    new Request("http://localhost/api/admin/v02/diagnostics", {
      headers: {
        "x-bytesiren-admin-token": "test-admin-token",
      },
    }),
    {
      DB: db,
      ENABLE_ADMIN_MAINTENANCE: "true",
      ENABLE_V02_ADMIN_TOOLS: "true",
      ADMIN_BACKFILL_TOKEN: "test-admin-token",
    },
  );
  const body = await readJson(response);
  const staleRows = body.stale_started_job_runs as Record<string, unknown>[];
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.equal(staleRows.length, 1);
  assert.equal(staleRows[0].job_name, "admin_v02_pipeline");
  assert.equal(staleRows[0].status, "started");
  assert.equal(tables.job_runs.length, 2);
  assert.equal(serialized.includes("test-admin-token"), false);
});

test("admin v0.2 pipeline rejects unbounded detector by default", async () => {
  const response = await worker.fetch(
    new Request("http://localhost/api/admin/v02/run-pipeline", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bytesiren-admin-token": "test-admin-token",
      },
      body: JSON.stringify({ steps: ["detector"] }),
    }),
    makeEnv({
      adminEnabled: true,
      v02AdminToolsEnabled: true,
      adminToken: "test-admin-token",
    }),
  );
  const body = await readJson(response);
  const error = body.error as { message: string };

  assert.equal(response.status, 400);
  assert.match(error.message, /allow_unbounded_detector=true/);
});

test("admin v0.2 bounded pipeline dry-run writes no rows or breadcrumbs", async () => {
  const { db, tables } = createMemoryD1({
    market_candles: [
      ...seededCompleteDayRows("2026-06-15"),
      ...seededCompleteDayRows("2026-06-16"),
    ],
  });
  const response = await worker.fetch(
    new Request("http://localhost/api/admin/v02/run-pipeline", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bytesiren-admin-token": "test-admin-token",
      },
      body: JSON.stringify({
        steps: ["detector", "daily_overviews"],
        mode: "bounded",
        date_utc: "2026-06-16",
      }),
    }),
    {
      DB: db,
      ENABLE_ADMIN_MAINTENANCE: "true",
      ENABLE_V02_ADMIN_TOOLS: "true",
      ENABLE_DAILY_OVERVIEWS: "true",
      ADMIN_BACKFILL_TOKEN: "test-admin-token",
    },
  );
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.dry_run, true);
  assert.deepEqual(body.steps_run, ["detector", "daily_overviews"]);
  assert.equal(tables.signal_events_v02.length, 0);
  assert.equal(tables.audit_events_v02.length, 0);
  assert.equal(tables.daily_overviews_v02.length, 0);
  assert.equal(tables.job_runs.length, 0);
});

test("admin v0.2 bounded pipeline live run writes breadcrumbs without Claude or source rows", async () => {
  const { db, tables } = createMemoryD1({
    market_candles: [
      ...seededCompleteDayRows("2026-06-14"),
      ...seededCompleteDayRows("2026-06-15"),
    ],
  });
  const response = await worker.fetch(
    new Request("http://localhost/api/admin/v02/run-pipeline", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bytesiren-admin-token": "test-admin-token",
      },
      body: JSON.stringify({
        steps: ["daily_overviews"],
        mode: "bounded",
        date_utc: "2026-06-15",
        dry_run: false,
      }),
    }),
    {
      DB: db,
      ENABLE_ADMIN_MAINTENANCE: "true",
      ENABLE_V02_ADMIN_TOOLS: "true",
      ENABLE_DAILY_OVERVIEWS: "true",
      ADMIN_BACKFILL_TOKEN: "test-admin-token",
    },
  );
  const body = await readJson(response);
  const adminRows = tables.job_runs.filter(
    (row) => row.job_name === "admin_v02_pipeline",
  );
  const started = adminRows.find((row) => row.status === "started");
  const startedMetadata = JSON.parse(started?.metadata_json ?? "{}");
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.dry_run, false);
  assert.equal(tables.daily_overviews_v02.length, 1);
  assert.equal(tables.claude_briefs_v02.length, 0);
  assert.equal(tables.source_references_v02.length, 0);
  assert.equal(Boolean(started), true);
  assert.equal(startedMetadata.step, "daily_overviews");
  assert.equal(startedMetadata.date_from, "2026-06-15");
  assert.equal(startedMetadata.date_to, "2026-06-15");
  assert.equal(
    adminRows.some((row) => row.status === "success"),
    true,
  );
  assert.equal(serialized.includes("test-admin-token"), false);
});

test("admin v0.2 bounded pipeline step failure returns structured JSON and failed breadcrumb", async () => {
  const jobRows: Array<{
    id: string;
    job_name: string;
    status: string;
    started_at: string;
    finished_at: string | null;
    message: string;
    metadata_json: string;
  }> = [];
  const db = {
    prepare(sql: string) {
      const statement = {
        params: [] as unknown[],
        bind(...params: unknown[]) {
          this.params = params;
          return this;
        },
        async run() {
          if (sql.includes("INSERT INTO job_runs")) {
            const [
              id,
              jobName,
              status,
              startedAt,
              finishedAt,
              message,
              metadataJson,
            ] = this.params as [
              string,
              string,
              string,
              string,
              string | null,
              string,
              string,
            ];
            jobRows.push({
              id,
              job_name: jobName,
              status,
              started_at: startedAt,
              finished_at: finishedAt,
              message,
              metadata_json: metadataJson,
            });
            return { success: true, meta: { changes: 1 } };
          }

          return { success: true, meta: { changes: 0 } };
        },
        async all() {
          if (sql.includes("FROM market_candles")) {
            throw new Error("forced detector candle read failure");
          }

          return { results: [] };
        },
        async first() {
          return null;
        },
      };

      return statement;
    },
  } as unknown as D1Database;
  const response = await worker.fetch(
    new Request("http://localhost/api/admin/v02/run-pipeline", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bytesiren-admin-token": "test-admin-token",
      },
      body: JSON.stringify({
        steps: ["detector"],
        mode: "bounded",
        date_utc: "2026-06-12",
        dry_run: false,
      }),
    }),
    {
      DB: db,
      ENABLE_ADMIN_MAINTENANCE: "true",
      ENABLE_V02_ADMIN_TOOLS: "true",
      ADMIN_BACKFILL_TOKEN: "test-admin-token",
    },
  );
  const body = await readJson(response);
  const error = body.error as Record<string, unknown>;
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 503);
  assert.equal(body.ok, false);
  assert.equal(error.code, "v02_pipeline_step_failed");
  assert.equal(error.step, "detector");
  assert.equal(error.date_utc, "2026-06-12");
  assert.equal(
    jobRows.some(
      (row) =>
        row.job_name === "admin_v02_pipeline" && row.status === "started",
    ),
    true,
  );
  assert.equal(
    jobRows.some(
      (row) => row.job_name === "admin_v02_pipeline" && row.status === "failed",
    ),
    true,
  );
  assert.equal(serialized.includes("test-admin-token"), false);
});

test("admin v0.2 pipeline can seed fixture experiment news without live Claude or legacy writes", async () => {
  const firstSignal = seededSignalEventV02();
  const secondSignal = {
    ...seededSignalEventV02(),
    id: "sig_v02_route_later",
    event_start: "2026-06-15T13:00:00.000Z",
    event_end: "2026-06-15T13:45:00.000Z",
    peak_time: "2026-06-15T13:15:00.000Z",
    created_at: "2026-06-15T13:00:00.000Z",
    updated_at: "2026-06-15T13:00:00.000Z",
  };
  const { db, tables } = createMemoryD1({
    market_candles: [
      ...seededCompleteDayRows("2026-06-15"),
      ...seededDetectorRows(),
    ],
    signal_events_v02: [firstSignal, secondSignal],
    incidents: [seededIncident()],
  });
  const env: Env = {
    DB: db,
    ENABLE_ADMIN_MAINTENANCE: "true",
    ENABLE_V02_ADMIN_TOOLS: "true",
    ENABLE_DAILY_OVERVIEWS: "true",
    ADMIN_BACKFILL_TOKEN: "test-admin-token",
  };
  const response = await worker.fetch(
    new Request("http://localhost/api/admin/v02/run-pipeline", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bytesiren-admin-token": "test-admin-token",
      },
      body: JSON.stringify({
        steps: ["detector", "market_stories", "daily_overviews"],
        allow_unbounded_detector: true,
        include_fixture_claude: true,
      }),
    }),
    env,
  );
  const body = await readJson(response);
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(body.steps_run, [
    "detector",
    "market_stories",
    "daily_overviews",
  ]);
  assert.equal(tables.signal_events_v02.length >= 1, true);
  assert.equal(tables.signal_event_symbols_v02.length >= 5, true);
  assert.equal(tables.market_stories_v02.length >= 1, true);
  assert.equal(tables.market_story_members_v02.length >= 2, true);
  assert.equal(tables.daily_overviews_v02.length >= 1, true);
  assert.equal(tables.claude_briefs_v02.length >= 1, true);
  assert.equal(tables.source_references_v02.length >= 1, true);
  assert.equal(tables.claude_briefs.length, 0);
  assert.equal(tables.source_references.length, 0);
  assert.equal(tables.incidents.length, 1);
  assert.equal(
    tables.source_references_v02.every(
      (row) => String(row.target_type) !== "market_story_v02",
    ),
    true,
  );
  assert.equal(
    tables.source_references_v02.some(
      (row) =>
        row.url.includes("coindesk.com") ||
        row.url.includes("cryptotimes.io") ||
        row.url.includes("cryptobriefing.com"),
    ),
    true,
  );
  assert.equal(
    tables.job_runs.some((row) => row.job_name === "run_detector_v02"),
    true,
  );
  assert.equal(
    tables.job_runs.some((row) => row.job_name === "run_market_stories_v02"),
    true,
  );
  assert.equal(
    tables.job_runs.some((row) => row.job_name === "run_daily_overviews_v02"),
    true,
  );
  assert.equal(serialized.includes("test-admin-token"), false);
  assert.equal(
    serialized.includes("Fixture Claude seeding is deferred"),
    false,
  );
  assert.equal(
    (body.fixture_claude as Record<string, unknown>).fixture_only,
    true,
  );
  assert.equal(
    (body.fixture_claude as Record<string, unknown>).status,
    "seeded",
  );
  assert.equal(
    Number(
      (body.fixture_claude as Record<string, unknown>).sources_written ?? 0,
    ) > 0,
    true,
  );
});

test("admin v0.2 pipeline validates requested steps", async () => {
  const response = await worker.fetch(
    new Request("http://localhost/api/admin/v02/run-pipeline", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bytesiren-admin-token": "test-admin-token",
      },
      body: JSON.stringify({ steps: ["claude"] }),
    }),
    makeEnv({
      adminEnabled: true,
      v02AdminToolsEnabled: true,
      adminToken: "test-admin-token",
    }),
  );
  const body = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal(body.error && typeof body.error === "object", true);
});

test("admin v0.2 Claude sample is hidden unless admin and sample gates are enabled", async () => {
  const request = new Request(
    "http://localhost/api/admin/v02/run-claude-sample",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bytesiren-admin-token": "test-admin-token",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify({ mode: "signal", dry_run: true }),
    },
  );
  const maintenanceOff = await worker.fetch(
    request.clone(),
    makeEnv({
      adminEnabled: false,
      v02AdminToolsEnabled: true,
      adminToken: "test-admin-token",
    }),
  );
  const toolsOff = await worker.fetch(
    request.clone(),
    makeEnv({
      adminEnabled: true,
      v02AdminToolsEnabled: false,
      adminToken: "test-admin-token",
    }),
  );
  const wrongToken = await worker.fetch(
    request.clone(),
    makeEnv({
      adminEnabled: true,
      v02AdminToolsEnabled: true,
      v02ClaudeSampleToolsEnabled: true,
      adminToken: "secret-admin-token",
    }),
  );
  const sampleToolsOff = await worker.fetch(
    request.clone(),
    makeEnv({
      adminEnabled: true,
      v02AdminToolsEnabled: true,
      v02ClaudeSampleToolsEnabled: false,
      adminToken: "test-admin-token",
    }),
  );
  const wrongTokenBody = await wrongToken.text();

  assert.equal(maintenanceOff.status, 404);
  assert.equal(toolsOff.status, 404);
  assert.equal(sampleToolsOff.status, 404);
  assert.equal(wrongToken.status, 404);
  assert.equal(maintenanceOff.headers.get("access-control-allow-origin"), null);
  assert.equal(toolsOff.headers.get("access-control-allow-origin"), null);
  assert.equal(sampleToolsOff.headers.get("access-control-allow-origin"), null);
  assert.equal(wrongTokenBody.includes("secret-admin-token"), false);
  assert.equal(wrongTokenBody.includes("test-admin-token"), false);
});

test("admin v0.2 Claude sample dry-run selects Signal targets without writing", async () => {
  const { db, tables } = createMemoryD1({
    signal_events_v02: [seededSignalEventV02()],
    signal_event_symbols_v02: [seededSignalSymbolV02()],
    daily_overviews_v02: [seededDailyOverviewV02()],
    incidents: [seededIncident()],
  });
  const response = await worker.fetch(
    new Request("http://localhost/api/admin/v02/run-claude-sample", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bytesiren-admin-token": "test-admin-token",
      },
      body: JSON.stringify({
        mode: "signal",
        limit: 99,
        dry_run: true,
      }),
    }),
    {
      DB: db,
      ENABLE_ADMIN_MAINTENANCE: "true",
      ENABLE_V02_ADMIN_TOOLS: "true",
      ENABLE_V02_CLAUDE_SAMPLE_TOOLS: "true",
      ENABLE_SIGNAL_CLAUDE_V02: "false",
      ENABLE_DAILY_CLAUDE: "false",
      ADMIN_BACKFILL_TOKEN: "test-admin-token",
    },
  );
  const body = await readJson(response);
  const serialized = JSON.stringify(body);
  const selected = body.selected as Array<Record<string, unknown>>;

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.dry_run, true);
  assert.equal(body.limit, 5);
  assert.equal(body.processed, 0);
  assert.equal(
    (body.scheduler_flags_state as Record<string, unknown>)
      .enable_signal_claude_v02,
    false,
  );
  assert.equal(
    (body.sample_tools_flag_state as Record<string, unknown>)
      .enable_v02_claude_sample_tools,
    true,
  );
  assert.equal(Array.isArray(body.selected), true);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].target_type, "signal_event_v02");
  assert.equal(serialized.includes("market_story_v02"), false);
  assert.equal(serialized.includes("audit_event_v02"), false);
  assert.equal(serialized.includes("incident_id"), false);
  assert.equal(serialized.includes("test-admin-token"), false);
  assert.equal(tables.claude_briefs_v02.length, 0);
  assert.equal(tables.source_references_v02.length, 0);
  assert.equal(tables.claude_briefs.length, 0);
  assert.equal(tables.source_references.length, 0);
});

test("admin v0.2 Claude sample requires sample tools flag", async () => {
  const response = await worker.fetch(
    new Request("http://localhost/api/admin/v02/run-claude-sample", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bytesiren-admin-token": "test-admin-token",
      },
      body: JSON.stringify({
        mode: "daily",
        dry_run: true,
      }),
    }),
    {
      DB: createMemoryD1().db,
      ENABLE_ADMIN_MAINTENANCE: "true",
      ENABLE_V02_ADMIN_TOOLS: "true",
      ENABLE_V02_CLAUDE_SAMPLE_TOOLS: "false",
      ENABLE_DAILY_CLAUDE: "false",
      ADMIN_BACKFILL_TOKEN: "test-admin-token",
    },
  );

  assert.equal(response.status, 404);
});

test("admin v0.2 refresh workflow dispatch requires v0.2 admin and dispatch flags", async () => {
  const request = new Request(
    "http://localhost/api/admin/v02/dispatch-refresh-workflow",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bytesiren-admin-token": "test-admin-token",
      },
      body: JSON.stringify({ dry_run: true }),
    },
  );
  const adminOff = await worker.fetch(request.clone(), {
    DB: createMemoryD1().db,
    ENABLE_ADMIN_MAINTENANCE: "false",
    ENABLE_V02_ADMIN_TOOLS: "true",
    ENABLE_V02_REFRESH_WORKFLOW_DISPATCH: "true",
    ADMIN_BACKFILL_TOKEN: "test-admin-token",
  });
  const toolsOff = await worker.fetch(request.clone(), {
    DB: createMemoryD1().db,
    ENABLE_ADMIN_MAINTENANCE: "true",
    ENABLE_V02_ADMIN_TOOLS: "false",
    ENABLE_V02_REFRESH_WORKFLOW_DISPATCH: "true",
    ADMIN_BACKFILL_TOKEN: "test-admin-token",
  });
  const dispatchOff = await worker.fetch(request.clone(), {
    DB: createMemoryD1().db,
    ENABLE_ADMIN_MAINTENANCE: "true",
    ENABLE_V02_ADMIN_TOOLS: "true",
    ENABLE_V02_REFRESH_WORKFLOW_DISPATCH: "false",
    ADMIN_BACKFILL_TOKEN: "test-admin-token",
  });

  assert.equal(adminOff.status, 404);
  assert.equal(toolsOff.status, 404);
  assert.equal(dispatchOff.status, 404);
  assert.equal(adminOff.headers.get("access-control-allow-origin"), null);
});

test("admin v0.2 incremental refresh requires v0.2 admin tools", async () => {
  const request = new Request(
    "http://localhost/api/admin/v02/run-incremental-refresh",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bytesiren-admin-token": "test-admin-token",
      },
      body: JSON.stringify({ dry_run: true }),
    },
  );
  const adminOff = await worker.fetch(request.clone(), {
    DB: createMemoryD1().db,
    ENABLE_ADMIN_MAINTENANCE: "false",
    ENABLE_V02_ADMIN_TOOLS: "true",
    ADMIN_BACKFILL_TOKEN: "test-admin-token",
  });
  const toolsOff = await worker.fetch(request.clone(), {
    DB: createMemoryD1().db,
    ENABLE_ADMIN_MAINTENANCE: "true",
    ENABLE_V02_ADMIN_TOOLS: "false",
    ADMIN_BACKFILL_TOKEN: "test-admin-token",
  });

  assert.equal(adminOff.status, 404);
  assert.equal(toolsOff.status, 404);
  assert.equal(adminOff.headers.get("access-control-allow-origin"), null);
});

test("admin v0.2 incremental refresh dry-run writes no rows", async () => {
  const { db, tables } = createMemoryD1({
    market_candles: seededRows(),
  });
  const response = await worker.fetch(
    new Request("http://localhost/api/admin/v02/run-incremental-refresh", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bytesiren-admin-token": "test-admin-token",
      },
      body: JSON.stringify({
        dry_run: true,
        target_window_hours: 6,
        lookback_hours: 24,
        market_story_open_ttl_hours: 72,
        run_market_stories: true,
        dispatch_claude: false,
      }),
    }),
    {
      DB: db,
      ENABLE_ADMIN_MAINTENANCE: "true",
      ENABLE_V02_ADMIN_TOOLS: "true",
      ADMIN_BACKFILL_TOKEN: "test-admin-token",
    },
  );
  const body = await readJson(response);
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.dry_run, true);
  assert.equal(
    (
      (body.result as Record<string, unknown>).market_stories as Record<
        string,
        unknown
      >
    ).open_ttl_hours,
    72,
  );
  assert.equal(serialized.includes("test-admin-token"), false);
  assert.equal(tables.signal_events_v02.length, 0);
  assert.equal(tables.market_stories_v02.length, 0);
  assert.equal(tables.claude_briefs_v02.length, 0);
  assert.equal(tables.source_references_v02.length, 0);
  assert.equal(tables.job_runs.length, 0);
});

test("admin v0.2 incremental refresh live requires confirmation", async () => {
  const response = await worker.fetch(
    new Request("http://localhost/api/admin/v02/run-incremental-refresh", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bytesiren-admin-token": "test-admin-token",
      },
      body: JSON.stringify({
        dry_run: false,
      }),
    }),
    {
      DB: createMemoryD1().db,
      ENABLE_ADMIN_MAINTENANCE: "true",
      ENABLE_V02_ADMIN_TOOLS: "true",
      ADMIN_BACKFILL_TOKEN: "test-admin-token",
    },
  );
  const body = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal((body.error as Record<string, unknown>).code, "invalid_request");
});

test("admin v0.2 refresh workflow dry-run does not call GitHub", async () => {
  const { db, tables } = createMemoryD1();
  const env: Env = {
    DB: db,
    ENABLE_ADMIN_MAINTENANCE: "true",
    ENABLE_V02_ADMIN_TOOLS: "true",
    ENABLE_V02_REFRESH_WORKFLOW_DISPATCH: "true",
    ADMIN_BACKFILL_TOKEN: "test-admin-token",
    GITHUB_REFRESH_WORKFLOW_REPO: "Sorbemelon/ByteSiren",
    GITHUB_REFRESH_WORKFLOW_FILE: "v02-snapshot-refresh.yml",
    GITHUB_REFRESH_WORKFLOW_REF: "main",
  };
  const fetcher: typeof fetch = async () => {
    throw new Error("fetch should not be called for dry-run");
  };
  const response = await withMockFetch(fetcher, () =>
    worker.fetch(
      new Request("http://localhost/api/admin/v02/dispatch-refresh-workflow", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bytesiren-admin-token": "test-admin-token",
        },
        body: JSON.stringify({
          dry_run: true,
          trigger_source: "admin_test",
        }),
      }),
      env,
    ),
  );
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.dry_run, true);
  assert.equal(body.dispatch_attempted, false);
  assert.equal(body.dispatch_status, "dry_run");
  assert.equal(body.workflow, "v02-snapshot-refresh.yml");
  assert.equal(body.ref, "main");
  assert.equal(body.token_present, false);
  assert.equal(tables.job_runs.length, 0);
});

test("admin v0.2 refresh workflow live dispatch requires confirmation", async () => {
  const response = await worker.fetch(
    new Request("http://localhost/api/admin/v02/dispatch-refresh-workflow", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bytesiren-admin-token": "test-admin-token",
      },
      body: JSON.stringify({
        dry_run: false,
      }),
    }),
    {
      DB: createMemoryD1().db,
      ENABLE_ADMIN_MAINTENANCE: "true",
      ENABLE_V02_ADMIN_TOOLS: "true",
      ENABLE_V02_REFRESH_WORKFLOW_DISPATCH: "true",
      ADMIN_BACKFILL_TOKEN: "test-admin-token",
    },
  );
  const body = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal((body.error as Record<string, unknown>).code, "invalid_request");
});

test("admin v0.2 refresh workflow live dispatch records safe job result", async () => {
  const { db, tables } = createMemoryD1();
  const env: Env = {
    DB: db,
    ENABLE_ADMIN_MAINTENANCE: "true",
    ENABLE_V02_ADMIN_TOOLS: "true",
    ENABLE_V02_REFRESH_WORKFLOW_DISPATCH: "true",
    ADMIN_BACKFILL_TOKEN: "test-admin-token",
    GITHUB_REFRESH_WORKFLOW_REPO: "Sorbemelon/ByteSiren",
    GITHUB_REFRESH_WORKFLOW_FILE: "v02-snapshot-refresh.yml",
    GITHUB_REFRESH_WORKFLOW_REF: "main",
    GITHUB_INGEST_DISPATCH_TOKEN: "secret-github-token",
  };
  const fetcher: typeof fetch = async (input) => {
    if (String(input).includes("/runs?")) {
      return Response.json({ workflow_runs: [] }, { status: 200 });
    }

    return new Response(null, { status: 204 });
  };
  const response = await withMockFetch(fetcher, () =>
    worker.fetch(
      new Request("http://localhost/api/admin/v02/dispatch-refresh-workflow", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bytesiren-admin-token": "test-admin-token",
        },
        body: JSON.stringify({
          dry_run: false,
          confirm_dispatch: true,
          trigger_source: "admin_test",
        }),
      }),
      env,
    ),
  );
  const body = await readJson(response);
  const serializedBody = JSON.stringify(body);
  const serializedJobs = JSON.stringify(tables.job_runs);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.dry_run, false);
  assert.equal(body.dispatch_attempted, true);
  assert.equal(body.dispatch_status, "dispatched");
  assert.equal(body.github_response_status, 204);
  assert.equal(body.job_status, "success");
  assert.equal(serializedBody.includes("secret-github-token"), false);
  assert.equal(serializedJobs.includes("secret-github-token"), false);
  assert.equal(
    tables.job_runs.some(
      (row) => row.job_name === "v02_snapshot_refresh_dispatch",
    ),
    true,
  );
});

test("admin v0.2 Claude sample live path skips safely without API key", async () => {
  const { db, tables } = createMemoryD1({
    daily_overviews_v02: [seededDailyOverviewV02()],
    claude_briefs: [
      {
        id: "legacy_brief",
        incident_id: "legacy_incident",
        analysis_mode: "web_search",
        catalyst_status: null,
        ui_label: "Market Backdrop",
        confidence: null,
        price_context_check: null,
        headline: null,
        summary: "Legacy",
        focused_catalyst_json: null,
        main_catalyst_json: null,
        broader_context_json: "{}",
        caveats_json: "[]",
        tags_json: "[]",
        source_quality_meta_json: "{}",
        generated_at: "2026-06-15T00:00:00.000Z",
        created_at: "2026-06-15T00:00:00.000Z",
        updated_at: "2026-06-15T00:00:00.000Z",
      },
    ],
  });
  const response = await worker.fetch(
    new Request("http://localhost/api/admin/v02/run-claude-sample", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bytesiren-admin-token": "test-admin-token",
      },
      body: JSON.stringify({
        mode: "daily",
        limit: 1,
        dry_run: false,
      }),
    }),
    {
      DB: db,
      ANTHROPIC_API_KEY: "",
      ENABLE_ADMIN_MAINTENANCE: "true",
      ENABLE_V02_ADMIN_TOOLS: "true",
      ENABLE_V02_CLAUDE_SAMPLE_TOOLS: "true",
      ENABLE_DAILY_CLAUDE: "false",
      ENABLE_SIGNAL_CLAUDE_V02: "false",
      ADMIN_BACKFILL_TOKEN: "test-admin-token",
    },
  );
  const body = await readJson(response);
  const serialized = JSON.stringify(body);
  const result = body.result as Record<string, unknown>;
  const countsBefore = body.counts_before as Record<string, unknown>;
  const countsAfter = body.counts_after as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.dry_run, false);
  assert.equal(body.processed, 0);
  assert.equal(result.status, "skipped");
  assert.equal(countsBefore.legacy_claude_briefs, 1);
  assert.equal(countsAfter.legacy_claude_briefs, 1);
  assert.equal(tables.claude_briefs_v02.length, 0);
  assert.equal(tables.source_references_v02.length, 0);
  assert.equal(tables.claude_briefs.length, 1);
  assert.equal(tables.source_references.length, 0);
  assert.equal(serialized.includes("user_prompt"), false);
  assert.equal(serialized.includes("system_prompt"), false);
  assert.equal(serialized.includes("ANTHROPIC"), false);
});

test("market candle import disabled returns not found without public CORS", async () => {
  const response = await worker.fetch(
    importRequest(
      {
        symbol: "BTCUSDT",
        interval: "15m",
        candles: [sampleImportCandle()],
      },
      "market-import-token",
      {
        origin: "http://localhost:3000",
      },
    ),
    makeEnv({
      marketImportEnabled: false,
      marketImportToken: "market-import-token",
      emptyMarket: true,
    }),
  );

  assert.equal(response.status, 404);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});

test("market candle import rejects wrong token without exposing token values", async () => {
  const response = await worker.fetch(
    importRequest(
      {
        symbol: "BTCUSDT",
        interval: "15m",
        candles: [sampleImportCandle()],
      },
      "wrong-market-token",
    ),
    makeEnv({
      marketImportEnabled: true,
      marketImportToken: "secret-market-token",
      emptyMarket: true,
    }),
  );
  const body = await response.text();

  assert.equal(response.status, 404);
  assert.equal(body.includes("secret-market-token"), false);
  assert.equal(body.includes("wrong-market-token"), false);
});

test("market candle import validates symbol and interval", async () => {
  const env = makeEnv({
    marketImportEnabled: true,
    marketImportToken: "market-import-token",
    emptyMarket: true,
  });
  const invalidSymbol = await worker.fetch(
    importRequest({
      symbol: "DOGEUSDT",
      interval: "15m",
      candles: [sampleImportCandle()],
    }),
    env,
  );
  const invalidInterval = await worker.fetch(
    importRequest({
      symbol: "BTCUSDT",
      interval: "1h",
      candles: [sampleImportCandle()],
    }),
    env,
  );

  assert.equal(invalidSymbol.status, 400);
  assert.equal(invalidInterval.status, 400);
});

test("market candle import rejects empty, oversized, and invalid OHLC payloads", async () => {
  const env = makeEnv({
    marketImportEnabled: true,
    marketImportToken: "market-import-token",
    emptyMarket: true,
  });
  const empty = await worker.fetch(
    importRequest({
      symbol: "BTCUSDT",
      interval: "15m",
      candles: [],
    }),
    env,
  );
  const tooMany = await worker.fetch(
    importRequest({
      symbol: "BTCUSDT",
      interval: "15m",
      candles: Array.from({ length: 501 }, () => sampleImportCandle()),
    }),
    env,
  );
  const invalidOhlc = await worker.fetch(
    importRequest({
      symbol: "BTCUSDT",
      interval: "15m",
      candles: [{ ...sampleImportCandle(), high: 100, low: 200 }],
    }),
    env,
  );

  assert.equal(empty.status, 400);
  assert.equal(tooMany.status, 400);
  assert.equal(invalidOhlc.status, 400);
});

test("market candle import upserts valid candles idempotently", async () => {
  const { db, tables } = createMemoryD1();
  const env: Env = {
    DB: db,
    ENABLE_MARKET_IMPORT: "true",
    MARKET_IMPORT_TOKEN: "market-import-token",
  };
  const body = {
    symbol: "BTCUSDT",
    interval: "15m",
    candles: [sampleImportCandle()],
    run_detector: false,
  };
  const first = await worker.fetch(importRequest(body), env);
  const second = await worker.fetch(importRequest(body), env);
  const firstBody = await readJson(first);
  const secondBody = await readJson(second);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(firstBody.received, 1);
  assert.equal(secondBody.received, 1);
  assert.equal(tables.market_candles.length, 1);
  assert.equal(tables.market_candles[0].symbol, "BTCUSDT");
  assert.equal(
    tables.job_runs.some((row) => row.job_name === "run_detector"),
    false,
  );
});

test("market candle import can run detector safely after import", async () => {
  const { db, tables } = createMemoryD1();
  const env: Env = {
    DB: db,
    ENABLE_MARKET_IMPORT: "true",
    MARKET_IMPORT_TOKEN: "market-import-token",
  };
  const response = await worker.fetch(
    importRequest({
      symbol: "BTCUSDT",
      interval: "15m",
      candles: [sampleImportCandle()],
      run_detector: true,
    }),
    env,
  );
  const body = await readJson(response);
  const detector = body.detector as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(detector.ran, true);
  assert.equal(detector.status, "skipped");
  assert.equal(detector.candidate_count, 0);
  assert.equal(
    tables.job_runs.some((row) => row.job_name === "run_detector"),
    true,
  );
});

test("market candle import endpoint does not expose public CORS", async () => {
  const response = await worker.fetch(
    importRequest(
      {
        symbol: "BTCUSDT",
        interval: "15m",
        candles: [sampleImportCandle()],
      },
      "market-import-token",
      {
        origin: "http://localhost:3000",
      },
    ),
    makeEnv({
      marketImportEnabled: true,
      marketImportToken: "market-import-token",
      emptyMarket: true,
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});

test("worker returns public view metrics shape", async () => {
  const response = await worker.fetch(
    new Request("http://localhost/api/metrics/views"),
    makeEnv(),
  );
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.today_utc, new Date().toISOString().slice(0, 10));
  assert.equal(body.total_views, 0);
  assert.equal(body.today_views, 0);
  assert.equal(typeof body.updated_at, "string");
});

test("worker increments public view metrics without storing request identity", async () => {
  const { db, tables } = createMemoryD1();
  const env: Env = {
    DB: db,
    APP_VERSION: "0.1.0-placeholder",
    BUILD_PHASE: "phase-4a5-deployment-boundary",
  };

  const first = await worker.fetch(
    new Request("http://localhost/api/metrics/views", {
      method: "POST",
      headers: {
        "user-agent": "Test Browser",
        "cf-connecting-ip": "203.0.113.7",
      },
    }),
    env,
  );
  const second = await worker.fetch(
    new Request("http://localhost/api/metrics/views", { method: "POST" }),
    env,
  );
  const firstBody = await readJson(first);
  const secondBody = await readJson(second);
  const storedKeys = Object.keys(tables.public_view_counts[0] ?? {});

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(firstBody.today_views, 1);
  assert.equal(secondBody.today_views, 2);
  assert.equal(secondBody.total_views, 2);
  assert.deepEqual(storedKeys.sort(), ["updated_at", "view_date", "views"]);
});

test("worker returns latest market summary for the approved symbols", async () => {
  const response = await worker.fetch(
    new Request("http://localhost/api/market/latest"),
    makeEnv(),
  );
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(Array.isArray(body.symbols), true);
  assert.equal((body.symbols as unknown[]).length, 5);
});

test("worker returns visible candle history for an approved symbol", async () => {
  const response = await worker.fetch(
    new Request("http://localhost/api/market/candles?symbol=BTCUSDT"),
    makeEnv(),
  );
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.symbol, "BTCUSDT");
  assert.equal(body.interval, "15m");
  assert.equal(body.range_days, 30);
  assert.equal(Array.isArray(body.candles), true);
});

test("worker rejects unsupported market symbols", async () => {
  const response = await worker.fetch(
    new Request("http://localhost/api/market/candles?symbol=DOGEUSDT"),
    makeEnv(),
  );
  const body = await readJson(response);

  assert.equal(response.status, 400);
  assert.deepEqual(body.error, {
    code: "invalid_symbol",
    message: "Symbol must be one of the approved markets.",
  });
});

test("worker returns an empty intelligence feed", async () => {
  const response = await worker.fetch(
    new Request("http://localhost/api/intelligence/feed"),
    makeEnv(),
  );
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.range_days, 30);
  assert.deepEqual(body.items, []);
});

test("worker keeps v0.1 intelligence feed as the default when v0.2 rows exist", async () => {
  const { db } = createMemoryD1({
    signal_events_v02: [seededSignalEventV02()],
    daily_overviews_v02: [seededDailyOverviewV02()],
  });
  const response = await worker.fetch(
    new Request("http://localhost/api/intelligence/feed"),
    { DB: db },
  );
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(Object.hasOwn(body, "version"), false);
  assert.deepEqual(body.items, []);
  assert.equal(Object.hasOwn(body, "day_groups"), false);
});

test("worker returns v0.2 grouped intelligence feed only behind FEED_VERSION=v02", async () => {
  const { db } = createMemoryD1({
    signal_events_v02: [seededSignalEventV02()],
    daily_overviews_v02: [seededDailyOverviewV02()],
  });
  const env: Env = {
    DB: db,
    FEED_VERSION: "v02",
  };
  const response = await worker.fetch(
    new Request("http://localhost/api/intelligence/feed"),
    env,
  );
  const body = await readJson(response);
  const dayGroups = body.day_groups as Array<Record<string, unknown>>;
  const firstGroup = dayGroups[0];
  const items = firstGroup.items as Array<Record<string, unknown>>;

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.version, "v02");
  assert.equal(body.grouping, "utc_day");
  assert.equal(dayGroups.length, 1);
  assert.deepEqual(
    items.map((item) => item.item_type),
    ["daily_overview", "signal_event"],
  );
  assert.equal(firstGroup.default_collapsed_item_id, "daily_2026-06-15");
});

test("worker returns intelligence feed items with queued brief shape", async () => {
  const response = await worker.fetch(
    new Request("http://localhost/api/intelligence/feed"),
    makeEnv({ incidents: [seededIncident()] }),
  );
  const body = await readJson(response);
  const items = body.items as Array<Record<string, unknown>>;
  const first = items[0];
  const brief = first?.brief as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(items.length, 1);
  assert.equal(first?.incident_id, "bs_20260615_market_wide_up_0900");
  assert.equal(first?.event_start_time, "2026-06-15T09:00:00.000Z");
  assert.equal(first?.event_end_time, "2026-06-15T09:14:59.999Z");
  assert.equal(first?.peak_time, "2026-06-15T09:00:00.000Z");
  assert.equal(first?.first_detected_at, "2026-06-15T09:00:00.000Z");
  assert.equal(first?.last_evaluated_at, "2026-06-15T09:00:00.000Z");
  assert.equal(Array.isArray(first?.sources), true);
  assert.equal((first?.sources as unknown[]).length, 0);
  assert.equal(brief.status, "queued_for_analysis");
});

test("worker returns stored Claude fixture brief and accepted sources only", async () => {
  const incident = seededIncident();
  const { db } = createMemoryD1({
    market_candles: seededRows(),
    incidents: [incident],
  });
  const env: Env = {
    DB: db,
    APP_VERSION: "0.1.0-placeholder",
    BUILD_PHASE: "phase-4a5-deployment-boundary",
  };

  await persistClaudeFixtureBriefForTest(db, claudeFixture(incident.id), {
    eventDate: incident.started_at,
  });

  const response = await worker.fetch(
    new Request("http://localhost/api/intelligence/feed"),
    env,
  );
  const body = await readJson(response);
  const items = body.items as Array<Record<string, unknown>>;
  const first = items[0];
  const brief = first?.brief as Record<string, unknown>;
  const sources = first?.sources as Array<Record<string, unknown>>;
  const expanded = first?.expanded_details as Record<string, unknown>;
  const context = expanded.claude_context as Record<string, unknown>;
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.equal(brief.status, "brief_ready");
  assert.equal(brief.label, "Likely Cause");
  assert.equal(sources.length, 1);
  assert.equal(sources[0].publisher, "Reuters");
  assert.equal(
    sources[0].url,
    "https://www.reuters.com/markets/2026/06/15/crypto-context/",
  );
  assert.match(
    String(context.summary),
    /same-day market backdrop near the detected event window/i,
  );
  assert.notEqual(context.summary, brief.summary);
  assert.equal(serialized.includes("Rejected Page"), false);
});
