#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const EDGE_PATH =
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const CHROME_PATH =
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const DESKTOP_SCREENSHOT = ".tmp/v02-real-api-smoke-desktop.png";
const MOBILE_SCREENSHOT = ".tmp/v02-real-api-smoke-mobile.png";

function readOption(argv, name) {
  const equalsPrefix = `${name}=`;
  const equalsValue = argv.find((item) => item.startsWith(equalsPrefix));

  if (equalsValue) {
    return equalsValue.slice(equalsPrefix.length);
  }

  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

export function parseRealApiSmokeArgs(
  argv = process.argv.slice(2),
  env = process.env,
) {
  const apiBase =
    readOption(argv, "--api-base") ?? env.NEXT_PUBLIC_API_BASE_URL;
  const webUrl = readOption(argv, "--web-url");
  const headlessValue = readOption(argv, "--headless");

  if (!apiBase) {
    throw new Error(
      "--api-base or NEXT_PUBLIC_API_BASE_URL is required for real API smoke.",
    );
  }

  return {
    apiBase,
    webUrl,
    headless: headlessValue === undefined ? true : headlessValue !== "false",
  };
}

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

async function readApiFeed(apiBase) {
  const response = await waitForHttp(
    new URL("/api/intelligence/feed", apiBase),
    15000,
  );
  const feed = await response.json();

  if (feed.version !== "v02") {
    throw new Error(
      `Real API smoke requires FEED_VERSION=v02; received ${feed.version ?? "none"}.`,
    );
  }

  return feed;
}

function startNextDev(apiBase, webPort) {
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
      NEXT_PUBLIC_API_BASE_URL: apiBase,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk) => output.push(chunk.toString()));

  return { child, output, url: `http://127.0.0.1:${webPort}` };
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
        } else {
          resolve(message.result);
        }
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
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });

    if (result.exceptionDetails) {
      const description =
        result.exceptionDetails.exception?.description ??
        result.exceptionDetails.exception?.value ??
        result.exceptionDetails.text;
      throw new Error(description ?? "Runtime evaluation failed");
    }

    return result.result.value;
  }

  close() {
    this.socket?.close();
  }
}

