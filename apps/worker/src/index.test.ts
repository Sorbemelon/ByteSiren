import assert from "node:assert/strict";
import test from "node:test";

import worker from "./index.ts";
import type { Env } from "./types/env.ts";

const symbols = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
] as const;
const now = new Date("2026-06-16T12:00:00.000Z");

function seededRows() {
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

function makeD1Stub(): D1Database {
  const rows = seededRows();

  return {
    prepare(sql: string) {
      const params: unknown[] = [];

      return {
        bind(...values: unknown[]) {
          params.push(...values);
          return this;
        },
        async all() {
          if (sql.includes("ORDER BY open_time DESC")) {
            const [symbol, , limit] = params as [string, string, number];

            return {
              results: rows
                .filter((row) => row.symbol === symbol)
                .sort((a, b) => b.open_time.localeCompare(a.open_time))
                .slice(0, limit),
            };
          }

          if (sql.includes("open_time >= ?")) {
            const [symbol, , cutoff] = params as [string, string, string];

            return {
              results: rows
                .filter(
                  (row) => row.symbol === symbol && row.open_time >= cutoff,
                )
                .sort((a, b) => a.open_time.localeCompare(b.open_time)),
            };
          }

          return {
            results: [],
          };
        },
        async first() {
          return {
            latest_close_time: rows.at(-1)?.close_time ?? null,
          };
        },
        async run() {
          return {
            meta: {
              changes: 0,
            },
          };
        },
      };
    },
    async batch() {
      return [];
    },
  } as unknown as D1Database;
}

function makeEnv(): Env {
  return {
    DB: makeD1Stub(),
    APP_VERSION: "0.1.0-placeholder",
    BUILD_PHASE: "phase-2a-market-ingestion",
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
  assert.equal((await readJson(version)).phase, "phase-2a-market-ingestion");
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
