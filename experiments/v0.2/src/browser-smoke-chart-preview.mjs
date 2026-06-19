#!/usr/bin/env node

import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import {
  access,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const EXPERIMENT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const CHART_PREVIEW_DIR = path.join(EXPERIMENT_ROOT, "chart-preview");
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

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

async function startStaticServer() {
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      const relativePath =
        url.pathname === "/"
          ? "index.html"
          : decodeURIComponent(url.pathname.slice(1));
      const filePath = path.resolve(CHART_PREVIEW_DIR, relativePath);
      const rootWithSep = `${CHART_PREVIEW_DIR}${path.sep}`;

      if (filePath !== CHART_PREVIEW_DIR && !filePath.startsWith(rootWithSep)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      response.writeHead(200, { "content-type": contentType(filePath) });
      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    server,
    url: `http://127.0.0.1:${address.port}/`,
  };
}

async function waitForJson(url, timeoutMs = 8000) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
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
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
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
      this.pending.set(id, { resolve, reject });
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

async function waitForCondition(session, expression, timeoutMs = 8000) {
  const start = Date.now();
  let lastValue;
  while (Date.now() - start < timeoutMs) {
    lastValue = await session.evaluate(expression);
    if (lastValue) return lastValue;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Timed out waiting for condition: ${expression}; last=${lastValue}`,
  );
}

async function runBrowserSmoke() {
  const browserPath = await chooseBrowser();
  const { server, url } = await startStaticServer();
  const userDataDir = await mkdtemp(
    path.join(os.tmpdir(), "bytesiren-v02-r4-"),
  );
  const remoteDebuggingPort = 9300 + Math.floor(Math.random() * 500);
  let browser;
  let session;

  try {
    browser = spawn(
      browserPath,
      [
        "--headless=new",
        "--disable-gpu",
        "--window-size=1500,900",
        "--no-first-run",
        "--no-default-browser-check",
        `--remote-debugging-port=${remoteDebuggingPort}`,
        `--user-data-dir=${userDataDir}`,
        url,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );

    const pages = await waitForJson(
      `http://127.0.0.1:${remoteDebuggingPort}/json/list`,
    );
    const page = pages.find((target) => target.type === "page") ?? pages[0];
    assert.ok(page?.webSocketDebuggerUrl, "missing page debugger URL");

    session = new CdpSession(page.webSocketDebuggerUrl);
    await session.open();
    await session.send("Runtime.enable");
    await session.send("Page.enable");
    await waitForCondition(
      session,
      "window.feedContract?.preview_diagnostics && document.querySelectorAll('.daily-section').length === 31 && document.querySelectorAll('.signal-section').length === window.feedContract.preview_diagnostics.public_signal_count",
    );

    const initial = await session.evaluate(`(() => ({
      diagnostics: document.querySelector('#feed-diagnostics')?.textContent,
      dailySections: document.querySelectorAll('.daily-section').length,
      signalSections: document.querySelectorAll('.signal-section').length,
      expectedSignals: feedContract.preview_diagnostics.public_signal_count,
      expectedAudit: feedContract.preview_diagnostics.audit_event_count,
      detectorVersion: feedContract.detector_version,
      chartContextEnabled: feedContract.chart_context_enabled,
      dayToggle: document.querySelector('#day-toggle')?.textContent.trim(),
      selectedType: state.selectedType,
      selectedId: state.selectedId,
      symbolValue: document.querySelector('#symbol-select')?.value,
      canvasWidth: document.querySelector('#chart')?.width,
      canvasHeight: document.querySelector('#chart')?.height
    }))()`);

    assert.match(initial.diagnostics, /31 days/);
    assert.match(initial.diagnostics, /detector vnext_c/);
    assert.match(initial.diagnostics, /chart context enabled/);
    assert.equal(initial.dailySections, 31);
    assert.equal(initial.signalSections, initial.expectedSignals);
    assert.equal(initial.detectorVersion, "vnext_c");
    assert.equal(initial.chartContextEnabled, true);
    assert.equal(initial.dayToggle, "Collapse days");
    assert.equal(initial.selectedType, null);
    assert.equal(initial.symbolValue, "BTCUSDT");
    assert.ok(initial.canvasWidth > 0 && initial.canvasHeight > 0);

    await session.evaluate(`(() => {
      const select = document.querySelector('#symbol-select');
      select.value = 'ALL';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    const allSymbolMode = await session.evaluate(`(() => ({
      symbol: state.symbol,
      selectValue: document.querySelector('#symbol-select').value,
      hitZones: state.hitZones.length,
      canvasWidth: document.querySelector('#chart').width,
      canvasHeight: document.querySelector('#chart').height
    }))()`);
    assert.equal(allSymbolMode.symbol, "ALL");
    assert.equal(allSymbolMode.selectValue, "ALL");
    assert.ok(allSymbolMode.hitZones > 0);
    assert.ok(allSymbolMode.canvasWidth > 0 && allSymbolMode.canvasHeight > 0);
    await session.evaluate(`(() => {
      const select = document.querySelector('#symbol-select');
      select.value = 'BTCUSDT';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    assert.equal(await session.evaluate(`state.symbol`), "BTCUSDT");

    const visibleSignalText = await session.evaluate(
      `document.querySelector('.signal-section')?.innerText ?? ''`,
    );
    assert.match(visibleSignalText, /Evidence window:/);
    assert.match(visibleSignalText, /candles/);
    assert.match(visibleSignalText, /Avg Change/);

    await session.evaluate(`document.querySelector('.section-toggle').click()`);
    assert.equal(
      await session.evaluate(
        `document.querySelector('.section-toggle').textContent.trim()`,
      ),
      "Hide",
    );
    await session.evaluate(`document.querySelector('.section-toggle').click()`);
    assert.equal(
      await session.evaluate(
        `document.querySelector('.section-toggle').textContent.trim()`,
      ),
      "Show more",
    );

    await session.evaluate(`document.querySelector('.signal-section').click()`);
    assert.deepEqual(
      await session.evaluate(`(() => ({
        type: state.selectedType,
        cardSelected: Boolean(document.querySelector('.signal-section.is-selected.selected-signal')),
        label: document.querySelector('#selection-label').textContent
      }))()`),
      {
        type: "signal_event",
        cardSelected: true,
        label: await session.evaluate(
          `document.querySelector('#selection-label').textContent`,
        ),
      },
    );
    assert.match(
      await session.evaluate(
        `document.querySelector('#selection-label').textContent`,
      ),
      /Selected signal:/,
    );
    await session.evaluate(
      `document.querySelector('.signal-section.is-selected').click()`,
    );
    assert.equal(await session.evaluate(`state.selectedType`), null);

    await session.evaluate(`document.querySelector('#day-toggle').click()`);
    const collapsed = await session.evaluate(`(() => ({
      dayToggle: document.querySelector('#day-toggle').textContent.trim(),
      sectionCount: document.querySelectorAll('.section-card').length,
      daysExpanded: state.daysExpanded
    }))()`);
    assert.equal(collapsed.dayToggle, "Expand days");
    assert.equal(collapsed.sectionCount, 31);
    assert.equal(collapsed.daysExpanded, false);

    const hiddenSignal = await session.evaluate(`(() => {
      const post = publicDayPosts.find((group) =>
        group.has_extra_items &&
        group.items.some((item) =>
          item.item_type === 'signal_event' &&
          !group.visible_item_ids_when_collapsed.includes(item.id)
        )
      );
      const signal = post.items.find((item) =>
        item.item_type === 'signal_event' &&
        !post.visible_item_ids_when_collapsed.includes(item.id)
      );
      return { id: signal.id, dayPostId: post.day_post_id };
    })()`);
    await session.evaluate(`(() => {
      const zone = state.hitZones.find((hit) => hit.id === ${JSON.stringify(hiddenSignal.id)});
      const canvas = document.querySelector('#chart');
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + zone.x + Math.min(6, zone.w / 2),
        clientY: rect.top + zone.y + Math.min(20, zone.h / 2),
      }));
    })()`);
    const selectedFromChart = await session.evaluate(`(() => ({
      type: state.selectedType,
      id: state.selectedId,
      dayExpanded: state.dayOverrides.get(${JSON.stringify(hiddenSignal.dayPostId)}),
      cardVisible: Boolean(Array.from(document.querySelectorAll('.section-card')).find((card) => card.dataset.id === ${JSON.stringify(hiddenSignal.id)}))
    }))()`);
    assert.equal(selectedFromChart.type, "signal_event");
    assert.equal(selectedFromChart.id, hiddenSignal.id);
    assert.equal(selectedFromChart.dayExpanded, true);
    assert.equal(selectedFromChart.cardVisible, true);

    await session.evaluate(`(() => {
      const zone = state.hitZones.find((hit) => hit.id === ${JSON.stringify(hiddenSignal.id)});
      const canvas = document.querySelector('#chart');
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + zone.x + Math.min(6, zone.w / 2),
        clientY: rect.top + zone.y + Math.min(20, zone.h / 2),
      }));
    })()`);
    assert.equal(await session.evaluate(`state.selectedType`), null);

    const dailyWithSignals = await session.evaluate(`(() => {
      const overview = publicItems.find((item) =>
        item.item_type === 'daily_overview' &&
        item.chart.included_signal_event_ids.length > 0
      );
      return { id: overview.id, included: overview.chart.included_signal_event_ids };
    })()`);
    await session.evaluate(
      `Array.from(document.querySelectorAll('.section-card')).find((card) => card.dataset.id === ${JSON.stringify(dailyWithSignals.id)}).click()`,
    );
    const dailySelected = await session.evaluate(`(() => ({
      type: state.selectedType,
      id: state.selectedId,
      dailySelected: Boolean(document.querySelector('.daily-section.is-selected.selected-daily')),
      dayZones: state.hitZones.filter((hit) => hit.kind === 'daily').map((hit) => hit.id),
      signalZones: state.hitZones.filter((hit) => hit.kind === 'signal').map((hit) => hit.id)
    }))()`);
    assert.equal(dailySelected.type, "daily_overview");
    assert.equal(dailySelected.id, dailyWithSignals.id);
    assert.equal(dailySelected.dailySelected, true);
    assert.deepEqual(dailySelected.dayZones, [dailyWithSignals.id]);
    assert.deepEqual(
      dailySelected.signalZones.sort(),
      dailyWithSignals.included.sort(),
    );
    await session.evaluate(
      `document.querySelector('.daily-section.is-selected').click()`,
    );
    assert.equal(await session.evaluate(`state.selectedType`), null);

    await session.evaluate(`document.querySelector('.signal-section').click()`);
    await session.evaluate(`(() => {
      const canvas = document.querySelector('#chart');
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: rect.right - 3,
        clientY: rect.bottom - 3,
      }));
    })()`);
    assert.equal(await session.evaluate(`state.selectedType`), null);

    await session.evaluate(`(() => {
      state.daysExpanded = true;
      state.dayOverrides.clear();
      render();
    })()`);
    assert.equal(
      await session.evaluate(
        `document.querySelector('#day-toggle').textContent.trim()`,
      ),
      "Collapse days",
    );

    await session.evaluate(
      `document.querySelector('[data-mode="both"]').click()`,
    );
    const bothMode = await session.evaluate(`(() => ( {
      mode: state.mode,
      selectedType: state.selectedType,
      dailySections: document.querySelectorAll('.daily-section').length,
      signalSections: document.querySelectorAll('.signal-section').length,
      auditSections: document.querySelectorAll('.audit-section').length,
      combinedHeader: document.querySelector('.combined-audit-header')?.innerText ?? '',
      dayToggle: document.querySelector('#day-toggle').textContent.trim(),
      dayToggleDisabled: document.querySelector('#day-toggle').disabled,
      hasBothButton: Boolean(document.querySelector('[data-mode="both"].is-active'))
    }))()`);
    assert.equal(bothMode.mode, "both");
    assert.equal(bothMode.selectedType, null);
    assert.equal(bothMode.dailySections, 31);
    assert.equal(bothMode.signalSections, initial.expectedSignals);
    assert.equal(bothMode.auditSections, initial.expectedAudit);
    assert.match(bothMode.combinedHeader, /Audit events/i);
    assert.equal(bothMode.dayToggle, "Collapse days");
    assert.equal(bothMode.dayToggleDisabled, false);
    assert.equal(bothMode.hasBothButton, true);

    await session.evaluate(
      `document.querySelector('.combined-audit-group .audit-section').click()`,
    );
    assert.equal(await session.evaluate(`state.selectedType`), "audit_event");
    assert.equal(
      await session.evaluate(
        `Boolean(document.querySelector('.combined-audit-group .audit-section.is-selected.selected-audit'))`,
      ),
      true,
    );
    await session.evaluate(
      `document.querySelector('.combined-audit-group .audit-section.is-selected').click()`,
    );
    assert.equal(await session.evaluate(`state.selectedType`), null);

    await session.evaluate(
      `document.querySelector('[data-mode="public"]').click()`,
    );
    assert.deepEqual(
      await session.evaluate(`(() => ({
        mode: state.mode,
        selectedType: state.selectedType,
        auditSections: document.querySelectorAll('.audit-section').length
      }))()`),
      {
        mode: "public",
        selectedType: null,
        auditSections: 0,
      },
    );

    await session.evaluate(`document.querySelector('.signal-section').click()`);
    await session.evaluate(
      `document.querySelector('[data-mode="audit"]').click()`,
    );
    const auditMode = await session.evaluate(`(() => ({
      mode: state.mode,
      selectedType: state.selectedType,
      auditSections: document.querySelectorAll('.audit-section').length
    }))()`);
    assert.deepEqual(auditMode, {
      mode: "audit",
      selectedType: null,
      auditSections: initial.expectedAudit,
    });

    await session.evaluate(`document.querySelector('.audit-section').click()`);
    assert.equal(await session.evaluate(`state.selectedType`), "audit_event");
    assert.equal(
      await session.evaluate(
        `Boolean(document.querySelector('.audit-section.is-selected.selected-audit'))`,
      ),
      true,
    );
    await session.evaluate(
      `document.querySelector('.audit-section.is-selected').click()`,
    );
    assert.equal(await session.evaluate(`state.selectedType`), null);

    await session.evaluate(`(() => {
      const zone = state.hitZones.find((hit) => hit.kind === 'audit');
      const canvas = document.querySelector('#chart');
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + zone.x + Math.min(6, zone.w / 2),
        clientY: rect.top + zone.y + Math.min(20, zone.h / 2),
      }));
    })()`);
    assert.equal(await session.evaluate(`state.selectedType`), "audit_event");
    await session.evaluate(`(() => {
      const zone = state.hitZones.find((hit) => hit.kind === 'audit');
      const canvas = document.querySelector('#chart');
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + zone.x + Math.min(6, zone.w / 2),
        clientY: rect.top + zone.y + Math.min(20, zone.h / 2),
      }));
    })()`);
    assert.equal(await session.evaluate(`state.selectedType`), null);

    const screenshot = await session.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    const screenshotPath = path.join(
      os.tmpdir(),
      "bytesiren-v02-r4-chart-preview-smoke.png",
    );
    await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

    console.log(
      JSON.stringify(
        {
          result: "PASS",
          browser: browserPath,
          url,
          diagnostics: initial.diagnostics,
          screenshot_path: screenshotPath,
          selection_checks: [
            "signal_card_toggle",
            "chart_window_toggle",
            "daily_overview_toggle",
            "neutral_chart_clear",
            "both_mode_public_and_audit_cards",
            "both_mode_audit_card_toggle",
            "mode_switch_clear",
            "audit_card_toggle",
            "audit_chart_toggle",
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    session?.close();
    if (browser) {
      browser.kill();
      await new Promise((resolve) => {
        if (browser.exitCode !== null) {
          resolve();
          return;
        }
        browser.once("exit", resolve);
        setTimeout(resolve, 1000);
      });
    }
    server.close();
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}

runBrowserSmoke().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
