import assert from "node:assert/strict";
import test from "node:test";

import { ALLOWED_SYMBOLS, type MarketSymbol } from "../config.ts";
import {
  getAcceptedSourcesForBrief,
  markIncidentAnalysisLimited,
  persistClaudeFixtureBriefForTest,
} from "./claudeRepository.ts";
import {
  getRecentIncidentsForFeed,
  upsertIncidents,
} from "./incidentRepository.ts";
import type {
  IncidentCandidate,
  SymbolEvidence,
} from "../services/detector/index.ts";
import { CLAUDE_LIMITED_SUMMARY } from "../services/claude/index.ts";
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

function evidence(symbols: MarketSymbol[]): SymbolEvidence[] {
  return ALLOWED_SYMBOLS.map((symbol, index) => ({
    symbol,
    included_in_event: symbols.includes(symbol),
    direction: symbols.includes(symbol) ? "up" : "flat",
    signal_window: "15m",
    baseline_window: "24h",
    change_15m_pct: symbols.includes(symbol) ? 1 + index / 10 : 0,
    price_z: symbols.includes(symbol) ? 4 : 0,
    volume_ratio: symbols.includes(symbol) ? 3 : 1,
    volatility_ratio: symbols.includes(symbol) ? 3 : 1,
    severity_score: symbols.includes(symbol) ? 82 : 0,
  }));
}

function candidate(id = "bs_20260614_market_wide_up_1200"): IncidentCandidate {
  const symbols = [...ALLOWED_SYMBOLS];

  return {
    id,
    incident_key: id,
    scope: "market_wide",
    direction: "observed_up",
    detected_at: "2026-06-14T12:00:00.000Z",
    started_at: "2026-06-14T12:00:00.000Z",
    ended_at: "2026-06-14T12:14:59.999Z",
    signal_window: "15m",
    baseline_window: "24h",
    symbols,
    breadth_count: 5,
    avg_15m_change_pct: 1.2,
    headline_severity: 82,
    max_elevated_severity: 90,
    peak_symbol: "BTCUSDT",
    tier: "severe",
    symbol_evidence: evidence(symbols),
    sub_events: [],
    query_hints: {
      route: "market_wide_up",
      date_bound_query_required: true,
      second_search_allowed: false,
      no_trading_advice: true,
    },
  };
}

function fixture(incidentId: string) {
  return {
    schema_version: "1.0",
    generated_at: "2026-06-16T00:00:00.000Z",
    incident_id: incidentId,
    analysis_mode: "fixture_test",
    catalyst_status: "cause_supported",
    ui_label: "Focused Cause",
    headline: "Same-day context for broad crypto movement",
    brief_summary:
      "Same-day public reports connected the broad crypto movement to ETF flow context.",
    confidence: "high",
    price_context_check: "matches_binance",
    main_catalyst: { type: "etf_flow_context" },
    broader_context: [{ note: "Same-day public context." }],
    caveats: [
      "This is same-day public context, not proof of exact 15-minute causation.",
    ],
    tags: ["same_day_context"],
    source_links: [
      {
        publisher: "CoinDesk",
        title: "Crypto market context",
        url: "https://www.coindesk.com/markets/2026/06/14/context",
        published_at: "2026-06-14",
        accessed_at: "2026-06-16T00:00:00.000Z",
        used_for: "focused_catalyst",
        source_strength: "strong",
      },
      {
        publisher: "Rejected SEO",
        title: "Crypto forecast page",
        url: "https://example.com/forecast",
        used_for: "backdrop",
        source_strength: "weak",
      },
      {
        publisher: "Reuters",
        title: "Reuters homepage",
        url: "https://www.reuters.com/",
        used_for: "backdrop",
        source_strength: "acceptable",
      },
    ],
    disclaimer: "Informational market context only.",
  };
}

test("stored brief appears in feed with accepted source URL and no rejected sources", async () => {
  const { db, tables } = createMemoryD1();
  const incident = candidate();

  await upsertIncidents(db, [incident]);
  const brief = await persistClaudeFixtureBriefForTest(
    db,
    fixture(incident.id),
    {
      eventDate: incident.started_at,
    },
  );
  const feed = await getRecentIncidentsForFeed(
    db,
    30,
    new Date("2026-06-16T00:00:00.000Z"),
  );

  assert.equal(tables.claude_briefs.length, 1);
  assert.equal(tables.source_references.length, 1);
  assert.equal(brief.rejected_sources.length, 2);
  assert.equal(feed[0].brief.status, "brief_ready");
  assert.equal(feed[0].brief.label, "Focused Cause");
  assert.equal(feed[0].sources.length, 1);
  assert.equal(feed[0].sources[0].publisher, "CoinDesk");
  assert.equal(
    feed[0].sources[0].url,
    "https://www.coindesk.com/markets/2026/06/14/context",
  );
  assert.equal(JSON.stringify(feed).includes("Rejected SEO"), false);
  assert.equal(
    JSON.stringify(feed).includes("https://www.reuters.com/"),
    false,
  );
});

