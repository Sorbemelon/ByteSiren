import assert from "node:assert/strict";
import test from "node:test";

import { ALLOWED_SYMBOLS, type MarketSymbol } from "../config.ts";
import {
  getClaudeUsageForToday,
  markIncidentAnalysisLimited,
} from "../db/claudeRepository.ts";
import {
  getRecentIncidentsForFeed,
  upsertIncidents,
} from "../db/incidentRepository.ts";
import {
  CLAUDE_LIMITED_SUMMARY,
  type ClaudeClientRequest,
  type ClaudeClientResult,
} from "../services/claude/index.ts";
import type {
  IncidentCandidate,
  SymbolEvidence,
} from "../services/detector/index.ts";
import { createMemoryD1 } from "../test/d1Memory.ts";
import type { Env } from "../types/env.ts";
import {
  enrichQueuedIncidents,
  type ClaudeEnrichmentClient,
} from "./enrichQueuedIncidents.ts";

const now = new Date("2026-06-16T12:00:00.000Z");

class MockClaudeClient implements ClaudeEnrichmentClient {
  readonly requests: ClaudeClientRequest[] = [];
  private readonly results: ClaudeClientResult[];

  constructor(results: ClaudeClientResult[]) {
    this.results = results;
  }

  async createIncidentBrief(
    request: ClaudeClientRequest,
  ): Promise<ClaudeClientResult> {
    this.requests.push(request);
    const result = this.results.shift();

    if (!result) {
      throw new Error("No mocked Claude result available.");
    }

    return result;
  }
}

function env(overrides: Partial<Env> = {}): Env {
  return {
    DB: createMemoryD1().db,
    ANTHROPIC_API_KEY: "test-key",
    CLAUDE_MODEL: "claude-test-model",
    CLAUDE_WEB_SEARCH_TOOL_TYPE: "web_search_20250305",
    CLAUDE_DEFAULT_MAX_USES: "1",
    CLAUDE_SECOND_SEARCH_MAX_USES: "2",
    CLAUDE_PUBLIC_DAILY_ANALYSIS_LIMIT: "5",
    CLAUDE_ALLOWED_DOMAINS: "reuters.com,coindesk.com",
    CLAUDE_BLOCKED_DOMAINS: "forecast.example",
    ...overrides,
  };
}

function evidence(symbols: MarketSymbol[] = [...ALLOWED_SYMBOLS]) {
  return ALLOWED_SYMBOLS.map(
    (symbol, index): SymbolEvidence => ({
      symbol,
      included_in_event: symbols.includes(symbol),
      direction: symbols.includes(symbol) ? "up" : "flat",
      signal_window: "15m",
      baseline_window: "24h",
      change_15m_pct: symbols.includes(symbol) ? 1 + index / 10 : 0,
      price_z: symbols.includes(symbol) ? 4 : 0,
      volume_ratio: symbols.includes(symbol) ? 3 : 1,
      volatility_ratio: symbols.includes(symbol) ? 3 : 1,
      severity_score: symbols.includes(symbol) ? 82 + index : 0,
    }),
  );
}

function candidate(
  id: string,
  input: {
    scope?: "market_wide" | "market_day";
    direction?: "observed_up" | "observed_down" | "two_sided";
    severity?: number;
  } = {},
): IncidentCandidate {
  const scope = input.scope ?? "market_wide";
  const direction = input.direction ?? "observed_up";

  return {
    id,
    incident_key: id,
    scope,
    direction,
    detected_at: "2026-06-16T11:30:00.000Z",
    started_at: "2026-06-16T11:30:00.000Z",
    ended_at: "2026-06-16T11:44:59.999Z",
    signal_window: "15m",
    baseline_window: "24h",
    symbols: [...ALLOWED_SYMBOLS],
    breadth_count: 5,
    avg_15m_change_pct: 1.2,
    headline_severity: input.severity ?? 82,
    max_elevated_severity: input.severity ?? 90,
    peak_symbol: "BTCUSDT",
    tier: "severe",
    symbol_evidence: evidence(),
    sub_events: [],
    query_hints: {
      route:
        scope === "market_day"
          ? "two_sided_market_day"
          : direction === "observed_down"
            ? "market_wide_down"
            : "market_wide_up",
      date_bound_query_required: true,
      second_search_allowed: scope === "market_day",
      no_trading_advice: true,
    },
  };
}

