import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryD1 } from "../test/d1Memory.ts";
import { pollMarket } from "./pollMarket.ts";

test("pollMarket failure message includes safe per-symbol details", async () => {
  const { db, tables } = createMemoryD1();
  const fetcher: typeof fetch = async () =>
    new Response("Service unavailable from region", {
      status: 451,
      headers: {
        "content-type": "text/plain",
      },
    });

  const result = await pollMarket(db, { fetcher });
  const jobRun = tables.job_runs[0];
  const metadata = JSON.parse(jobRun.metadata_json) as {
    symbols: Array<{
      symbol: string;
      error_code?: string;
      error_stage?: string;
      http_status?: number;
      response_summary?: string;
    }>;
  };

  assert.equal(result.status, "failed");
  assert.match(result.message, /Market poll completed: 0\/5 symbols updated/);
  assert.match(result.message, /BTCUSDT fetch_http_451/);
  assert.match(result.message, /XRPUSDT fetch_http_451/);
  assert.equal(jobRun.message, result.message);
  assert.equal(metadata.symbols[0].error_code, "fetch_http_451");
  assert.equal(metadata.symbols[0].error_stage, "fetch");
  assert.equal(metadata.symbols[0].http_status, 451);
  assert.equal(
    metadata.symbols[0].response_summary,
    "Service unavailable from region",
  );
});
