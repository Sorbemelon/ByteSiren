import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DAILY_LABELS,
  SIGNAL_CLASSIFICATIONS,
  SIGNAL_SOURCE_TAGS,
  loadValidationInputs,
  parseArgs,
  runClaudeValidation,
  validateSources,
} from "./run-claude-validation.mjs";

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "bytesiren-claude-v02-"));
  const signalPayloadPath = path.join(root, "signal_payloads.json");
  const dailyPayloadPath = path.join(root, "daily_payloads.json");
  const signalPromptPath = path.join(root, "signal_prompt.md");
  const dailyPromptPath = path.join(root, "daily_prompt.md");
  const outputDir = path.join(root, "outputs");
  const cacheDir = path.join(root, "cache");
  const signalPayload = {
    mode: "signal_event",
    event_id: "sig_1",
    date_utc: "2026-06-01",
    evidence_window: {
      start: "2026-06-01T01:00:00.000Z",
      end: "2026-06-01T02:00:00.000Z",
      duration_min: 60,
    },
    event_strength_score: 80,
    chart_context: {
      chart_context_score: 70,
    },
  };
  const dailyPayload = {
    mode: "daily_overview",
    date_utc: "2026-06-01",
    day_start: "2026-06-01T00:00:00.000Z",
    day_end: "2026-06-01T23:59:59.999Z",
    market_tone: "mixed",
  };

  await writeJson(signalPayloadPath, {
    items: [
      signalPayload,
      {
        mode: "market_story",
        id: "story_should_not_validate",
      },
    ],
  });
  await writeJson(dailyPayloadPath, {
    items: [
      dailyPayload,
      {
        item_type: "market_story",
        id: "story_should_not_validate_daily",
      },
    ],
  });
  await writeFile(signalPromptPath, "Signal prompt Focused Cause Likely Cause Market Backdrop No Clear Cause Claude Limited Focused catalyst source Likely cause source Backdrop source Price check source");
  await writeFile(dailyPromptPath, "Daily prompt Daily Context Quiet Day Mixed Day Volatile Day Risk-on Day Risk-off Day No Major Driver Claude Limited. Do not use Focused Cause or Likely Cause as the main label.");

  return {
    root,
    signalPayloadPath,
    dailyPayloadPath,
    signalPromptPath,
    dailyPromptPath,
    outputDir,
    cacheDir,
  };
}

function options(base, overrides = {}) {
  return {
    mode: "all",
    dryRun: true,
    live: false,
    limit: 0,
    ids: [],
    resume: false,
    force: false,
    maxSearchesSignal: 3,
    maxSearchesDaily: 3,
    signalPayloadPath: base.signalPayloadPath,
    dailyPayloadPath: base.dailyPayloadPath,
    signalPromptPath: base.signalPromptPath,
    dailyPromptPath: base.dailyPromptPath,
    signalInputPath: path.join(base.root, "inputs", "signal_events.json"),
    dailyInputPath: path.join(base.root, "inputs", "daily_overviews.json"),
    outputDir: base.outputDir,
    cacheDir: base.cacheDir,
    ...overrides,
  };
}

test("default runner mode is dry-run", () => {
  const parsed = parseArgs([]);
  assert.equal(parsed.dryRun, true);
  assert.equal(parsed.live, false);
  assert.equal(parsed.mode, "all");
});

test("dry-run does not call Claude", async () => {
  const base = await fixture();
  let called = false;
  const result = await runClaudeValidation(options(base), {
    fetcher: async () => {
      called = true;
      throw new Error("network should not run");
    },
    logger: { log() {} },
  });

  assert.equal(called, false);
  assert.equal(result.mode, "dry-run");
  assert.equal(result.selected.signal.length, 1);
  assert.equal(result.selected.daily.length, 1);
});

test("live mode requires API key before calling Claude", async () => {
  const base = await fixture();
  let called = false;

  await assert.rejects(
    () =>
      runClaudeValidation(options(base, { dryRun: false, live: true }), {
        env: {},
        fetcher: async () => {
          called = true;
          throw new Error("network should not run");
        },
        logger: { log() {} },
      }),
    /ANTHROPIC_API_KEY/,
  );
  assert.equal(called, false);
});

test("Market Story payloads are excluded from validation inputs", async () => {
  const base = await fixture();
  const inputs = await loadValidationInputs(base);

  assert.equal(inputs.signalItems.length, 1);
  assert.equal(inputs.dailyItems.length, 1);
  assert.equal(inputs.excludedMarketStories.length, 2);
});

test("prompt constants expose required validation labels and tags", () => {
  assert.ok(SIGNAL_CLASSIFICATIONS.includes("Focused Cause"));
  assert.ok(SIGNAL_CLASSIFICATIONS.includes("No Clear Cause"));
  assert.ok(SIGNAL_SOURCE_TAGS.includes("Focused catalyst source"));
  assert.ok(SIGNAL_SOURCE_TAGS.includes("Price check source"));
  assert.ok(DAILY_LABELS.includes("Daily Context"));
  assert.ok(DAILY_LABELS.includes("No Major Driver"));
  assert.equal(DAILY_LABELS.includes("Focused Cause"), false);
  assert.equal(DAILY_LABELS.includes("Likely Cause"), false);
});

test("source validation rejects root URLs and accepts article URLs", () => {
  const rootOnly = validateSources([
    {
      title: "Publisher homepage",
      publisher: "Example",
      url: "https://example.com",
      published_at: "2026-06-01",
      tag: "Backdrop source",
    },
  ]);
  const article = validateSources([
    {
      title: "Market context article",
      publisher: "Example",
      url: "https://example.com/markets/crypto-context-2026-06-01",
      published_at: "2026-06-01",
      tag: "Backdrop source",
    },
  ]);

  assert.equal(rootOnly.accepted.length, 0);
  assert.equal(rootOnly.rejected[0].reason, "root_or_homepage_url");
  assert.equal(article.accepted.length, 1);
  assert.equal(article.accepted[0].url, "https://example.com/markets/crypto-context-2026-06-01");
});

test("cached live item is skipped unless force is provided", async () => {
  const base = await fixture();
  const cachePath = path.join(base.cacheDir, "signal", "sig_1.json");
  await writeJson(cachePath, {
    mode: "signal",
    item_id: "sig_1",
    generated_at: "2026-06-20T00:00:00.000Z",
    cached: false,
    searches_used: 1,
    result: {
      mode: "signal_event",
      item_id: "sig_1",
      classification: "No Clear Cause",
      sources: [],
      validation_flags: {},
      detector_feedback: {
        event_quality: "keep",
      },
    },
  });
  let called = false;
  const logs = [];
  const result = await runClaudeValidation(
    options(base, {
      mode: "signal",
      dryRun: false,
      live: true,
    }),
    {
      env: { ANTHROPIC_API_KEY: "local-validation-test-key" },
      fetcher: async () => {
        called = true;
        throw new Error("network should not run");
      },
      logger: { log: (line) => logs.push(line) },
    },
  );
  const output = JSON.parse(
    await readFile(path.join(base.outputDir, "signal_validation_results.json"), "utf8"),
  );

  assert.equal(called, false);
  assert.equal(result.mode, "live");
  assert.equal(output.items[0].cached, true);
  assert.equal(logs.join("\n").includes("local-validation-test-key"), false);
});
