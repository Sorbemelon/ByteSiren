import assert from "node:assert/strict";
import test from "node:test";

import {
  binanceRowsToCandles,
  chunkArray,
  parseArgs,
  runImport,
} from "./import-binance-candles.mjs";

const openTimeMs = Date.parse("2026-06-18T00:00:00.000Z");

function klineRow(offset = 0) {
  const open = openTimeMs + offset * 15 * 60 * 1000;

  return [
    open,
    "65000.00",
    "65100.00",
    "64900.00",
    "65050.00",
    "123.45",
    open + 15 * 60 * 1000 - 1,
    "8020000.00",
    12345,
    "0",
    "0",
    "0",
  ];
}

function makeLogger() {
  const lines = [];

  return {
    lines,
    log(value) {
      lines.push(String(value));
    },
  };
}

test("converts Binance kline rows into import candles", () => {
  const candles = binanceRowsToCandles([klineRow()]);

  assert.deepEqual(candles, [
    {
      open_time: "2026-06-18T00:00:00.000Z",
      close_time: "2026-06-18T00:14:59.999Z",
      open: 65000,
      high: 65100,
      low: 64900,
      close: 65050,
      volume: 123.45,
      quote_volume: 8020000,
      trade_count: 12345,
    },
  ]);
});

test("chunks candles for Worker import requests", () => {
  assert.deepEqual(chunkArray([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test("parses CLI options without leaking defaults into frontend env", () => {
  const options = parseArgs(
    [
      "--worker-url",
      "https://api.example.com",
      "--token",
      "test-token",
      "--symbols",
      "BTCUSDT,ETHUSDT",
      "--days",
      "31",
      "--chunk-size",
      "100",
      "--run-detector-last",
    ],
    {},
  );

  assert.equal(options.workerUrl, "https://api.example.com");
  assert.equal(options.token, "test-token");
  assert.deepEqual(options.symbols, ["BTCUSDT", "ETHUSDT"]);
  assert.equal(options.days, 31);
  assert.equal(options.chunkSize, 100);
  assert.equal(options.runDetectorLast, true);
});

test("dry-run fetches and converts candles without uploading", async () => {
  const requestedUrls = [];
  const logger = makeLogger();
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    requestedUrls.push(url);

    assert.equal(url.hostname, "data-api.binance.vision");

    return new Response(JSON.stringify([klineRow()]), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  };

  const result = await runImport(
    {
      symbols: ["BTCUSDT"],
      hours: 1,
      chunkSize: 500,
      runDetectorLast: true,
      dryRun: true,
    },
    {
      fetchImpl,
      logger,
      now: new Date("2026-06-18T01:00:00.000Z"),
    },
  );

  assert.equal(result.fetched, 1);
  assert.equal(result.uploaded, 0);
  assert.equal(requestedUrls.length, 1);
  assert.equal(
    logger.lines.some((line) => line.includes("dry-run")),
    true,
  );
});

test("upload request uses market token header and does not log it", async () => {
  const uploaded = [];
  const logger = makeLogger();
  const fetchImpl = async (input, init) => {
    const url = new URL(String(input));

    if (url.hostname === "data-api.binance.vision") {
      return new Response(JSON.stringify([klineRow(), klineRow(1)]), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    }

    uploaded.push({
      url,
      token: init?.headers?.["x-bytesiren-market-token"],
      body: JSON.parse(String(init?.body)),
    });

    return new Response(JSON.stringify({ ok: true, received: 2 }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  };

  const result = await runImport(
    {
      workerUrl: "https://api.example.com",
      token: "super-secret-market-token",
      symbols: ["BTCUSDT"],
      hours: 1,
      chunkSize: 500,
      runDetectorLast: true,
      dryRun: false,
    },
    {
      fetchImpl,
      logger,
      now: new Date("2026-06-18T01:00:00.000Z"),
    },
  );

  assert.equal(result.fetched, 2);
  assert.equal(result.uploaded, 2);
  assert.equal(uploaded.length, 1);
  assert.equal(uploaded[0].url.pathname, "/api/ingest/candles");
  assert.equal(uploaded[0].token, "super-secret-market-token");
  assert.equal(uploaded[0].body.run_detector, true);
  assert.equal(
    logger.lines.join("\n").includes("super-secret-market-token"),
    false,
  );
});