function briefJson(
  incidentId: string,
  input: {
    catalyst_status:
      | "cause_supported"
      | "cause_likely"
      | "context_only"
      | "none_found";
    sourceUrl?: string;
    sourceTitle?: string;
  },
) {
  const labelByStatus = {
    cause_supported: "Focused Cause",
    cause_likely: "Likely Cause",
    context_only: "Market Backdrop",
    none_found: "No Clear Cause",
  } as const;
  const sourceLinks = input.sourceUrl
    ? [
        {
          publisher: "Reuters",
          title: input.sourceTitle ?? "Same-day crypto market context",
          url: input.sourceUrl,
          published_at: "2026-06-16",
          accessed_at: "2026-06-16T12:00:00.000Z",
          used_for:
            input.catalyst_status === "cause_supported"
              ? "focused_catalyst"
              : input.catalyst_status === "cause_likely"
                ? "likely_cause"
                : "backdrop",
          source_strength:
            input.catalyst_status === "context_only" ? "acceptable" : "strong",
        },
      ]
    : [];

  return {
    schema_version: "1.0",
    generated_at: "2026-06-16T12:00:00.000Z",
    incident_id: incidentId,
    analysis_mode: "live_context",
    catalyst_status: input.catalyst_status,
    ui_label: labelByStatus[input.catalyst_status],
    headline:
      input.catalyst_status === "none_found"
        ? "No clear same-day catalyst found"
        : "Same-day market context",
    brief_summary:
      input.catalyst_status === "none_found"
        ? "No clear public catalyst was found for the detected market movement."
        : "Same-day reporting described public market context near the detected movement.",
    confidence:
      input.catalyst_status === "none_found" ? "unexplained" : "medium",
    price_context_check: "matches_binance",
    main_catalyst:
      input.catalyst_status === "cause_supported" ||
      input.catalyst_status === "cause_likely"
        ? { type: "same_day_context" }
        : null,
    broader_context: [],
    caveats: [
      "Same-day public context is not proof of exact 15-minute causation.",
    ],
    tags: ["same_day_context"],
    source_links: sourceLinks,
  };
}

function okResult(json: unknown, searchesUsed = 1): ClaudeClientResult {
  return {
    ok: true,
    parsed: {
      json,
      text: JSON.stringify(json),
      citations: [],
      metadata: {
        searches_used: searchesUsed,
        claude_model: "claude-test-model",
        tool_type: "web_search_20250305",
        max_uses: searchesUsed,
        error_code: null,
        generated_at: "2026-06-16T12:00:00.000Z",
      },
      retryable: false,
      error_message: null,
    },
  };
}

function errorResult(
  errorCode: "too_many_requests" | "parse_error" | "max_uses_exceeded",
) {
  return {
    ok: false,
    parsed: {
      json: null,
      text: "",
      citations: [],
      metadata: {
        searches_used: 0,
        claude_model: "claude-test-model",
        tool_type: "web_search_20250305",
        max_uses: 1,
        error_code: errorCode,
        generated_at: "2026-06-16T12:00:00.000Z",
      },
      retryable: errorCode === "too_many_requests",
      error_message: "mocked Claude error",
    },
  } satisfies ClaudeClientResult;
}

test("queued incident becomes brief_ready with accepted sources and no rejected sources", async () => {
  const { db, tables } = createMemoryD1();
  const item = candidate("bs_20260616_market_wide_up_1130");
  const mock = new MockClaudeClient([
    okResult(
      {
        ...briefJson(item.id, {
          catalyst_status: "cause_supported",
          sourceUrl: "https://www.reuters.com/markets/2026/06/16/context/",
        }),
        rejected_sources: [
          {
            publisher: "Low Quality",
            title: "Crypto forecast page",
            url: "https://forecast.example/page",
          },
        ],
      },
      1,
    ),
  ]);

  await upsertIncidents(db, [item]);
  const result = await enrichQueuedIncidents(db, env({ DB: db }), {
    client: mock,
    now,
  });
  const feed = await getRecentIncidentsForFeed(db, 30, now);
  const usage = await getClaudeUsageForToday(db, now);

  assert.equal(result.status, "success");
  assert.equal(feed[0].brief.status, "brief_ready");
  assert.equal(feed[0].brief.label, "Focused Cause");
  assert.equal(feed[0].sources.length, 1);
  assert.equal(feed[0].sources[0].publisher, "Reuters");
  assert.equal(JSON.stringify(feed).includes("Low Quality"), false);
  assert.equal(tables.claude_briefs.length, 1);
  assert.equal(tables.source_references.length, 1);
  assert.equal(usage.analysis_count, 1);
  assert.equal(usage.web_search_requests, 1);
  assert.equal(mock.requests.length, 1);
  assert.equal(mock.requests[0].model, "claude-test-model");
  assert.deepEqual(mock.requests[0].allowed_domains, [
    "reuters.com",
    "coindesk.com",
  ]);
});

