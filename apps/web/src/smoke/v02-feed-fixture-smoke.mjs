#!/usr/bin/env node

import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { access, mkdtemp, rm } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const EDGE_PATH =
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const CHROME_PATH =
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function chooseBrowser() {
  const candidates = [
    process.env.BYTESIREN_BROWSER,
    CHROME_PATH,
    EDGE_PATH,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }

  throw new Error("No Chrome or Edge executable found for browser smoke.");
}

function json(response, payload, status = 200) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  response.end(JSON.stringify(payload));
}

function makeCandles(symbol) {
  const start = Date.parse("2026-06-20T00:00:00.000Z");
  const base =
    symbol === "ETHUSDT"
      ? 2500
      : symbol === "BNBUSDT"
        ? 620
        : symbol === "SOLUSDT"
          ? 150
          : symbol === "XRPUSDT"
            ? 2.1
            : 65000;

  return Array.from({ length: 96 }, (_, index) => {
    const openTime = start + index * 15 * 60 * 1000;
    const open = base * (1 + index * 0.0005);
    const close = open * (1 + Math.sin(index / 8) * 0.0015);
    const high = Math.max(open, close) * 1.002;
    const low = Math.min(open, close) * 0.998;

    return {
      open_time: new Date(openTime).toISOString(),
      close_time: new Date(openTime + 15 * 60 * 1000 - 1).toISOString(),
      open,
      high,
      low,
      close,
      volume: 1000 + index * 7,
      quote_volume: (1000 + index * 7) * close,
    };
  });
}

