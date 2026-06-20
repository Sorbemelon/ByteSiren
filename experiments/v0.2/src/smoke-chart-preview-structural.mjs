#!/usr/bin/env node

// Variant smoke for the structural chart-preview bundle (chart-preview/
// data-structural). Validates structure + structural-detector expectations.
// Market Story assertions are intentionally omitted (that layer is untouched and
// its membership legitimately differs with a different signal set).

import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const EXPERIMENT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const CHART_PREVIEW_DIR = path.join(EXPERIMENT_ROOT, "chart-preview");
const DATA_DIR = path.join(CHART_PREVIEW_DIR, "data-structural");

const STRUCTURAL_PATTERNS = new Set([
  "breakout_hold",
  "failed_breakout_reversal",
  "continuation_flag",
  "compression_expansion_break",
]);

const EXPECTED = {
  dayGroups: 31,
  dailyOverviews: 31,
  detectorVersion: "vnext_structural",
  catalystCandidates: 96,
  catalystSourceAuditRows: 175,
  catalystSourceAuditUniqueUrls: 102,
};

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadBundle() {
  const generatedPath = path.join(DATA_DIR, "preview-data.generated.js");
  assert.ok(
    await exists(generatedPath),
    `missing structural bundle: ${generatedPath} (run build-structural-preview.mjs)`,
  );
  const source = await readFile(generatedPath, "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context, { timeout: 5000 });
  const payload =
    context.window.__BYTESIREN_V02_PREVIEW__ ??
    context.window.BYTESIREN_PREVIEW_DATA;
  assert.ok(payload, "structural bundle did not assign preview data");
  return payload;
}

function contractItems(feedContract) {
  return feedContract.day_groups.flatMap((group) => group.items);
}

async function run() {
  const variantHtml = await readFile(
    path.join(CHART_PREVIEW_DIR, "index.structural.html"),
    "utf8",
  );
  assert.ok(
    variantHtml.includes("./data-structural/preview-data.generated.js"),
    "index.structural.html must load the structural data bundle",
  );

  const { feedContract, groupedPreview, auditEvents, catalysts, catalystSourceAudit } =
    await loadBundle();

  assert.equal(feedContract.detector_version, EXPECTED.detectorVersion);
  assert.equal(groupedPreview.detector_version, EXPECTED.detectorVersion);
  assert.equal(feedContract.chart_context_enabled, true);
  assert.equal(feedContract.day_groups.length, EXPECTED.dayGroups);
  assert.equal(
    groupedPreview.public_preview.day_posts.length,
    EXPECTED.dayGroups,
  );

  const items = contractItems(feedContract);
  const signals = items.filter((item) => item.item_type === "signal_event");
  const overviews = items.filter((item) => item.item_type === "daily_overview");
  assert.equal(overviews.length, EXPECTED.dailyOverviews);

  // Public signal count is detector-derived; assert internal consistency + >0.
  assert.equal(signals.length, feedContract.preview_diagnostics.public_signal_count);
  assert.ok(signals.length > 0);
  assert.equal(
    auditEvents.count,
    feedContract.preview_diagnostics.audit_event_count,
  );

  // Every public signal card is a recognized structural pattern (2+ bars) with
  // progressive-lifecycle metadata.
  for (const signal of signals) {
    assert.ok(
      STRUCTURAL_PATTERNS.has(signal.structural_pattern),
      `${signal.id} missing/invalid structural_pattern: ${signal.structural_pattern}`,
    );
    assert.ok(
      Number(signal.evidence_bar_count) >= 2,
      `${signal.id} is not multi-bar`,
    );
    assert.ok(signal.initial_detected_at, `${signal.id} missing initial_detected_at`);
    assert.equal(typeof signal.update_count, "number");
  }
  // The lifecycle is visible: some public signals updated over time.
  assert.ok(
    signals.some((s) => s.update_count > 0),
    "no updated (multi-detection) public signals on cards",
  );
  // Stage 2 public-only wide merge is visible on cards.
  const mergedPublic = signals.filter((s) => s.merged_public);
  assert.ok(mergedPublic.length > 0, "no merged_public signals on cards");
  for (const signal of mergedPublic) {
    assert.ok(
      Number(signal.public_merge_member_count) >= 2,
      `${signal.id} merged_public without >=2 members`,
    );
  }

  // Sources preserved + recomputed against the structural set.
  assert.equal(catalysts.items.length, EXPECTED.catalystCandidates);
  assert.equal(
    catalystSourceAudit.rows?.length,
    EXPECTED.catalystSourceAuditRows,
  );
  assert.equal(
    new Set(
      (catalystSourceAudit.rows ?? [])
        .map((row) => row.source?.url)
        .filter(Boolean),
    ).size,
    EXPECTED.catalystSourceAuditUniqueUrls,
  );

  const patternCounts = signals.reduce((acc, s) => {
    acc[s.structural_pattern] = (acc[s.structural_pattern] ?? 0) + 1;
    return acc;
  }, {});

  console.log(
    JSON.stringify(
      {
        result: "PASS",
        detector_version: feedContract.detector_version,
        public_signal_events: signals.length,
        audit_events: auditEvents.count,
        structural_pattern_counts: patternCounts,
        catalyst_candidates: catalysts.items.length,
      },
      null,
      2,
    ),
  );
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
