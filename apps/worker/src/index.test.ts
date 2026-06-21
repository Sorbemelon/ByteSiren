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
    tables.job_runs.some((row) => row.job_name === "poll_market"),
    false,
  );
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