const fixtureFeed = {
  ok: true,
  version: "v02",
  updated_at: "2026-06-21T12:00:00.000Z",
  range_days: 30,
  grouping: "utc_day",
  days_expanded_default: true,
  global_control_label_when_expanded: "Collapse days",
  global_control_label_when_collapsed: "Expand days",
  day_groups: [
    {
      day_post_id: "day_2026-06-20",
      date_utc: "2026-06-20",
      display_date: "Jun 20, 2026 UTC",
      is_current_utc_day: false,
      item_count: 3,
      hidden_item_count_when_collapsed: 2,
      default_collapsed_item_id: "daily_2026-06-20",
      has_extra_items: true,
      expanded_control_label: "+2 events · Collapse post",
      collapsed_control_label: "+2 events · Expand post",
      items: [
        {
          item_type: "daily_overview",
          id: "daily_2026-06-20",
          date_utc: "2026-06-20",
          display_time: "Full UTC day",
          daily_label: "Daily Context",
          daily_change_label: "24h Change",
          daily_change_pct: 1.42,
          market_tone: "mixed",
          market_range_pct: 3.71,
          notable_symbols: [
            {
              symbol: "BTCUSDT",
              change_pct: 1.9,
              reason: "largest daily change",
            },
            {
              symbol: "SOLUSDT",
              change_pct: 2.4,
              reason: "widest daily range",
            },
            {
              symbol: "XRPUSDT",
              change_pct: -0.8,
              reason: "lagged the broader move",
            },
          ],
          top_symbol_moves: [
            {
              symbol: "SOLUSDT",
              change_pct: 2.4,
              range_pct: 5.6,
              volatility_score: 42,
              peak_change_pct: 3.1,
              volume_ratio: 1.82,
              range_position: "near_high",
              range_position_display: "Near high",
              first_price: 146.2,
              last_price: 149.7,
            },
            {
              symbol: "BTCUSDT",
              change_pct: 1.9,
              range_pct: 3.8,
              volatility_score: 35,
              peak_change_pct: 2.2,
              volume_ratio: 1.44,
              range_position: "inside_range",
              range_position_display: "Inside range",
              first_price: 65000,
              last_price: 66235,
            },
            {
              symbol: "ETHUSDT",
              change_pct: 1.1,
              range_pct: 3.2,
              volatility_score: 29,
              peak_change_pct: 1.6,
              volume_ratio: 1.18,
              range_position: "inside_range",
              range_position_display: "Inside range",
              first_price: 2500,
              last_price: 2527.5,
            },
          ],
          public_context_status: "brief_ready",
          sources: [
            {
              publisher: "CoinDesk",
              title: "Crypto market daily context",
              url: "https://www.coindesk.com/markets/2026/06/20/daily-crypto-market-context/",
              published_at: "2026-06-20T20:00:00.000Z",
              tag: "Main daily context source",
              used_for: "daily_context",
            },
            {
              publisher: "The Block",
              title: "Crypto macro market wrap",
              url: "https://www.theblock.co/post/daily-crypto-market-wrap",
              published_at: "2026-06-20T18:30:00.000Z",
              tag: "Supporting daily source",
              used_for: "supporting_daily",
            },
          ],
          chart: {
            chart_highlight_type: "day_window",
            highlight_start: "2026-06-20T00:00:00.000Z",
            highlight_end: "2026-06-20T23:59:59.999Z",
            included_signal_event_ids: ["sig_fixture"],
            included_market_story_ids: ["story_fixture"],
            hide_other_days_on_select: true,
          },
          brief: {
            id: "brief_daily_fixture",
            status: "brief_ready",
            public_label: "Daily Context",
            confidence: "medium",
            collapsed_summary:
              "A mixed but active UTC day: SOL and BTC led the broad move while XRP lagged into the close.",
            context_details:
              "The day combined broad spot participation, elevated but contained range expansion, and a later reversal story. SOL and BTC carried most of the visible move while XRP lagged the broader tape.",
            source_support: "medium",
            source_timing_alignment: "same_day",
          },
          expanded: {
            positive_symbol_count: 4,
            negative_symbol_count: 1,
            max_abs_symbol_change_pct: 2.4,
            max_symbol_range_pct: 5.6,
            daily_volatility_score_method:
              "rms_15m_bar_open_close_returns_x100",
            daily_volatility_score: 36,
            signal_event_count: 1,
            market_story_count: 1,
            audit_event_count: 2,
            tone_reasons: [
              "positive breadth with one visible laggard",
              "range expansion stayed below the high-volatility threshold",
            ],
          },
        },
        {
          item_type: "market_story",
          id: "story_fixture",
          date_utc: "2026-06-20",
          display_time: "04:00-16:00 UTC",
          story_window_label: "Story window",
          avg_change_label: "Avg Change",
          avg_change_pct: -0.8,
          swing_score_label: "Volatility Score",
          swing_score: 51,
          story_label: "Reversal sequence",
          story_family: "reversal",
          direction: "two_sided",
          chart_context_score: 84,
          per_symbol_evidence: [
            {
              symbol: "BTCUSDT",
              avg_change_label: "Avg Change",
              avg_change_pct: -0.6,
              range_pct: 3.4,
              swing_score_label: "Volatility Score",
              swing_score: 38,
              volume_ratio: 1.18,
              movement_status_label: "Movement Status",
              movement_status: "Net down",
              bar_count: 48,
            },
          ],
          range_context: {
            event_range_context: "mixed_range_position",
            broke_high_count: 3,
            broke_low_count: 1,
            range_break_strength: "moderate",
          },
          trend_context: {
            trend_context: "trend_down",
            trend_alignment: "trend_reversal_attempt",
          },
          momentum_context: {
            momentum_type: "reversal",
            direction_consistency_score: 0.71,
            continuation_after_window: false,
          },
          volatility_context: {
            volatility_context: "ordinary_volatility",
            volatility_expansion_score: 0.58,
          },
          decision_reasons: [
            "opposite movement resolved into reversal",
            "story duration stayed above the minimum story window",
            "included public signal and audit evidence share chart context",
          ],
          publish_reason: "deterministic story criteria passed",
          chart: {
            chart_highlight_type: "story_window",
            highlight_start: "2026-06-20T04:00:00.000Z",
            highlight_end: "2026-06-20T16:00:00.000Z",
            included_signal_event_ids: ["sig_fixture"],
            included_audit_event_ids: ["audit_fixture"],
          },
          public_context_status: "brief_ready",
          sources: [
            {
              publisher: "Story Boundary Publisher",
              title: "Story source boundary check",
              url: "https://example.com/story-source-boundary-check",
              published_at: "2026-06-20",
              tag: "Backdrop source",
            },
          ],
          brief: {
            id: "story_boundary_brief",
            status: "brief_ready",
            public_label: "Focused Cause",
          },
        },
        {
          item_type: "signal_event",
          id: "sig_fixture",
          date_utc: "2026-06-20",
          display_time: "15:15-16:00 UTC",
          display_window: "15:15-16:00 UTC",
          direction: "observed_up",
          signals_count: 4,
          n_tracked: 5,
          avg_change_label: "Avg Change",
          avg_change_pct: 1.65,
          impact_label: "High",
          event_strength_score: 82,
          chart_context_score: 88,
          chart_context_label: "Strong chart context",
          event_story_type: "range_break_up",
          direction_changed: true,
          direction_history: [
            { direction: "observed_down", at: "2026-06-20T15:30:00.000Z" },
            { direction: "observed_up", at: "2026-06-20T16:00:00.000Z" },
          ],
          trend_context: "trend_up",
          momentum_context: "impulse",
          volatility_context: "expansion_after_compression",
          event_range_context: "broad_broke_high",
          public_context_status: "brief_ready",
          sources: [
            {
              publisher: "Reuters",
              title: "Crypto market update",
              url: "https://www.reuters.com/markets/2026/06/20/crypto-market-update/",
              published_at: "2026-06-20T15:40:00.000Z",
              tag: "Likely cause source",
              used_for: "likely_cause",
            },
            {
              publisher: "Cointelegraph",
              title: "Crypto price check",
              url: "https://cointelegraph.com/news/crypto-price-check",
              published_at: "2026-06-20T16:05:00.000Z",
              tag: "Price check source",
              used_for: "price_check",
            },
            {
              publisher: "CoinDesk",
              title: "Crypto market backdrop",
              url: "https://www.coindesk.com/markets/2026/06/20/crypto-market-backdrop/",
              published_at: "2026-06-20T14:30:00.000Z",
              tag: "Backdrop source",
              used_for: "backdrop",
            },
          ],
          evidence_window: {
            start: "2026-06-20T15:15:00.000Z",
            end: "2026-06-20T16:00:00.000Z",
            duration_min: 45,
            peak_time: "2026-06-20T15:30:00.000Z",
          },
          per_symbol_evidence: [
            {
              symbol: "BTCUSDT",
              window_change_label: "Window Change",
              window_change_pct: 2.2,
              range_pct: 4.8,
              peak_15m_label: "Peak 15m",
              peak_15m_change_pct: 1.2,
              volume_ratio: 2.7,
              range_position_label: "Range Position",
              range_position: "broke_high",
              range_position_display: "Broke high",
              is_lead_mover: true,
              is_peak_15m_highlight: true,
              participated: true,
            },
            {
              symbol: "ETHUSDT",
              window_change_label: "Window Change",
              window_change_pct: 1.4,
              range_pct: 3.6,
              peak_15m_label: "Peak 15m",
              peak_15m_change_pct: 0.8,
              volume_ratio: 1.9,
              range_position_label: "Range Position",
              range_position: "inside_range",
              range_position_display: "Inside range",
              participated: true,
            },
            {
              symbol: "BNBUSDT",
              window_change_label: "Window Change",
              window_change_pct: 1.1,
              range_pct: 3.2,
              peak_15m_label: "Peak 15m",
              peak_15m_change_pct: 0.5,
              volume_ratio: 1.6,
              range_position_label: "Range Position",
              range_position: "near_high",
              range_position_display: "Near high",
              participated: true,
            },
            {
              symbol: "SOLUSDT",
              window_change_label: "Window Change",
              window_change_pct: 1.8,
              range_pct: 5.1,
              peak_15m_label: "Peak 15m",
              peak_15m_change_pct: 1.0,
              volume_ratio: 2.2,
              range_position_label: "Range Position",
              range_position: "broke_high",
              range_position_display: "Broke high",
              participated: true,
            },
            {
              symbol: "XRPUSDT",
              window_change_label: "Window Change",
              window_change_pct: 0.3,
              range_pct: 2.4,
              peak_15m_label: "Peak 15m",
              peak_15m_change_pct: 0.2,
              volume_ratio: 0.9,
              range_position_label: "Range Position",
              range_position: "inside_range",
              range_position_display: "Inside range",
              participated: false,
            },
          ],
          lead_mover_symbol: "BTCUSDT",
          strongest_peak_symbol: "BTCUSDT",
          highlight_cells: [
            { symbol: "BTCUSDT", column: "symbol", reason: "lead_mover" },
            {
              symbol: "BTCUSDT",
              column: "peak_15m",
              reason: "strongest_peak_15m",
            },
          ],
          chart: {
            chart_highlight_type: "event_window",
            highlight_start: "2026-06-20T15:15:00.000Z",
            highlight_end: "2026-06-20T16:00:00.000Z",
            peak_marker_time: "2026-06-20T15:30:00.000Z",
            feed_card_id: "sig_fixture",
          },
          brief: {
            id: "brief_signal_fixture",
            status: "brief_ready",
            public_label: "Likely Cause",
            classification: "Likely Cause",
            confidence: "medium",
            headline: "Catalyst context aligned with the evidence window",
            collapsed_summary:
              "Source-backed context links the move to a time-aligned market update, with price-check support kept separate.",
            context_details:
              "Reuters is treated as the likely source, CoinDesk provides broader backdrop, and Cointelegraph is only a price check. The card keeps catalyst support, backdrop context, and price-check sources visually separate.",
            source_support: "medium",
            source_timing_alignment: "exact",
          },
          expanded: {
            source_route_hint: "macro_market_context",
            chart_context_label: "Strong chart context",
            chart_context_reasons: [
              "BTC and SOL broke high inside the evidence window",
              "direction consistency was broad across participating symbols",
            ],
          },
        },
      ],
    },
  ],
};

