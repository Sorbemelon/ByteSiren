import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runAuditSourceRecheck } from "./recheck-audit-sources.mjs";

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

test("audit source recheck finds current source-backed review candidates", async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "bytesiren-audit-src-"));
  const options = {
    eventsPath: "experiments/v0.2/outputs/vnext_c_events.json",
    sourceAuditPath: "experiments/v0.2/outputs/catalyst_source_audit.json",
    candlesPath: "experiments/v0.2/data/candles_30d.json",
    maxLeadMin: 360,
    jsonOutputPath: path.join(outputDir, "audit-source-recheck.json"),
    markdownOutputPath: path.join(outputDir, "audit-source-recheck.md"),
  };

  await runAuditSourceRecheck(options, { logger: { log() {} } });
  const payload = await readJson(options.jsonOutputPath);
  const candidates = payload.items.filter((item) =>
    item.recheck_assessment.includes("public_review_candidate"),
  );
  const candidateIds = candidates.map((item) => item.event_id).sort();

  assert.equal(payload.summary.audit_event_count, 18);
  assert.equal(payload.summary.accepted_source_matched_event_count, 3);
  assert.equal(payload.summary.public_review_candidate_count, 3);
  assert.deepEqual(candidateIds, [
    "vnext_c_0118579a_20260601t1515",
    "vnext_c_a1f7b080_20260613t2130",
    "vnext_c_e639b7ad_20260607t2200",
  ].sort());

  for (const candidate of candidates) {
    assert.ok(candidate.accepted_source_count_within_6h > 0);
    assert.ok(candidate.best_accepted_source);
    assert.ok(
      candidate.best_accepted_source.response_metrics
        .event_window_aligned_move_pct >= 0.45,
    );
  }
});