test("successful repeated cron run is idempotent and does not duplicate briefs", async () => {
  const { db, tables } = createMemoryD1();
  const item = candidate("bs_20260616_market_wide_up_idempotent");
  const mock = new MockClaudeClient([
    okResult(
      briefJson(item.id, {
        catalyst_status: "cause_likely",
        sourceUrl: "https://www.reuters.com/markets/2026/06/16/context/",
      }),
    ),
  ]);

  await upsertIncidents(db, [item]);
  await enrichQueuedIncidents(db, env({ DB: db }), { client: mock, now });
  await enrichQueuedIncidents(db, env({ DB: db }), { client: mock, now });

  assert.equal(tables.claude_briefs.length, 1);
  assert.equal(tables.source_references.length, 1);
  assert.equal(mock.requests.length, 1);
});

test("context_only and none_found map to public feed labels without fake causes", async () => {
  const { db } = createMemoryD1();
  const contextItem = candidate("bs_20260616_market_wide_up_context");
  const noneItem = candidate("bs_20260616_market_wide_up_none");

  await upsertIncidents(db, [contextItem]);
  await enrichQueuedIncidents(db, env({ DB: db }), {
    client: new MockClaudeClient([
      okResult(
        briefJson(contextItem.id, {
          catalyst_status: "context_only",
          sourceUrl: "https://www.reuters.com/markets/2026/06/16/backdrop/",
        }),
      ),
      okResult(
        briefJson(contextItem.id, {
          catalyst_status: "context_only",
          sourceUrl: "https://www.reuters.com/markets/2026/06/16/backdrop/",
        }),
      ),
    ]),
    now,
  });
  await upsertIncidents(db, [noneItem]);
  await enrichQueuedIncidents(db, env({ DB: db }), {
    client: new MockClaudeClient([
      okResult(briefJson(noneItem.id, { catalyst_status: "none_found" })),
      okResult(briefJson(noneItem.id, { catalyst_status: "none_found" })),
    ]),
    now,
  });

  const feed = await getRecentIncidentsForFeed(db, 30, now);
  const contextFeed = feed.find((item) => item.incident_id === contextItem.id);
  const noneFeed = feed.find((item) => item.incident_id === noneItem.id);

  assert.equal(contextFeed?.brief.status, "context_only");
  assert.equal(contextFeed?.brief.label, "Market Backdrop");
  assert.equal(noneFeed?.brief.status, "none_found");
  assert.equal(noneFeed?.brief.label, "No Clear Cause");
  assert.equal(noneFeed?.sources.length, 0);
});

test("missing API key and daily limit reached mark incidents analysis_limited with approved copy", async () => {
  const { db: missingKeyDb } = createMemoryD1();
  const { db: limitDb } = createMemoryD1({
    claude_analysis_usage: [
      {
        usage_date: "2026-06-16",
        analysis_count: 5,
        web_search_requests: 5,
        updated_at: "2026-06-16T00:00:00.000Z",
      },
    ],
  });
  const missingKeyItem = candidate("bs_20260616_market_wide_up_no_key");
  const limitItem = candidate("bs_20260616_market_wide_up_limit");

  await upsertIncidents(missingKeyDb, [missingKeyItem]);
  await upsertIncidents(limitDb, [limitItem]);
  await enrichQueuedIncidents(
    missingKeyDb,
    env({ DB: missingKeyDb, ANTHROPIC_API_KEY: "" }),
    {
      now,
      client: new MockClaudeClient([]),
    },
  );
  await enrichQueuedIncidents(limitDb, env({ DB: limitDb }), {
    now,
    client: new MockClaudeClient([]),
  });

  for (const db of [missingKeyDb, limitDb]) {
    const feed = await getRecentIncidentsForFeed(db, 30, now);
    const serialized = JSON.stringify(feed);

    assert.equal(feed[0].brief.status, "analysis_limited");
    assert.equal(feed[0].brief.label, "Claude Limited");
    assert.equal(feed[0].brief.summary, CLAUDE_LIMITED_SUMMARY);
    assert.equal(serialized.includes("analysis_count"), false);
    assert.equal(serialized.includes("web_search_requests"), false);
  }
});

test("retryable and parse failures do not create fake briefs", async () => {
  const { db, tables } = createMemoryD1();
  const item = candidate("bs_20260616_market_wide_up_retryable");

  await upsertIncidents(db, [item]);
  const result = await enrichQueuedIncidents(db, env({ DB: db }), {
    client: new MockClaudeClient([errorResult("too_many_requests")]),
    now,
  });
  const feed = await getRecentIncidentsForFeed(db, 30, now);

  assert.equal(result.status, "failed");
  assert.equal(tables.claude_briefs.length, 0);
  assert.equal(feed[0].brief.status, "queued_for_analysis");
});

