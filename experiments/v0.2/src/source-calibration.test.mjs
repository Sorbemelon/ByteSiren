import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runSourceCalibration } from "./source-calibrate-detector.mjs";

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

test("source-calibrated gate uses <=6h keep/conditional sources and post-source response", async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "bytesiren-source-cal-"));
  const options = {
    eventsPath: "experiments/v0.2/outputs/vnext_c_events.json",
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
  assert.equal(summary.previous_public_signal_count, 23);
  assert.equal(summary.publish_candidate_count, 24);
  assert.equal(summary.promoted_from_audit_count, 1);
  assert.deepEqual(summary.promoted_event_ids, [
    "vnext_c_e639b7ad_20260607t2200",
  ]);

  const promoted = rowsById.get("vnext_c_e639b7ad_20260607t2200");
  assert.equal(promoted.publish_candidate, true);
  assert.equal(
    promoted.publish_reason,
    "source_calibrated_one_bar_range_break_review",
  );
  assert.ok(promoted.source_calibration.best_aligned_response_pct >= 0.35);

  const weakResponseAudit = rowsById.get("vnext_c_0118579a_20260601t1515");
  assert.equal(weakResponseAudit.publish_candidate, false);
  assert.equal(
    weakResponseAudit.source_tuned_reason,
    "source_match_but_gate_requirements_not_met",
  );
  assert.ok(
    weakResponseAudit.source_calibration.best_aligned_response_pct < 0.35,
  );

  const modestOneBarAudit = rowsById.get("vnext_c_a1f7b080_20260613t2130");
  assert.equal(modestOneBarAudit.publish_candidate, false);
  assert.equal(
    modestOneBarAudit.source_tuned_reason,
    "source_match_but_one_bar_or_modest_response_kept_audit",
  );

  assert.equal(response.max_lead_min, 360);
  assert.ok(response.events.length >= 5);
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
