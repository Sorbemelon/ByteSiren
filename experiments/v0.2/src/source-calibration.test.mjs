import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runSourceCalibration } from "./source-calibrate-detector.mjs";

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

test("source-calibration analysis can run against accepted structural defaults", async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "bytesiren-source-cal-"));
  const options = {
    eventsPath: "experiments/v0.2/outputs/vnext_structural_events.json",
    sourceAuditPath: "experiments/v0.2/outputs/catalyst_source_audit.json",
    candlesPath: "experiments/v0.2/data/candles_30d.json",
    maxLeadMin: 360,
    responseOutputPath: path.join(outputDir, "response.json"),
    responseMarkdownPath: path.join(outputDir, "response.md"),
    eventsOutputPath: path.join(outputDir, "events.json"),
    summaryOutputPath: path.join(outputDir, "summary.json"),
    gateOutputPath: path.join(outputDir, "gate.json"),
    comparisonMarkdownPath: path.join(outputDir, "comparison.md"),
  };

  await runSourceCalibration(options, { logger: { log() {} } });

  const summary = await readJson(options.summaryOutputPath);
  const gate = await readJson(options.gateOutputPath);
  const response = await readJson(options.responseOutputPath);
  const tuned = await readJson(options.eventsOutputPath);
  const rowsById = new Map(gate.decisions.map((row) => [row.event_id, row]));

  assert.equal(summary.source_lead_window_min, 360);
  assert.equal(summary.previous_public_signal_count, 25);
  assert.equal(summary.publish_candidate_count, 26);
  assert.equal(summary.promoted_from_audit_count, 1);
  assert.equal(summary.demoted_from_public_count, 0);
  assert.equal(summary.matched_event_count, 7);
  assert.deepEqual(summary.promoted_event_ids, [
    "vnext_c_4bd82831_20260602t0815",
  ]);

  const promoted = rowsById.get("vnext_c_4bd82831_20260602t0815");
  assert.equal(promoted.publish_candidate, true);
  assert.equal(
    promoted.publish_reason,
    "source_calibrated_multibar_chart_response",
  );
  assert.ok(promoted.source_calibration.best_aligned_response_pct >= 0.35);

  const structuralPublic = rowsById.get(
    "vnext_structural_merged_20260601060000_down",
  );
  assert.equal(structuralPublic.publish_candidate, true);
  assert.equal(structuralPublic.source_tuned_reason, "already_public_under_vnext_c");
  assert.ok(structuralPublic.source_calibration.best_aligned_response_pct >= 0.35);

  assert.equal(response.max_lead_min, 360);
  assert.equal(response.events.length, summary.matched_event_count);
  assert.ok(
    response.events.every((event) =>
      event.source_calibration.source_responses.every(
        (source) =>
          source.horizons["60m"] &&
          source.horizons["180m"] &&
          source.horizons["360m"] &&
          source.horizons["720m"],
      ),
    ),
  );
  assert.equal(tuned.detector, "vnext_c_source_tuned");
});
