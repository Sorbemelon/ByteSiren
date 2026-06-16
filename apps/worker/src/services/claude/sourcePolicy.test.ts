import assert from "node:assert/strict";
import test from "node:test";

import { filterSourceLinks } from "./sourcePolicy.ts";

test("source policy accepts reputable source with usable URL", () => {
  const result = filterSourceLinks([
    {
      publisher: "CoinDesk",
      title: "Crypto market update",
      url: "https://www.coindesk.com/markets/2026/06/14/context",
      published_at: "2026-06-14",
      accessed_at: "2026-06-16T00:00:00.000Z",
      used_for: "focused_catalyst",
      source_strength: "strong",
    },
  ]);

  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0].publisher, "CoinDesk");
  assert.equal(result.accepted[0].url.includes("coindesk.com"), true);
});

test("source policy rejects prediction, forecast, target, blocked domain, and missing URL", () => {
  const result = filterSourceLinks([
    {
      publisher: "Low Quality",
      title: "BTC price prediction today",
      url: "https://example.com/btc-price-prediction-today",
    },
    {
      publisher: "Forecast Site",
      title: "Crypto forecast after market move",
      url: "https://example.com/forecast",
    },
    {
      publisher: "Target Site",
      title: "BTC price target after rally",
      url: "https://example.com/target",
    },
    {
      publisher: "TradingKey",
      title: "Crypto market story",
      url: "https://tradingkey.com/news/crypto",
    },
    {
      publisher: "Missing URL",
      title: "No URL here",
    },
  ]);

  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.length, 5);
});

test("public source list excludes rejected sources and preserves accepted source fields", () => {
  const result = filterSourceLinks([
    {
      publisher: "Reuters",
      title: "Market context",
      url: "https://www.reuters.com/markets/2026/06/14/context",
      published_at: "2026-06-14",
      accessed_at: "2026-06-16T00:00:00.000Z",
      used_for: "backdrop",
      source_strength: "acceptable",
    },
    {
      publisher: "SEO Site",
      title: "Why-is-crypto moving",
      url: "https://example.com/why-is-crypto-moving",
    },
  ]);

  assert.deepEqual(
    result.accepted.map((source) => source.publisher),
    ["Reuters"],
  );
  assert.equal(result.accepted[0].used_for, "backdrop");
  assert.equal(result.accepted[0].url.includes("reuters.com"), true);
});
