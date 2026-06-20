#!/usr/bin/env node

// Variant smoke for the pattern_tuned chart-preview bundle (chart-preview/
// data-pattern-tuned). Validates structure + the variant-specific expectations
// (25 public / 16 audit, the two continuation promotions, recomputed source
// markers). It deliberately omits the base June 1-2 audit-membership assertions,
// which legitimately differ once 06-02 02:15 flips public in the variant.

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
const DATA_DIR = path.join(CHART_PREVIEW_DIR, "data-pattern-tuned");

const EXPECTED = {
  dayGroups: 31,
  dailyOverviews: 31,
  publicSignals: 25,
  // 16 base audit + 8 retained broad-shock one-bar detections.
  auditEvents: 24,
  catalystCandidates: 96,
  catalystSourceAuditRows: 175,
  catalystSourceAuditUniqueUrls: 102,
  continuationEvents: 2,
  continuationDates: ["2026-06-02", "2026-06-10"],
  detectorVersion: "vnext_c_pattern_tuned",
};
const CONTINUATION_REASON = "multibar_strong_context_continuation";

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
    `missing variant preview bundle: ${generatedPath} (run build-pattern-tuned-preview.mjs)`,
  );
  const source = await readFile(generatedPath, "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context, { timeout: 5000 });
  const payload =
    context.window.__BYTESIREN_V02_PREVIEW__ ??
    context.window.BYTESIREN_PREVIEW_DATA;
  assert.ok(payload, "variant bundle did not assign preview data");
  return payload;
}

function contractItems(feedContract) {
  return feedContract.day_groups.flatMap((group) => group.items);
}

function uniqueSourceMarkerUrls(sourceAudit) {
  const urls = new Set();
  for (const row of sourceAudit.rows ?? []) {
    if (
      row.source?.url &&
      ["keep", "conditional_keep"].includes(row.context_decision) &&
      (row.public_signal_timing?.catalyst_candidate_within_12h ||
        row.all_detected_timing?.catalyst_candidate_within_12h)
    ) {
      urls.add(row.source.url);
    }
  }
  return urls;
}

async function run() {
  // Variant HTML must point at the variant data dir.
  const variantHtml = await readFile(
    path.join(CHART_PREVIEW_DIR, "index.pattern-tuned.html"),
    "utf8",
  );
  assert.ok(
    variantHtml.includes("./data-pattern-tuned/preview-data.generated.js"),
    "index.pattern-tuned.html must load the variant data bundle",
  );

  const {
    feedContract,
    groupedPreview,
    auditEvents,
    catalysts,
    catalystSourceAudit,
  } = await loadBundle();

  // Detector label is the variant.
  assert.equal(feedContract.detector_version, EXPECTED.detectorVersion);
  assert.equal(groupedPreview.detector_version, EXPECTED.detectorVersion);
  assert.equal(feedContract.chart_context_enabled, true);

  // Structure unchanged.
  assert.equal(feedContract.day_groups.length, EXPECTED.dayGroups);
  assert.equal(
    groupedPreview.public_preview.day_posts.length,
    EXPECTED.dayGroups,
  );

  const items = contractItems(feedContract);
  const signals = items.filter((item) => item.item_type === "signal_event");
  const overviews = items.filter((item) => item.item_type === "daily_overview");
  assert.equal(overviews.length, EXPECTED.dailyOverviews);

  // Variant counts.
  assert.equal(
    feedContract.preview_diagnostics.public_signal_count,
    EXPECTED.publicSignals,
  );
  assert.equal(
    feedContract.preview_diagnostics.audit_event_count,
    EXPECTED.auditEvents,
  );
  assert.equal(signals.length, EXPECTED.publicSignals);
  assert.equal(auditEvents.count, EXPECTED.auditEvents);

  // The two multibar continuation promotions are public, by the new reason.
  const continuation = signals.filter(
    (item) => (item.publish_gate?.reasons ?? [])[0] === CONTINUATION_REASON,
  );
  assert.equal(
    continuation.length,
    EXPECTED.continuationEvents,
    `expected ${EXPECTED.continuationEvents} ${CONTINUATION_REASON} public signals`,
  );
  // Array.from brings the vm-realm array into the main realm for deepEqual.
  assert.deepEqual(
    Array.from(continuation, (item) => item.date_utc).sort(),
    EXPECTED.continuationDates,
  );

  // Sources preserved + recomputed markers present.
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
  const markerUrls = uniqueSourceMarkerUrls(catalystSourceAudit);
  assert.ok(
    markerUrls.size > 0,
    "variant source audit must expose keep/conditional source markers",
  );

  // The recompute must reflect the variant scope: the two flipped events now map
  // to public-signal-scope catalyst rows (no longer audit-only / after-signal).
  const flippedPublicRows = (catalystSourceAudit.rows ?? []).filter((row) => {
    const start = row.public_signal_timing?.nearest_signal?.signal_start ?? "";
    return (
      typeof start === "string" &&
      (start.startsWith("2026-06-02") || start.startsWith("2026-06-10"))
    );
  });
  assert.ok(
    flippedPublicRows.length > 0,
    "06-02 / 06-10 should appear under public-signal timing scope after recompute",
  );

  console.log(
    JSON.stringify(
      {
        result: "PASS",
        detector_version: feedContract.detector_version,
        public_signal_events: signals.length,
        audit_events: auditEvents.count,
        continuation_promotions: continuation.map((i) => i.date_utc),
        source_markers_keep_conditional: markerUrls.size,
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
