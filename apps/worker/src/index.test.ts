import assert from "node:assert/strict";
import test from "node:test";

import worker from "./index.ts";
import type { Env } from "./types/env.ts";
import { createMemoryD1 } from "./test/d1Memory.ts";
import type { IncidentRow } from "./db/incidentRepository.ts";
import type { MarketCandle } from "./types/market.ts";
import { persistClaudeFixtureBriefForTest } from "./db/claudeRepository.ts";

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

function makeEnv(options: { incidents?: IncidentRow[] } = {}): Env {
  const { db } = createMemoryD1({
    market_candles: seededRows(),
    incidents: options.incidents,
  });

  return {
    DB: db,
    APP_VERSION: "0.1.0-placeholder",
    BUILD_PHASE: "phase-4a-claude-foundation",
  };
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
    main_catalyst: { type: "macro_context" },
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
  assert.equal((await readJson(version)).phase, "phase-4a-claude-foundation");
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
    BUILD_PHASE: "phase-4a-claude-foundation",
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
  assert.equal(serialized.includes("Rejected Page"), false);
});