test("max uses exceeded marks incident limited and detector upsert preserves it", async () => {
  const { db } = createMemoryD1();
  const item = candidate("bs_20260616_market_wide_up_max_uses");

  await upsertIncidents(db, [item]);
  const result = await enrichQueuedIncidents(db, env({ DB: db }), {
    client: new MockClaudeClient([errorResult("max_uses_exceeded")]),
    now,
  });
  let feed = await getRecentIncidentsForFeed(db, 30, now);

  assert.equal(result.status, "success");
  assert.equal(result.limited_count, 1);
  assert.equal(result.failed_retryable_count, 0);
  assert.equal(feed[0].brief.status, "analysis_limited");
  assert.equal(feed[0].brief.label, "Claude Limited");
  assert.equal(feed[0].brief.summary, CLAUDE_LIMITED_SUMMARY);

  await upsertIncidents(db, [item]);
  feed = await getRecentIncidentsForFeed(db, 30, now);

  assert.equal(feed[0].brief.status, "analysis_limited");
});

test("second search triggers for none_found and merges into one final brief", async () => {
  const { db, tables } = createMemoryD1();
  const item = candidate("bs_20260616_market_wide_up_second_none");
  const mock = new MockClaudeClient([
    okResult(briefJson(item.id, { catalyst_status: "none_found" })),
    okResult(
      briefJson(item.id, {
        catalyst_status: "cause_likely",
        sourceUrl: "https://www.reuters.com/markets/2026/06/16/context/",
      }),
    ),
  ]);

  await upsertIncidents(db, [item]);
  await enrichQueuedIncidents(db, env({ DB: db }), {
    client: mock,
    now,
  });
  const feed = await getRecentIncidentsForFeed(db, 30, now);

  assert.equal(mock.requests.length, 2);
  assert.equal(mock.requests[0].max_uses, 1);
  assert.equal(mock.requests[1].max_uses, 2);
  assert.equal(tables.claude_briefs.length, 1);
  assert.equal(feed[0].brief.label, "Likely Cause");
});

test("second search triggers for rejected-only first result and two-sided market_day", async () => {
  const { db: rejectedDb } = createMemoryD1();
  const { db: dayDb } = createMemoryD1();
  const rejectedItem = candidate("bs_20260616_market_wide_up_rejected");
  const dayItem = candidate("bs_20260616_market_day_two_sided", {
    scope: "market_day",
    direction: "two_sided",
  });
  const rejectedMock = new MockClaudeClient([
    okResult(
      briefJson(rejectedItem.id, {
        catalyst_status: "context_only",
        sourceUrl: "https://forecast.example/crypto-forecast",
        sourceTitle: "Crypto forecast page",
      }),
    ),
    okResult(
      briefJson(rejectedItem.id, {
        catalyst_status: "context_only",
        sourceUrl: "https://www.reuters.com/markets/2026/06/16/backdrop/",
      }),
    ),
  ]);
  const dayMock = new MockClaudeClient([
    okResult(
      briefJson(dayItem.id, {
        catalyst_status: "cause_supported",
        sourceUrl: "https://www.reuters.com/markets/2026/06/16/context/",
      }),
    ),
    okResult(
      briefJson(dayItem.id, {
        catalyst_status: "cause_supported",
        sourceUrl: "https://www.reuters.com/markets/2026/06/16/context/",
      }),
    ),
  ]);

  await upsertIncidents(rejectedDb, [rejectedItem]);
  await upsertIncidents(dayDb, [dayItem]);
  await enrichQueuedIncidents(rejectedDb, env({ DB: rejectedDb }), {
    client: rejectedMock,
    now,
  });
  await enrichQueuedIncidents(dayDb, env({ DB: dayDb }), {
    client: dayMock,
    now,
  });

  assert.equal(rejectedMock.requests.length, 2);
  assert.equal(dayMock.requests.length, 2);
});

test("analysis_limited incidents are retried when key and capacity are available", async () => {
  const { db } = createMemoryD1();
  const item = candidate("bs_20260616_market_wide_up_retry_limited");
  const mock = new MockClaudeClient([
    okResult(
      briefJson(item.id, {
        catalyst_status: "cause_likely",
        sourceUrl: "https://www.reuters.com/markets/2026/06/16/context/",
      }),
    ),
  ]);

  await upsertIncidents(db, [item]);
  await markIncidentAnalysisLimited(db, item.id);
  await enrichQueuedIncidents(db, env({ DB: db }), {
    client: mock,
    now,
  });
  const feed = await getRecentIncidentsForFeed(db, 30, now);

  assert.equal(feed[0].brief.status, "brief_ready");
  assert.equal(mock.requests.length, 1);
});