async function waitForCondition(session, expression, timeoutMs = 20000) {
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

async function clickIfPresent(session, selector) {
  return await session.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return { ok: false, text: null };
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return { ok: true, text: element.textContent.trim() };
  })()`);
}

async function writeScreenshot(session, outputPath) {
  const result = await session.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(result.data, "base64"));
}

function countItems(feed) {
  const counts = {
    dayPosts: Array.isArray(feed.day_groups) ? feed.day_groups.length : 0,
    daily: 0,
    story: 0,
    signal: 0,
  };

  for (const group of feed.day_groups ?? []) {
    for (const item of group.items ?? []) {
      if (item.item_type === "daily_overview") counts.daily += 1;
      if (item.item_type === "market_story") counts.story += 1;
      if (item.item_type === "signal_event") counts.signal += 1;
    }
  }

  return counts;
}

export async function runRealApiSmoke(options) {
  const feed = await readApiFeed(options.apiBase);
  const feedCounts = countItems(feed);
  const browserPath = await chooseBrowser();
  const userDataDir = await mkdtemp(
    path.join(os.tmpdir(), "bytesiren-v02-real-"),
  );
  const remoteDebuggingPort = await getFreePort();
  let web = null;
  let browser = null;
  let session = null;

  try {
    const webPort = options.webUrl ? null : await getFreePort();
    const webUrl =
      options.webUrl ??
      (() => {
        web = startNextDev(options.apiBase, webPort);
        return web.url;
      })();

    if (web) {
      try {
        await waitForHttp(webUrl, 90000);
      } catch (error) {
        const logs = web.output.join("").slice(-4000);
        throw new Error(
          `Next dev server did not become reachable at ${webUrl}.\n${logs}`,
          { cause: error },
        );
      }
    }

    browser = spawn(
      browserPath,
      [
        options.headless ? "--headless=new" : "",
        "--disable-gpu",
        "--window-size=1440,950",
        "--no-first-run",
        "--no-default-browser-check",
        `--remote-debugging-port=${remoteDebuggingPort}`,
        `--user-data-dir=${userDataDir}`,
        webUrl,
      ].filter(Boolean),
      { stdio: ["ignore", "ignore", "pipe"] },
    );

    const pages = await (
      await waitForHttp(
        `http://127.0.0.1:${remoteDebuggingPort}/json/list`,
        15000,
      )
    ).json();
    const page = pages.find((target) => target.type === "page") ?? pages[0];
    assert.ok(page?.webSocketDebuggerUrl, "missing page debugger URL");

    session = new CdpSession(page.webSocketDebuggerUrl);
    await session.open();
    await session.send("Runtime.enable");
    await session.send("Page.enable");

    await waitForCondition(
      session,
      `document.querySelector('[data-testid="intelligence-feed-v02"]') && document.querySelector('[data-testid="trading-view-chart"]')`,
      30000,
    );

    const initial = await session.evaluate(`(() => {
      const body = document.body.innerText;
      const story = document.querySelector('[data-item-type="market_story"]')?.innerText ?? "";
      return {
        dayPosts: document.querySelectorAll('[data-testid="day-post-v02"]').length,
        sections: document.querySelectorAll('[data-testid="feed-section-v02"]').length,
        daily: document.querySelectorAll('[data-item-type="daily_overview"]').length,
        story: document.querySelectorAll('[data-item-type="market_story"]').length,
        signal: document.querySelectorAll('[data-item-type="signal_event"]').length,
        hasCollapseDays: body.includes('Collapse days'),
        hasShowMore: body.includes('Show more'),
        hasChart: Boolean(document.querySelector('[data-testid="trading-view-chart"]')),
        storyHasSources: story.includes('Sources') || story.includes('Public Context') || story.includes('Focused Cause') || story.includes('Likely Cause') || story.includes('Market Backdrop') || story.includes('No Clear Cause') || story.includes('Claude Limited'),
        feedEntries: performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => name.includes('/api/intelligence/feed')).length,
      };
    })()`);

    assert.equal(initial.hasChart, true);
    assert.equal(initial.dayPosts > 0, feedCounts.dayPosts > 0);
    assert.equal(initial.storyHasSources, false);
    assert.equal(initial.feedEntries >= 1, true);

    await writeScreenshot(session, DESKTOP_SCREENSHOT);

    const globalClick = await clickIfPresent(
      session,
      '[data-testid="feed-v02-global-toggle"]',
    );
    if (globalClick.ok) {
      await waitForCondition(
        session,
        `document.querySelector('[data-testid="feed-v02-global-toggle"]')?.textContent.includes('Expand days')`,
      );
      await clickIfPresent(session, '[data-testid="feed-v02-global-toggle"]');
      await waitForCondition(
        session,
        `document.querySelector('[data-testid="feed-v02-global-toggle"]')?.textContent.includes('Collapse days')`,
      );
    }

    const dayToggle = await clickIfPresent(
      session,
      '[data-testid="day-post-toggle-v02"]',
    );
    if (dayToggle.ok) {
      await clickIfPresent(session, '[data-testid="day-post-toggle-v02"]');
    }

    const sectionToggle = await clickIfPresent(
      session,
      '[data-testid="feed-section-toggle-v02"]',
    );
    if (sectionToggle.ok) {
      await waitForCondition(
        session,
        `document.querySelector('[data-testid="feed-section-toggle-v02"]')?.textContent.includes('Hide')`,
      );
      await clickIfPresent(session, '[data-testid="feed-section-toggle-v02"]');
    }

    const sourceClick = await session.evaluate(`(() => {
      const source = document.querySelector('[data-testid="feed-section-v02"][data-item-type="signal_event"] a[href], [data-testid="feed-section-v02"][data-item-type="daily_overview"] a[href]');
      if (!source) return { present: false };
      source.addEventListener('click', (event) => event.preventDefault(), { once: true });
      source.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return { present: true, href: source.getAttribute('href') };
    })()`);

    if (sourceClick.present) {
      assert.match(sourceClick.href, /^https?:\/\//);
    }

    await session.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 900,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await waitForCondition(
      session,
      `Boolean(document.querySelector('[data-testid="day-post-v02"]') || document.body.innerText.includes('No v0.2 intelligence items'))`,
    );
    const mobile = await session.evaluate(`(() => ({
      viewportWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      hasFeed: Boolean(document.querySelector('[data-testid="intelligence-feed-v02"]')),
    }))()`);
    assert.equal(mobile.hasFeed, true);
    assert.ok(
      mobile.scrollWidth <= mobile.viewportWidth + 24,
      `mobile layout overflowed page width: ${JSON.stringify(mobile)}`,
    );
    await writeScreenshot(session, MOBILE_SCREENSHOT);

    console.log(
      JSON.stringify(
        {
          ok: true,
          api_base: options.apiBase,
          web_url: webUrl,
          feed_counts: feedCounts,
          rendered: initial,
          mobile,
          screenshots: [DESKTOP_SCREENSHOT, MOBILE_SCREENSHOT],
        },
        null,
        2,
      ),
    );
  } finally {
    session?.close();
    await stopChild(browser);
    await stopChild(web?.child);
    try {
      await rm(userDataDir, { recursive: true, force: true });
    } catch (error) {
      if (error?.code !== "EBUSY") {
        throw error;
      }
    }
  }
}

async function main() {
  await runRealApiSmoke(parseRealApiSmokeArgs());
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
