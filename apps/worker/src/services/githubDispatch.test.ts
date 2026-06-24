import assert from "node:assert/strict";
import test from "node:test";

import {
  dispatchMarketIngestWorkflow,
  dispatchV02SignalClaudeWorkflow,
  dispatchV02SnapshotRefreshWorkflow,
} from "./githubDispatch.ts";
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

function baseV02RefreshEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    ENABLE_V02_REFRESH_WORKFLOW_DISPATCH: "true",
    GITHUB_REFRESH_WORKFLOW_REPO: "Sorbemelon/ByteSiren",
    GITHUB_REFRESH_WORKFLOW_FILE: "v02-snapshot-refresh.yml",
    GITHUB_REFRESH_WORKFLOW_REF: "main",
    GITHUB_INGEST_DISPATCH_TOKEN: "test-github-token",
    ...overrides,
  };
}

function baseSignalClaudeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    ENABLE_V02_SIGNAL_CLAUDE_WORKFLOW_DISPATCH: "true",
    GITHUB_REFRESH_WORKFLOW_REPO: "Sorbemelon/ByteSiren",
    V02_CLAUDE_WORKFLOW_FILE: "v02-claude-enrichment.yml",
    V02_CLAUDE_WORKFLOW_REF: "main",
    V02_SIGNAL_CLAUDE_WORKFLOW_FILE: "v02-claude-enrichment.yml",
    V02_SIGNAL_CLAUDE_WORKFLOW_REF: "main",
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

test("v0.2 refresh workflow dispatch is disabled by default", async () => {
  let called = false;
  const result = await dispatchV02SnapshotRefreshWorkflow(
    { DB: {} as D1Database },
    {
      fetcher: async () => {
        called = true;
        return new Response(null, { status: 204 });
      },
    },
  );

  assert.equal(called, false);
  assert.equal(result.ok, false);
  assert.equal(result.outcome, "skipped");
  assert.equal(result.dispatch_status, "skipped_disabled");
  assert.match(result.message, /ENABLE_V02_REFRESH_WORKFLOW_DISPATCH/);
});

test("v0.2 refresh workflow dry-run previews payload without GitHub call", async () => {
  let called = false;
  const result = await dispatchV02SnapshotRefreshWorkflow(
    baseV02RefreshEnv({ GITHUB_INGEST_DISPATCH_TOKEN: "" }),
    {
      dryRun: true,
      triggerSource: "admin_test",
      refreshMode: "admin_dry_run",
      now: new Date("2026-06-24T01:30:00.000Z"),
      fetcher: async () => {
        called = true;
        return new Response(null, { status: 204 });
      },
    },
  );

  assert.equal(called, false);
  assert.equal(result.ok, true);
  assert.equal(result.dispatch_status, "dry_run");
  assert.equal(result.dispatch_attempted, false);
  assert.equal(result.token_present, false);
  assert.deepEqual(result.inputs_summary, {
    trigger_source: "admin_test",
    refresh_mode: "admin_dry_run",
    requested_at: "2026-06-24T01:30:00.000Z",
    idempotency_key: "v02-refresh-2026-06-24",
    dry_run: "false",
    confirm_live: "true",
  });
});

test("v0.2 refresh workflow dispatch checks active runs and builds workflow_dispatch payload", async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });

    if (url.includes("/runs?")) {
      return Response.json({ workflow_runs: [] }, { status: 200 });
    }

    return new Response(null, { status: 204 });
  };

  const result = await dispatchV02SnapshotRefreshWorkflow(baseV02RefreshEnv(), {
    triggerSource: "cloudflare_cron",
    refreshMode: "scheduled",
    now: new Date("2026-06-24T01:30:00.000Z"),
    fetcher,
  });
  const dispatchCall = calls[1];
  const headers = new Headers(dispatchCall.init?.headers);
  const body = JSON.parse(String(dispatchCall.init?.body)) as {
    ref: string;
    inputs: Record<string, string>;
  };

  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /v02-snapshot-refresh\.yml\/runs\?/);
  assert.equal(
    dispatchCall.url,
    "https://api.github.com/repos/Sorbemelon/ByteSiren/actions/workflows/v02-snapshot-refresh.yml/dispatches",
  );
  assert.equal(dispatchCall.init?.method, "POST");
  assert.equal(headers.get("authorization"), "Bearer test-github-token");
  assert.equal(result.ok, true);
  assert.equal(result.dispatch_status, "dispatched");
  assert.deepEqual(body, {
    ref: "main",
    inputs: {
      trigger_source: "cloudflare_cron",
      refresh_mode: "scheduled",
      requested_at: "2026-06-24T01:30:00.000Z",
      idempotency_key: "v02-refresh-2026-06-24",
      dry_run: "false",
      confirm_live: "true",
    },
  });
});

test("v0.2 refresh workflow dispatch skips duplicate active run", async () => {
  let postCalled = false;
  const result = await dispatchV02SnapshotRefreshWorkflow(baseV02RefreshEnv(), {
    fetcher: async (input, init) => {
      if (String(input).includes("/dispatches")) {
        postCalled = true;
      }

      assert.equal(init?.method, "GET");
      return Response.json(
        {
          workflow_runs: [
            {
              id: 123,
              status: "in_progress",
              event: "workflow_dispatch",
              html_url:
                "https://github.com/Sorbemelon/ByteSiren/actions/runs/123",
            },
          ],
        },
        { status: 200 },
      );
    },
  });

  assert.equal(postCalled, false);
  assert.equal(result.ok, false);
  assert.equal(result.outcome, "skipped");
  assert.equal(result.dispatch_status, "skipped_existing_run");
  assert.equal(result.active_run?.id, 123);
});

