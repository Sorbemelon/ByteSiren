import assert from "node:assert/strict";
import test from "node:test";

import { dispatchMarketIngestWorkflow } from "./githubDispatch.ts";
import type { Env } from "../types/env.ts";

function baseEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    ENABLE_GITHUB_INGEST_DISPATCH: "true",
    GITHUB_INGEST_OWNER: "Sorbemelon",
    GITHUB_INGEST_REPO: "ByteSiren",
    GITHUB_INGEST_WORKFLOW: "market-ingest.yml",
    GITHUB_INGEST_REF: "main",
    GITHUB_INGEST_HOURS: "6",
    GITHUB_INGEST_SYMBOLS: "BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT,XRPUSDT",
    GITHUB_INGEST_DRY_RUN: "false",
    GITHUB_INGEST_DISPATCH_TOKEN: "test-github-token",
    ...overrides,
  };
}

test("GitHub dispatch builds workflow_dispatch request without days input", async () => {
  let requestedUrl = "";
  let requestedInit: RequestInit | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedInit = init;

    return new Response(null, { status: 204 });
  };

  const result = await dispatchMarketIngestWorkflow(baseEnv(), { fetcher });
  const headers = new Headers(requestedInit?.headers);
  const body = JSON.parse(String(requestedInit?.body)) as {
    ref: string;
    inputs: Record<string, string>;
  };

  assert.equal(result.ok, true);
  assert.equal(result.outcome, "success");
  assert.equal(result.status, 204);
  assert.equal(
    requestedUrl,
    "https://api.github.com/repos/Sorbemelon/ByteSiren/actions/workflows/market-ingest.yml/dispatches",
  );
  assert.equal(requestedInit?.method, "POST");
  assert.equal(headers.get("authorization"), "Bearer test-github-token");
  assert.equal(headers.get("accept"), "application/vnd.github+json");
  assert.equal(headers.get("x-github-api-version"), "2026-03-10");
  assert.equal(headers.get("user-agent"), "ByteSiren-Worker");
  assert.deepEqual(body, {
    ref: "main",
    inputs: {
      hours: "6",
      symbols: "BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT,XRPUSDT",
      dry_run: "false",
    },
  });
  assert.equal(Object.hasOwn(body.inputs, "days"), false);
  assert.deepEqual(result.inputs_summary.symbols, [
    "BTCUSDT",
    "ETHUSDT",
    "BNBUSDT",
    "SOLUSDT",
    "XRPUSDT",
  ]);
});

test("GitHub dispatch is skipped when disabled", async () => {
  let called = false;
  const fetcher: typeof fetch = async () => {
    called = true;
    return new Response(null, { status: 204 });
  };

  const result = await dispatchMarketIngestWorkflow(
    baseEnv({ ENABLE_GITHUB_INGEST_DISPATCH: "false" }),
    { fetcher },
  );

  assert.equal(called, false);
  assert.equal(result.ok, false);
  assert.equal(result.outcome, "skipped");
  assert.match(result.message, /ENABLE_GITHUB_INGEST_DISPATCH/);
});

test("GitHub dispatch treats 200, 201, 202, and 204 as success", async () => {
  for (const status of [200, 201, 202, 204]) {
    const result = await dispatchMarketIngestWorkflow(baseEnv(), {
      fetcher: async () => new Response(null, { status }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.outcome, "success");
    assert.equal(result.status, status);
  }
});

test("GitHub dispatch fails safely for GitHub HTTP errors", async () => {
  for (const status of [401, 404, 422]) {
    const result = await dispatchMarketIngestWorkflow(baseEnv(), {
      fetcher: async () =>
        new Response(JSON.stringify({ token: "test-github-token" }), {
          status,
        }),
    });
    const serialized = JSON.stringify(result);

    assert.equal(result.ok, false);
    assert.equal(result.outcome, "failed");
    assert.equal(result.status, status);
    assert.equal(
      result.message,
      `GitHub ingest dispatch failed: HTTP ${status}.`,
    );
    assert.equal(serialized.includes("test-github-token"), false);
  }
});

test("GitHub dispatch rejects invalid symbol config before calling GitHub", async () => {
  let called = false;
  const result = await dispatchMarketIngestWorkflow(
    baseEnv({ GITHUB_INGEST_SYMBOLS: "BTCUSDT,DOGEUSDT" }),
    {
      fetcher: async () => {
        called = true;
        return new Response(null, { status: 204 });
      },
    },
  );

  assert.equal(called, false);
  assert.equal(result.ok, false);
  assert.match(result.message, /invalid GITHUB_INGEST_SYMBOLS/);
});