async function startFixtureApi() {
  const server = http.createServer((request, response) => {
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type",
      });
      response.end();
      return;
    }

    const url = new URL(request.url, "http://127.0.0.1");

    if (url.pathname === "/api/intelligence/feed") {
      json(response, fixtureFeed);
      return;
    }

    if (url.pathname === "/api/market/latest") {
      json(response, {
        ok: true,
        updated_at: "2026-06-21T12:00:00.000Z",
        symbols: ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT"].map(
          (symbol, index) => ({
            symbol,
            last_price: [65000, 2500, 620, 150, 2.1][index],
            last_close_time: "2026-06-21T12:00:00.000Z",
            change_15m_pct: [0.2, 0.1, -0.1, 0.3, 0.4][index],
            change_24h_pct: [1.1, 0.8, -0.3, 1.7, 2.1][index],
            data_status: "fresh",
          }),
        ),
      });
      return;
    }

    if (url.pathname === "/api/market/candles") {
      json(response, {
        ok: true,
        symbol: url.searchParams.get("symbol") ?? "BTCUSDT",
        interval: "15m",
        range_days: 1,
        candles: makeCandles(url.searchParams.get("symbol") ?? "BTCUSDT"),
      });
      return;
    }

    if (url.pathname === "/api/metrics/views") {
      json(response, {
        ok: true,
        updated_at: "2026-06-21T12:00:00.000Z",
        today_utc: "2026-06-21",
        total_views: 42,
        today_views: 3,
      });
      return;
    }

    json(response, { ok: false, error: "not_found" }, 404);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
}

