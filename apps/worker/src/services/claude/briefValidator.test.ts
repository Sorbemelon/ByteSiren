import assert from "node:assert/strict";
import test from "node:test";

import {
  ClaudeBriefValidationError,
  validateClaudeBrief,
} from "./briefValidator.ts";

function source(overrides: Record<string, unknown> = {}) {
  return {
    publisher: "CoinDesk",
    title: "Crypto market context",
    url: "https://www.coindesk.com/markets/2026/06/14/context",
    published_at: "2026-06-14",
    accessed_at: "2026-06-16T00:00:00.000Z",
    used_for: "focused_catalyst",
    source_strength: "strong",
    ...overrides,
  };
}

function brief(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: "1.0",
    generated_at: "2026-06-16T00:00:00.000Z",
    incident_id: "bs_20260614_market_wide_up_1200",
    analysis_mode: "fixture_test",
    catalyst_status: "cause_supported",
    ui_label: "Focused Cause",
    headline: "Same-day context for broad crypto movement",
    brief_summary:
      "Same-day public reports connected the broad crypto movement to ETF flow context.",
    confidence: "high",
    price_context_check: "matches_binance",
    main_catalyst: { type: "etf_flow_context" },
    broader_context: [],
    caveats: [],
    tags: ["same_day_context"],
    source_links: [source()],
    disclaimer: "Informational market context only.",
    ...overrides,
  };
}

test("valid cause_supported with accepted source passes", () => {
  const validated = validateClaudeBrief(brief());

  assert.equal(validated.catalyst_status, "cause_supported");
  assert.equal(validated.ui_label, "Focused Cause");
  assert.equal(validated.accepted_sources.length, 1);
});

test("cause_supported without accepted sources fails", () => {
  assert.throws(
    () => validateClaudeBrief(brief({ source_links: [] })),
    ClaudeBriefValidationError,
  );
});

test("cause_supported with only root publisher source fails", () => {
  assert.throws(
    () =>
      validateClaudeBrief(
        brief({
          source_links: [
            source({
              title: "CoinDesk homepage",
              url: "https://www.coindesk.com/",
            }),
          ],
        }),
      ),
    ClaudeBriefValidationError,
  );
});

test("cause_likely maps to Likely Cause", () => {
  const validated = validateClaudeBrief(
    brief({
      catalyst_status: "cause_likely",
      ui_label: "Likely Cause",
      source_links: [source({ used_for: "likely_cause" })],
    }),
  );

  assert.equal(validated.ui_label, "Likely Cause");
});

test("context_only maps to Market Backdrop", () => {
  const validated = validateClaudeBrief(
    brief({
      catalyst_status: "context_only",
      ui_label: "Market Backdrop",
      main_catalyst: null,
      source_links: [source({ used_for: "backdrop" })],
    }),
  );

  assert.equal(validated.catalyst_status, "context_only");
  assert.equal(validated.ui_label, "Market Backdrop");
});

test("none_found maps to No Clear Cause and allows no sources", () => {
  const validated = validateClaudeBrief(
    brief({
      catalyst_status: "none_found",
      ui_label: "No Clear Cause",
      main_catalyst: null,
      brief_summary:
        "No clear public cause found from trusted sources for this detection.",
      confidence: "unexplained",
      price_context_check: "unknown",
      source_links: [],
    }),
  );

  assert.equal(validated.catalyst_status, "none_found");
  assert.equal(validated.ui_label, "No Clear Cause");
  assert.equal(validated.accepted_sources.length, 0);
});

test("price context conflict downgrades focused cause without strong support", () => {
  const validated = validateClaudeBrief(
    brief({
      price_context_check: "conflict",
      source_links: [source({ source_strength: "acceptable" })],
    }),
  );

  assert.equal(validated.catalyst_status, "context_only");
  assert.equal(validated.ui_label, "Market Backdrop");
  assert.equal(validated.focused_catalyst, null);
});