test("v0.2 refresh workflow dispatch failure redacts token", async () => {
  const result = await dispatchV02SnapshotRefreshWorkflow(baseV02RefreshEnv(), {
    force: true,
    fetcher: async () =>
      new Response(JSON.stringify({ token: "test-github-token" }), {
        status: 401,
      }),
  });
  const serialized = JSON.stringify(result);

  assert.equal(result.ok, false);
  assert.equal(result.dispatch_status, "failed_dispatch");
  assert.equal(result.status, 401);
  assert.equal(serialized.includes("test-github-token"), false);
});

test("v0.2 Signal Claude workflow dispatch is disabled by default", async () => {
  let called = false;
  const result = await dispatchV02SignalClaudeWorkflow(
    { DB: {} as D1Database },
    ["signal_a"],
    {
      fetcher: async () => {
        called = true;
        return new Response(null, { status: 204 });
      },
    },
  );

  assert.equal(called, false);
  assert.equal(result.ok, false);
  assert.equal(result.outcome, "skipped");
  assert.equal(result.dispatch_status, "skipped_disabled");
});

test("v0.2 Signal Claude workflow dispatch dry-run builds bounded signal payload", async () => {
  let called = false;
  const result = await dispatchV02SignalClaudeWorkflow(
    baseSignalClaudeEnv({ GITHUB_INGEST_DISPATCH_TOKEN: "" }),
    ["signal_a", "signal_b", "signal_c", "signal_d"],
    {
      dryRun: true,
      triggerSource: "incremental_signal",
      limit: 3,
      now: new Date("2026-06-24T02:00:00.000Z"),
      fetcher: async () => {
        called = true;
        return new Response(null, { status: 204 });
      },
    },
  );

  assert.equal(called, false);
  assert.equal(result.ok, true);
  assert.equal(result.dispatch_status, "dry_run");
  assert.equal(
    result.inputs_summary.signal_event_ids,
    "signal_a,signal_b,signal_c",
  );
  assert.equal(result.inputs_summary.limit, "3");
  assert.equal(result.token_present, false);
});

test("v0.2 Signal Claude workflow dispatch posts only signal_event_v02 IDs", async () => {
  let requestedUrl = "";
  let requestedBody: { ref: string; inputs: Record<string, string> } | null =
    null;
  const result = await dispatchV02SignalClaudeWorkflow(
    baseSignalClaudeEnv(),
    ["signal_v02_a", "signal_v02_b"],
    {
      triggerSource: "incremental_signal",
      now: new Date("2026-06-24T02:00:00.000Z"),
      fetcher: async (input, init) => {
        requestedUrl = String(input);
        requestedBody = JSON.parse(String(init?.body)) as {
          ref: string;
          inputs: Record<string, string>;
        };

        return new Response(null, { status: 204 });
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.dispatch_status, "dispatched");
  assert.equal(
    requestedUrl,
    "https://api.github.com/repos/Sorbemelon/ByteSiren/actions/workflows/v02-claude-enrichment.yml/dispatches",
  );
  assert.deepEqual(requestedBody, {
    ref: "main",
    inputs: {
      trigger_source: "incremental_signal",
      requested_at: "2026-06-24T02:00:00.000Z",
      signal_event_ids: "signal_v02_a,signal_v02_b",
      limit: "3",
      dry_run: "false",
      confirm_live: "true",
    },
  });
});

test("v0.2 Signal Claude workflow dispatch prefers Phase G config aliases", async () => {
  let requestedUrl = "";
  const requestedBodies: Array<{
    ref: string;
    inputs: Record<string, string>;
  }> = [];
  const result = await dispatchV02SignalClaudeWorkflow(
    baseSignalClaudeEnv({
      V02_CLAUDE_WORKFLOW_FILE: "v02-claude-enrichment.yml",
      V02_CLAUDE_WORKFLOW_REF: "feature-ref",
      V02_SIGNAL_CLAUDE_WORKFLOW_FILE: "legacy.yml",
      V02_SIGNAL_CLAUDE_WORKFLOW_REF: "legacy-ref",
    }),
    ["signal_v02_a"],
    {
      now: new Date("2026-06-24T02:00:00.000Z"),
      fetcher: async (input, init) => {
        requestedUrl = String(input);
        requestedBodies.push(
          JSON.parse(String(init?.body)) as {
            ref: string;
            inputs: Record<string, string>;
          },
        );

        return new Response(null, { status: 204 });
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(
    requestedUrl,
    "https://api.github.com/repos/Sorbemelon/ByteSiren/actions/workflows/v02-claude-enrichment.yml/dispatches",
  );
  assert.equal(requestedBodies[0]?.ref, "feature-ref");
});

test("v0.2 Signal Claude workflow dispatch failure redacts token", async () => {
  const result = await dispatchV02SignalClaudeWorkflow(
    baseSignalClaudeEnv(),
    ["signal_a"],
    {
      fetcher: async () =>
        new Response(JSON.stringify({ token: "test-github-token" }), {
          status: 404,
        }),
    },
  );
  const serialized = JSON.stringify(result);

  assert.equal(result.ok, false);
  assert.equal(result.dispatch_status, "failed_dispatch");
  assert.equal(result.status, 404);
  assert.equal(serialized.includes("test-github-token"), false);
});