async function getFreePort() {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForHttp(url, timeoutMs = 60000) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

async function waitForJson(url, timeoutMs = 10000) {
  const response = await waitForHttp(url, timeoutMs);
  return response.json();
}

function startNextDev(apiUrl, webPort) {
  const command = process.platform === "win32" ? "cmd.exe" : "corepack";
  const args =
    process.platform === "win32"
      ? [
          "/d",
          "/s",
          "/c",
          `corepack pnpm --filter @bytesiren/web exec next dev --hostname 127.0.0.1 --port ${webPort}`,
        ]
      : [
          "pnpm",
          "--filter",
          "@bytesiren/web",
          "exec",
          "next",
          "dev",
          "--hostname",
          "127.0.0.1",
          "--port",
          String(webPort),
        ];
  const output = [];
  const child = spawn(command, args, {
    cwd: ROOT,
    env: {
      ...process.env,
      NEXT_PUBLIC_API_BASE_URL: apiUrl,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk) => output.push(chunk.toString()));

  child.once("exit", (code) => {
    if (code && code !== 0) {
      output.push(`next dev exited with ${code}`);
    }
  });

  return { child, output };
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  if (process.platform === "win32" && child.pid) {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
    });
  } else {
    child.kill();
  }

  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 1000)),
  ]);
}