test("brief and source upserts are idempotent", async () => {
  const { db, tables } = createMemoryD1();
  const incident = candidate();

  await upsertIncidents(db, [incident]);
  const first = await persistClaudeFixtureBriefForTest(
    db,
    fixture(incident.id),
    {
      eventDate: incident.started_at,
    },
  );
  const second = await persistClaudeFixtureBriefForTest(
    db,
    fixture(incident.id),
    {
      eventDate: incident.started_at,
    },
  );

  assert.equal(first.id, second.id);
  assert.equal(tables.claude_briefs.length, 1);
  assert.equal(tables.source_references.length, 1);
  assert.equal((await getAcceptedSourcesForBrief(db, first.id)).length, 1);
});

test("legacy cause brief with only backdrop sources maps to Market Backdrop", async () => {
  const { db, tables } = createMemoryD1();
  const incident = candidate("bs_20260614_market_wide_up_legacy_backdrop");

  await upsertIncidents(db, [incident]);
  tables.claude_briefs.push({
    id: `${incident.id}_fixture_test`,
    incident_id: incident.id,
    analysis_mode: "fixture_test",
    catalyst_status: "cause_supported",
    ui_label: "Focused Cause",
    confidence: "medium",
    price_context_check: "matches_binance",
    headline: "Same-day market backdrop",
    summary:
      "Same-day public reporting described broad crypto market context near the detected movement.",
    focused_catalyst_json: JSON.stringify({ type: "macro_context" }),
    main_catalyst_json: JSON.stringify({ type: "macro_context" }),
    broader_context_json: "[]",
    caveats_json: "[]",
    tags_json: JSON.stringify(["same_day_context"]),
    source_quality_meta_json: "{}",
    generated_at: "2026-06-16T00:00:00.000Z",
    created_at: "2026-06-16T00:00:00.000Z",
    updated_at: "2026-06-16T00:00:00.000Z",
  });
  tables.source_references.push({
    id: 1,
    brief_id: `${incident.id}_fixture_test`,
    publisher: "CoinDesk",
    title: "Crypto market backdrop",
    url: "https://www.coindesk.com/markets/2026/06/14/backdrop",
    normalized_url: "www.coindesk.com/markets/2026/06/14/backdrop",
    published_at: "2026-06-14",
    accessed_at: "2026-06-16T00:00:00.000Z",
    used_for: "backdrop",
    source_strength: "acceptable",
    created_at: "2026-06-16T00:00:00.000Z",
  });

  const feed = await getRecentIncidentsForFeed(
    db,
    30,
    new Date("2026-06-16T00:00:00.000Z"),
  );

  assert.equal(feed[0].brief.status, "context_only");
  assert.equal(feed[0].brief.catalyst_status, "context_only");
  assert.equal(feed[0].brief.label, "Market Backdrop");
});

test("queued incident and analysis-limited incident map to approved fallback copy", async () => {
  const { db } = createMemoryD1();
  const queued = candidate("bs_20260614_market_wide_up_queued");
  const limited = candidate("bs_20260615_market_wide_up_limited");

  await upsertIncidents(db, [queued, limited]);
  await markIncidentAnalysisLimited(db, limited.id);

  const feed = await getRecentIncidentsForFeed(
    db,
    30,
    new Date("2026-06-16T00:00:00.000Z"),
  );
  const limitedItem = feed.find((item) => item.incident_id === limited.id);
  const queuedItem = feed.find((item) => item.incident_id === queued.id);

  assert.equal(queuedItem?.brief.status, "queued_for_analysis");
  assert.equal(queuedItem?.sources.length, 0);
  assert.equal(limitedItem?.brief.status, "analysis_limited");
  assert.equal(limitedItem?.brief.summary, CLAUDE_LIMITED_SUMMARY);
  assert.equal(limitedItem?.sources.length, 0);
});

test("public feed labels and summaries avoid trading-advice wording", async () => {
  const { db } = createMemoryD1();
  const incident = candidate();

  await upsertIncidents(db, [incident]);
  await persistClaudeFixtureBriefForTest(db, fixture(incident.id), {
    eventDate: incident.started_at,
  });

  const feed = await getRecentIncidentsForFeed(
    db,
    30,
    new Date("2026-06-16T00:00:00.000Z"),
  );
  const publicText = feed
    .flatMap((item) => [
      item.brief.label,
      item.brief.summary,
      item.evidence.summary,
      item.evidence.evidence_summary,
    ])
    .join(" ")
    .toLowerCase();

  for (const term of forbiddenPublicTerms) {
    assert.equal(publicText.includes(term), false, term);
  }
});
