import assert from "node:assert/strict";
import test from "node:test";

import { ALLOWED_SYMBOLS, type MarketSymbol } from "../../config.ts";
import type { IncidentCandidate, SymbolEvidence } from "../detector/index.ts";
import { buildClaudePrompt } from "./promptBuilder.ts";

function evidence(symbols: MarketSymbol[]): SymbolEvidence[] {
  return ALLOWED_SYMBOLS.map((symbol) => ({
    symbol,
    included_in_event: symbols.includes(symbol),
    direction: symbols.includes(symbol) ? "up" : "flat",
    signal_window: "15m",
    baseline_window: "24h",
    change_15m_pct: symbols.includes(symbol) ? 1.2 : 0,
    price_z: symbols.includes(symbol) ? 4.2 : 0,
    volume_ratio: symbols.includes(symbol) ? 3 : 1,
    volatility_ratio: symbols.includes(symbol) ? 3 : 1,
    severity_score: symbols.includes(symbol) ? 82 : 0,
  }));
}

function candidate(
  route: "market_wide_up" | "market_wide_down" | "two_sided_market_day",
): IncidentCandidate {
  const direction =
    route === "market_wide_down"
      ? "observed_down"
      : route === "two_sided_market_day"
        ? "two_sided"
        : "observed_up";
  const scope = route === "two_sided_market_day" ? "market_day" : "market_wide";
  const symbols = [...ALLOWED_SYMBOLS];

  return {
    id: `bs_20260614_${route}`,
    incident_key: `bs_20260614_${route}`,
    scope,
    direction,
    detected_at: "2026-06-14T21:15:00.000Z",
    started_at: "2026-06-14T21:15:00.000Z",
    ended_at: "2026-06-14T21:29:59.999Z",
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
      route,
      date_bound_query_required: true,
      second_search_allowed: route === "two_sided_market_day",
      no_trading_advice: true,
    },
  };
}

test("prompt includes date, windows, all symbols, and safety instructions", () => {
  const prompt = buildClaudePrompt({
    candidate: candidate("market_wide_up"),
  });

  assert.match(prompt.user_prompt, /2026-06-14T21:15:00\.000Z/);
  assert.match(prompt.user_prompt, /signal_window is 15m/);
  assert.match(prompt.user_prompt, /baseline_window is 24h/);
  assert.match(prompt.user_prompt, /cause_supported/);
  assert.match(prompt.user_prompt, /context_only/);
  assert.match(prompt.user_prompt, /Do not provide trading advice/);
  assert.match(prompt.user_prompt, /direct event-specific public context/i);
  assert.match(prompt.user_prompt, /Do not keep searching to force a cause/i);
  assert.match(
    prompt.user_prompt,
    /backdrop-only sources are not enough for Focused Cause or Likely Cause/i,
  );

  for (const symbol of ALLOWED_SYMBOLS) {
    assert.match(prompt.user_prompt, new RegExp(symbol));
  }

  assert.equal(
    (
      prompt.incident_json as {
        query_hints: { date_bound_query_required: true };
      }
    ).query_hints.date_bound_query_required,
    true,
  );
});

test("route queries differ for market-wide up, market-wide down, and two-sided day", () => {
  const up = buildClaudePrompt({ candidate: candidate("market_wide_up") });
  const down = buildClaudePrompt({ candidate: candidate("market_wide_down") });
  const day = buildClaudePrompt({
    candidate: candidate("two_sided_market_day"),
  });

  assert.notDeepEqual(up.route_queries, down.route_queries);
  assert.notDeepEqual(up.route_queries, day.route_queries);
  assert.match(up.route_queries.join(" "), /rally/);
  assert.match(down.route_queries.join(" "), /decline/);
  assert.match(day.route_queries.join(" "), /volatility/);
});

test("prompt builder keeps web search policy configurable for live phase", () => {
  const prompt = buildClaudePrompt(
    { candidate: candidate("market_wide_up") },
    {
      CLAUDE_MODEL: "claude-placeholder",
      CLAUDE_WEB_SEARCH_TOOL_TYPE: "web_search_placeholder",
      CLAUDE_DEFAULT_MAX_USES: "1",
      CLAUDE_SECOND_SEARCH_MAX_USES: "2",
      CLAUDE_ALLOWED_DOMAINS: "coindesk.com,reuters.com",
      CLAUDE_BLOCKED_DOMAINS: "example.test",
    },
  );

  assert.equal(prompt.web_search_policy.model, "claude-placeholder");
  assert.equal(prompt.web_search_policy.tool_type, "web_search_placeholder");
  assert.deepEqual(prompt.web_search_policy.allowed_domains, [
    "coindesk.com",
    "reuters.com",
  ]);
  assert.deepEqual(prompt.web_search_policy.blocked_domains, ["example.test"]);
});

test("prompt builder defaults to bounded two and three search uses", () => {
  const prompt = buildClaudePrompt({ candidate: candidate("market_wide_up") });

  assert.equal(prompt.web_search_policy.default_max_uses, 2);
  assert.equal(prompt.web_search_policy.second_search_max_uses, 3);
});