class CdpSession {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.nextId = 1;
    this.pending = new Map();
  }

  async open() {
    this.socket = new WebSocket(this.webSocketUrl);
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject, method } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) {
          reject(new Error(`${method}: ${message.error.message}`));
        } else resolve(message.result);
      }
    });
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.socket.send(payload);
    });
  }

  async evaluate(expression) {
    let result;
    try {
      result = await this.send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
    } catch (error) {
      throw new Error(
        `${error.message}; expression=${expression.slice(0, 220)}`,
      );
    }

    if (result.exceptionDetails) {
      const description =
        result.exceptionDetails.exception?.description ??
        result.exceptionDetails.exception?.value;
      throw new Error(
        description ??
          result.exceptionDetails.text ??
          "Runtime evaluation failed",
      );
    }

    return result.result.value;
  }

  close() {
    this.socket?.close();
  }
}

async function waitForCondition(session, expression, timeoutMs = 15000) {
  const start = Date.now();
  let lastValue;
  while (Date.now() - start < timeoutMs) {
    lastValue = await session.evaluate(expression);
    if (lastValue) return lastValue;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(
    `Timed out waiting for condition: ${expression}; last=${lastValue}`,
  );
}

async function click(session, selector) {
  const result = await session.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return { ok: false };
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return { ok: true, text: element.textContent.trim() };
  })()`);

  assert.equal(result.ok, true, `missing clickable element ${selector}`);
  return result.text;
}

async function runBrowserSmoke() {
  const browserPath = await chooseBrowser();
  const api = await startFixtureApi();
  const webPort = await getFreePort();
  const web = startNextDev(api.url, webPort);
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "bytesiren-v02-"));
  const remoteDebuggingPort = await getFreePort();
  let browser;
  let session;

  try {
    const webUrl = `http://127.0.0.1:${webPort}`;
    try {
      await waitForHttp(webUrl, 90000);
    } catch (error) {
      const logs = web.output.join("").slice(-4000);
      throw new Error(
        `Next dev server did not become reachable at ${webUrl}.\n${logs}`,
        { cause: error },
      );
    }

    browser = spawn(
      browserPath,
      [
        "--headless=new",
        "--disable-gpu",
        "--window-size=1440,950",
        "--no-first-run",
        "--no-default-browser-check",
        `--remote-debugging-port=${remoteDebuggingPort}`,
        `--user-data-dir=${userDataDir}`,
        webUrl,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );

    const pages = await waitForJson(
      `http://127.0.0.1:${remoteDebuggingPort}/json/list`,
      15000,
    );
    const page = pages.find((target) => target.type === "page") ?? pages[0];
    assert.ok(page?.webSocketDebuggerUrl, "missing page debugger URL");

    session = new CdpSession(page.webSocketDebuggerUrl);
    await session.open();
    await session.send("Runtime.enable");
    await session.send("Page.enable");

    await waitForCondition(
      session,
      `document.querySelector('[data-testid="intelligence-feed-v02"]') && document.body.innerText.includes('Daily Overview') && document.body.innerText.includes('Market Story') && document.body.innerText.includes('Signal Event') && document.body.innerText.includes('Reversed, Net up')`,
      30000,
    );

    const initial = await session.evaluate(`(() => {
      const body = document.body.innerText;
      const daily = document.querySelector('[data-item-type="daily_overview"]')?.innerText ?? "";
      const story = document.querySelector('[data-item-type="market_story"]')?.innerText ?? "";
      const signal = document.querySelector('[data-item-type="signal_event"]')?.innerText ?? "";
      return {
        hasEmptyState: body.includes('No v0.2 intelligence items'),
        has24hChange: body.includes('24h Change'),
        hasAvgChange: body.toLowerCase().includes('avg change'),
        storyHasVolatilityScore: story.includes('Volatility Score'),
        storyHasSwingChange: story.includes('Swing Change'),
        dailyHasTopDailyMover: daily.includes('Top daily mover'),
        dailyHasWidestRange: daily.includes('Widest range'),
        dailyHasLeadLabel: /(^|\\n)\\s*Lead\\s*:/.test(daily),
        dailyHasStandalonePeakLabel: /(^|\\n)\\s*Peak\\s*:/.test(daily),
        hasOldMarketStoryContinue: body.includes('Market Story (Continue)'),
        sectionCount: document.querySelectorAll('[data-testid="feed-section-v02"]').length,
        dayPostCount: document.querySelectorAll('[data-testid="day-post-v02"]').length,
        globalLabel: document.querySelector('[data-testid="feed-v02-global-toggle"]')?.textContent.trim(),
        storyHasBoundarySource: story.includes('Story Boundary Publisher'),
        storyHasPublicContext: story.includes('Public Context'),
        storyHasFocusedCause: story.includes('Focused Cause'),
        storyHasLikelyCause: story.includes('Likely Cause'),
        storyHasMarketBackdrop: story.includes('Market Backdrop'),
        storyHasNoClearCause: story.includes('No Clear Cause'),
        storyHasClaudeLimited: story.includes('Claude Limited'),
        hasMarketWideEventLabel: body.includes('Market-wide event'),
        hasMarketDayLabel: body.includes('Market Day'),
        hasTwoSidedLabel: body.includes('Two-sided'),
        hasOpaqueContextScore: body.includes('Context 88'),
        signalHasWindow: signal.includes('15:15-16:00 UTC') || signal.includes('15:15 - 16:00 UTC'),
        signalHasReversalLifecycle: signal.includes('Reversed, Net up'),
        signalHasObservedUp: signal.includes('Observed up'),
        signalHasEvidenceWindowCaption: signal.includes('Evidence window'),
        dailySource: Boolean(document.querySelector('a[href="https://www.coindesk.com/markets/2026/06/20/daily-crypto-market-context/"]')),
        signalSource: Boolean(document.querySelector('a[href="https://www.reuters.com/markets/2026/06/20/crypto-market-update/"]')),
      };
    })()`);

    assert.equal(initial.dayPostCount, 1, "day post should be visible");
    assert.equal(initial.sectionCount, 3, "all v02 sections should render");
    assert.equal(initial.globalLabel.includes("Collapse days"), true);
    assert.equal(initial.hasEmptyState, false);
    assert.equal(initial.has24hChange, true);
    assert.equal(initial.hasAvgChange, true);
    assert.equal(initial.storyHasVolatilityScore, true);
    assert.equal(initial.storyHasSwingChange, false);
    assert.equal(initial.dailyHasTopDailyMover, true);
    assert.equal(initial.dailyHasWidestRange, true);
    assert.equal(initial.dailyHasLeadLabel, false);
    assert.equal(initial.dailyHasStandalonePeakLabel, false);
    assert.equal(initial.hasOldMarketStoryContinue, false);
    assert.equal(initial.dailySource, true, "Daily source chip should render");
    assert.equal(
      initial.signalSource,
      true,
      "Signal source chip should render",
    );
    assert.equal(initial.storyHasBoundarySource, false);
    assert.equal(initial.storyHasPublicContext, false);
    assert.equal(initial.storyHasFocusedCause, false);
    assert.equal(initial.storyHasLikelyCause, false);
    assert.equal(initial.storyHasMarketBackdrop, false);
    assert.equal(initial.storyHasNoClearCause, false);
    assert.equal(initial.storyHasClaudeLimited, false);
    assert.equal(initial.hasMarketWideEventLabel, false);
    assert.equal(initial.hasMarketDayLabel, false);
    assert.equal(initial.hasTwoSidedLabel, false);
    assert.equal(initial.hasOpaqueContextScore, false);
    assert.equal(initial.signalHasWindow, true);
    assert.equal(initial.signalHasReversalLifecycle, true);
    assert.equal(initial.signalHasObservedUp, false);
    assert.equal(initial.signalHasEvidenceWindowCaption, false);

    await click(session, '[data-testid="feed-v02-global-toggle"]');
    await waitForCondition(
      session,
      `document.querySelector('[data-testid="feed-v02-global-toggle"]')?.textContent.includes('Expand days') && document.querySelectorAll('[data-testid="feed-section-v02"]').length === 1`,
    );

    const collapsed = await session.evaluate(`(() => ({
      sectionCount: document.querySelectorAll('[data-testid="feed-section-v02"]').length,
      sectionTypes: Array.from(document.querySelectorAll('[data-testid="feed-section-v02"]')).map((section) => section.getAttribute('data-item-type')),
      hiddenCount: document.querySelector('[data-testid="day-post-hidden-count-v02"]')?.textContent.trim(),
      dayToggle: document.querySelector('[data-testid="day-post-toggle-v02"]')?.textContent.trim(),
    }))()`);
    assert.equal(collapsed.sectionCount, 1);
    assert.deepEqual(collapsed.sectionTypes, ["daily_overview"]);
    assert.equal(collapsed.hiddenCount, "+2 events");
    assert.equal(collapsed.dayToggle.includes("Expand post"), true);
    assert.equal(collapsed.dayToggle.includes("+2 events"), false);

    await click(session, '[data-testid="day-post-toggle-v02"]');
    await waitForCondition(
      session,
      `document.querySelectorAll('[data-testid="feed-section-v02"]').length === 3 && document.querySelector('[data-testid="day-post-toggle-v02"]')?.textContent.includes('Collapse post')`,
    );

    await click(
      session,
      '[data-testid="feed-section-v02"][data-item-type="signal_event"]',
    );
    await waitForCondition(
      session,
      `document.querySelector('[data-testid="feed-section-v02"][data-item-type="signal_event"]')?.getAttribute('data-selected') === 'true' && document.querySelector('[data-testid="trading-view-chart"]')?.getAttribute('data-v02-selected-highlight-id')?.includes('sig_fixture')`,
    );

    const sourceClickState = await session.evaluate(`(() => {
      const signal = document.querySelector('[data-testid="feed-section-v02"][data-item-type="signal_event"]');
      const source = document.querySelector('a[href="https://www.reuters.com/markets/2026/06/20/crypto-market-update/"]');
      source?.addEventListener('click', (event) => event.preventDefault(), { once: true });
      source?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return {
        selected: signal?.getAttribute('data-selected'),
        href: source?.getAttribute('href'),
      };
    })()`);
    assert.equal(sourceClickState.selected, "true");
    assert.equal(
      sourceClickState.href,
      "https://www.reuters.com/markets/2026/06/20/crypto-market-update/",
    );

    await waitForCondition(
      session,
      `document.querySelector('[data-testid="trading-view-chart"]')?.getAttribute('data-v02-source-marker-count') === '3' && document.querySelectorAll('[data-testid="chart-v02-source-marker"][data-item-id="sig_fixture"]').length === 3`,
    );
    await click(
      session,
      '[data-testid="chart-v02-source-marker"][data-item-id="sig_fixture"]',
    );
    await waitForCondition(
      session,
      `document.querySelector('[data-testid="feed-section-v02"][data-item-type="signal_event"]')?.getAttribute('data-selected') === 'true'`,
    );

    await click(
      session,
      '[data-testid="feed-section-v02"][data-item-type="signal_event"]',
    );
    await waitForCondition(
      session,
      `document.querySelector('[data-testid="feed-section-v02"][data-item-type="signal_event"]')?.getAttribute('data-selected') === 'false' && document.querySelector('[data-testid="trading-view-chart"]')?.getAttribute('data-v02-selected-highlight-id') === ''`,
    );

    await click(
      session,
      '[data-testid="feed-section-v02"][data-item-type="market_story"]',
    );
    await waitForCondition(
      session,
      `document.querySelector('[data-testid="feed-section-v02"][data-item-type="market_story"]')?.getAttribute('data-selected') === 'true' && document.querySelector('[data-testid="trading-view-chart"]')?.getAttribute('data-v02-selected-highlight-id')?.includes('story_fixture')`,
    );

    await click(
      session,
      '[data-testid="feed-section-v02"][data-item-type="market_story"]',
    );
    await waitForCondition(
      session,
      `document.querySelector('[data-testid="feed-section-v02"][data-item-type="market_story"]')?.getAttribute('data-selected') === 'false'`,
    );

    await click(
      session,
      '[data-testid="feed-section-v02"][data-item-type="daily_overview"]',
    );
    await waitForCondition(
      session,
      `document.querySelector('[data-testid="feed-section-v02"][data-item-type="daily_overview"]')?.getAttribute('data-selected') === 'true' && document.querySelector('[data-testid="trading-view-chart"]')?.getAttribute('data-v02-selected-highlight-id')?.includes('daily_2026-06-20')`,
    );

    await click(
      session,
      '[data-testid="feed-section-v02"][data-item-type="daily_overview"]',
    );
    await waitForCondition(
      session,
      `document.querySelector('[data-testid="feed-section-v02"][data-item-type="daily_overview"]')?.getAttribute('data-selected') === 'false'`,
    );

    await click(session, '[data-testid="feed-v02-global-toggle"]');
    await waitForCondition(
      session,
      `document.querySelectorAll('[data-testid="feed-section-v02"]').length === 1`,
    );

    await click(
      session,
      '[data-testid="chart-v02-highlight"][data-item-id="sig_fixture"]',
    );
    await waitForCondition(
      session,
      `document.querySelectorAll('[data-testid="feed-section-v02"]').length === 3 && document.querySelector('[data-testid="feed-section-v02"][data-section-id="sig_fixture"]')?.getAttribute('data-selected') === 'true'`,
    );

    await session.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
    });
    await waitForCondition(
      session,
      `document.querySelector('[data-testid="feed-section-v02"][data-section-id="sig_fixture"]')?.getAttribute('data-selected') === 'false'`,
    );

    await click(
      session,
      '[data-testid="feed-section-toggle-v02"][data-section-id="sig_fixture"]',
    );
    await waitForCondition(
      session,
      `document.querySelector('[data-testid="feed-section-toggle-v02"][data-section-id="sig_fixture"]')?.textContent.includes('Hide') && document.body.innerText.includes('Change') && document.body.innerText.includes('Peak 15m') && document.body.innerText.includes('Volume x') && document.body.innerText.includes('Range Position')`,
    );

    await session.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 900,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await waitForCondition(
      session,
      `Boolean(document.querySelector('[data-testid="day-post-v02"]') && document.querySelector('[data-testid="intelligence-feed-v02"]'))`,
    );
    const mobile = await session.evaluate(`(() => ({
      viewportWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      hasDayPost: Boolean(document.querySelector('[data-testid="day-post-v02"]')),
      hasTable: document.body.innerText.includes('Range Position'),
    }))()`);
    assert.equal(mobile.hasDayPost, true);
    assert.equal(mobile.hasTable, true);
    assert.ok(
      mobile.scrollWidth <= mobile.viewportWidth + 24,
      `mobile layout overflowed page width: ${JSON.stringify(mobile)}`,
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          api_url: api.url,
          web_url: webUrl,
          day_posts: initial.dayPostCount,
          initial_sections: initial.sectionCount,
          collapsed_sections: collapsed.sectionCount,
          mobile_scroll_width: mobile.scrollWidth,
          mobile_viewport_width: mobile.viewportWidth,
        },
        null,
        2,
      ),
    );
  } finally {
    session?.close();
    await stopChild(browser);
    await stopChild(web.child);
    await new Promise((resolve) => api.server.close(resolve));
    try {
      await rm(userDataDir, { recursive: true, force: true });
    } catch (error) {
      if (error?.code !== "EBUSY") {
        throw error;
      }
      console.warn(
        `Browser profile cleanup skipped because Windows still has a file lock: ${userDataDir}`,
      );
    }
  }
}

