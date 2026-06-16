import assert from "node:assert/strict";
import test from "node:test";

import { ALLOWED_SYMBOLS, type MarketSymbol } from "../config.ts";
import type {
  IncidentCandidate,
  SymbolEvidence,
} from "../services/detector/index.ts";
import {
  getRecentIncidentsForFeed,
  upsertIncidents,
} from "./incidentRepository.ts";
import { createMemoryD1 } from "../test/d1Memory.ts";

const forbiddenPublicTerms = [
  "buy",
  "sell",
  "long",
  "short",
  "hold",
  "price target",
  "trading signal",
];

function symbolEvidence(
  includedSymbols: MarketSymbol[] = [...ALLOWED_SYMBOLS],
): SymbolEvidence[] {
  return ALLOWED_SYMBOLS.map((symbol, index) => ({
    symbol,
    included_in_event: includedSymbols.includes(symbol),
    direction: includedSymbols.includes(symbol) ? "up" : "flat",
    signal_window: "15m",
    baseline_window: "24h",
    change_15m_pct: includedSymbols.includes(symbol) ? 1 + index / 10 : 0,
    price_z: includedSymbols.includes(symbol) ? 4 + index / 10 : 0,
    volume_ratio: includedSymbols.includes(symbol) ? 3 : 1,
    volatility_ratio: includedSymbols.includes(symbol) ? 3 : 1,
    severity_score: includedSymbols.includes(symbol) ? 80 : 0,
  }));
}

function candidate(input: {
  id: string;
  startedAt: string;
  scope?: "market_wide" | "market_day";
  direction?: "observed_up" | "observed_down" | "two_sided";
  symbols?: MarketSymbol[];
}): IncidentCandidate {
  const scope = input.scope ?? "market_wide";
  const direction = input.direction ?? "observed_up";
  const symbols = input.symbols ?? [...ALLOWED_SYMBOLS];

  return {
    id: input.id,
    incident_key: input.id,
    scope,
    direction,
    detected_at: input.startedAt,
    started_at: input.startedAt,
    ended_at: input.startedAt,
    signal_window: "15m",
    baseline_window: "24h",
    symbols,
    breadth_count: symbols.length,
    avg_15m_change_pct: 1.1,
    headline_severity: 82,
    max_elevated_severity: 90,
    peak_symbol: symbols[0],
    tier: "severe",
    symbol_evidence: symbolEvidence(symbols),
    sub_events: [],
    query_hints:
      scope === "market_day"
        ? {
            route: "two_sided_market_day",
            date_bound_query_required: true,
            second_search_allowed: true,
            no_trading_advice: true,
          }
        : {
            route:
              direction === "observed_down"
                ? "market_wide_down"
                : "market_wide_up",
            date_bound_query_required: true,
            second_search_allowed: false,
            no_trading_advice: true,
          },
  };
}

test("upsertIncidents is idempotent", async () => {
  const { db, tables } = createMemoryD1();
  const item = candidate({
    id: "bs_20260614_market_wide_up_1200",
    startedAt: "2026-06-14T12:00:00.000Z",
  });

  await upsertIncidents(db, [item]);
  await upsertIncidents(db, [item]);

  assert.equal(tables.incidents.length, 1);
  assert.equal(tables.incidents[0].status, "queued_for_analysis");
  assert.equal(tables.incidents[0].brief_status, "queued_for_analysis");
});

test("getRecentIncidentsForFeed returns newest first with queued brief and empty sources", async () => {
  const { db } = createMemoryD1();

  await upsertIncidents(db, [
    candidate({
      id: "bs_20260614_market_wide_up_1200",
      startedAt: "2026-06-14T12:00:00.000Z",
    }),
    candidate({
      id: "bs_20260615_market_day_two_sided",
      startedAt: "2026-06-15T09:00:00.000Z",
      scope: "market_day",
      direction: "two_sided",
    }),
  ]);

  const feed = await getRecentIncidentsForFeed(
    db,
    30,
    new Date("2026-06-16T00:00:00.000Z"),
  );

  assert.equal(feed.length, 2);
  assert.equal(feed[0].incident_id, "bs_20260615_market_day_two_sided");
  assert.equal(feed[0].symbol_evidence.length, 5);
  assert.deepEqual(feed[0].sources, []);
  assert.equal(feed[0].brief.status, "queued_for_analysis");
  assert.equal(feed[0].brief.label, "Waiting for Claude");
  assert.equal(feed[0].has_details, true);
  assert.equal(feed[0].expanded_details.symbol_evidence.length, 5);
});

test("public feed mapping avoids trading-advice wording", async () => {
  const { db } = createMemoryD1();

  await upsertIncidents(db, [
    candidate({
      id: "bs_20260614_market_wide_up_1200",
      startedAt: "2026-06-14T12:00:00.000Z",
    }),
  ]);

  const feed = await getRecentIncidentsForFeed(
    db,
    30,
    new Date("2026-06-16T00:00:00.000Z"),
  );
  const serialized = JSON.stringify(feed).toLowerCase();

  for (const term of forbiddenPublicTerms) {
    assert.equal(serialized.includes(term), false, term);
  }
});
