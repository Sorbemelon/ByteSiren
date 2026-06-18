import assert from "node:assert/strict";
import test from "node:test";

import { filterSourceLinks } from "./sourcePolicy.ts";
import { sourceLinksToPublicSources } from "./feedMapping.ts";

test("source policy accepts reputable source with usable URL", () => {
  const articleUrl = "https://www.coindesk.com/markets/2026/06/14/context";
  const result = filterSourceLinks([
    {
      publisher: "CoinDesk",
      title: "Crypto market update",
      url: articleUrl,
      published_at: "2026-06-14",
      accessed_at: "2026-06-16T00:00:00.000Z",
      used_for: "focused_catalyst",
      source_strength: "strong",
    },
  ]);

  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0].publisher, "CoinDesk");
  assert.equal(result.accepted[0].url.includes("coindesk.com"), true);
  assert.equal(result.accepted[0].url, articleUrl);
});

test("source policy derives publisher label from accepted source URL", () => {
  const result = filterSourceLinks([
    {
      title: "Market context",
      url: "https://www.reuters.com/markets/2026/06/14/context/",
      used_for: "backdrop",
      source_strength: "acceptable",
    },
    {
      publisher: "Unknown",
      title: "Crypto market context",
      url: "https://www.coindesk.com/markets/2026/06/14/context/",
      used_for: "focused_catalyst",
      source_strength: "strong",
    },
    {
      title: "Regional market update",
      url: "https://example-news.test/markets/2026/06/14/context/",
      used_for: "backdrop",
      source_strength: "acceptable",
    },
  ]);

  assert.equal(result.accepted.length, 3);
  assert.deepEqual(
    result.accepted.map((source) => source.publisher),
    ["Reuters", "CoinDesk", "example-news.test"],
  );
});

test("source policy rejects generic publisher root URLs", () => {
  const result = filterSourceLinks([
    {
      publisher: "CoinDesk",
      title: "CoinDesk homepage",
      url: "https://www.coindesk.com/",
      used_for: "focused_catalyst",
      source_strength: "strong",
    },
    {
      publisher: "Reuters",
      title: "Reuters homepage",
      url: "https://www.reuters.com/",
      used_for: "backdrop",
      source_strength: "acceptable",
    },
    {
      publisher: "Yahoo Finance",
      title: "Yahoo Finance homepage",
      url: "https://finance.yahoo.com/",
      used_for: "price_check",
      source_strength: "acceptable",
    },
  ]);

  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.length, 3);
  assert.deepEqual(
    result.rejected.map((source) => source.rejection_reason),
    ["generic_homepage_url", "generic_homepage_url", "generic_homepage_url"],
  );
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

test("public feed source mapping excludes legacy root source URLs", () => {
  const articleUrl =
    "https://www.reuters.com/markets/2026/06/15/crypto-context/";
  const publicSources = sourceLinksToPublicSources([
    {
      publisher: "CoinDesk",
      title: "CoinDesk homepage",
      url: "https://www.coindesk.com/",
      published_at: null,
      accessed_at: null,
      used_for: "focused_catalyst",
      source_strength: "strong",
    },
    {
      publisher: "Reuters",
      title: "Crypto context article",
      url: articleUrl,
      published_at: "2026-06-15",
      accessed_at: null,
      used_for: "likely_cause",
      source_strength: "strong",
    },
  ]);

  assert.equal(publicSources.length, 1);
  assert.equal(publicSources[0].publisher, "Reuters");
  assert.equal(publicSources[0].url, articleUrl);
  assert.equal(
    JSON.stringify(publicSources).includes("www.coindesk.com"),
    false,
  );
});

test("public feed source mapping repairs legacy Unknown publisher labels", () => {
  const publicSources = sourceLinksToPublicSources([
    {
      publisher: "Unknown",
      title: "Market context article",
      url: "https://www.reuters.com/markets/2026/06/15/crypto-context/",
      published_at: "2026-06-15",
      accessed_at: null,
      used_for: "backdrop",
      source_strength: "acceptable",
    },
  ]);

  assert.equal(publicSources.length, 1);
  assert.equal(publicSources[0].publisher, "Reuters");
});