async function runFixtureServer() {
  const api = await startFixtureApi();
  const webPort = await getFreePort();
  const web = startNextDev(api.url, webPort);
  const webUrl = `http://127.0.0.1:${webPort}`;
  let shuttingDown = false;

  async function shutdown(exitCode = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    await stopChild(web.child);
    await new Promise((resolve) => api.server.close(resolve));
    process.exit(exitCode);
  }

  process.once("SIGINT", () => {
    void shutdown(0);
  });
  process.once("SIGTERM", () => {
    void shutdown(0);
  });

  try {
    await waitForHttp(webUrl, 90000);
  } catch (error) {
    const logs = web.output.join("").slice(-4000);
    await stopChild(web.child);
    await new Promise((resolve) => api.server.close(resolve));
    throw new Error(
      `Next dev server did not become reachable at ${webUrl}.\n${logs}`,
      { cause: error },
    );
  }

  console.log(
    [
      "ByteSiren v0.2 fixture UI is running.",
      `Web UI: ${webUrl}`,
      `Fixture API: ${api.url}`,
      "Open the Web UI URL in your browser.",
      "Press Ctrl+C in this terminal to stop both servers.",
    ].join("\n"),
  );
}

const serveFixture = process.argv.includes("--serve");

(serveFixture ? runFixtureServer() : runBrowserSmoke()).catch((error) => {
  console.error(error);
  process.exit(1);
});
