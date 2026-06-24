import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryD1 } from "../test/d1Memory.ts";
import {
  claimClaudeBriefV02Target,
  getClaudeBriefV02ByTarget,
  isSelectableClaudeBriefV02,
  listAcceptedSourceReferencesV02ByTarget,
  listClaudeBriefsV02ByStatus,
  updateClaudeBriefV02Status,
  upsertClaudeBriefV02,
  upsertSourceReferencesV02,
} from "./claudeRepositoryV02.ts";

const articleUrl = "https://www.reuters.com/markets/2026/06/19/crypto-context/";

test("claude_briefs_v02 repository upserts Signal and Daily targets only", async () => {
  const { db, tables } = createMemoryD1();
  const signal = await upsertClaudeBriefV02(db, {
    target_type: "signal_event_v02",
    target_id: "sig_public",
    prompt_mode: "signal_event",
    status: "brief_ready",
    public_label: "Likely Cause",
    classification: "Likely Cause",
    confidence: "medium",
    headline: "Signal context",
    collapsed_summary: "Short signal context.",
    context_details: "Longer context.",
    source_support: "medium",
    source_timing_alignment: "same_day",
    validation_flags: { has_likely_source: true },
    detector_feedback: { event_quality: "keep" },
    prompt_version: "v02-test",
    model: "claude-test",
    created_at: "2026-06-19T15:00:00.000Z",
    updated_at: "2026-06-19T15:00:00.000Z",
  });
  const daily = await upsertClaudeBriefV02(db, {
    target_type: "daily_overview_v02",
    target_id: "daily_2026-06-19",
    prompt_mode: "daily_overview",
    status: "brief_ready",
    public_label: null,
    classification: null,
    confidence: "medium",
    headline: "Daily context",
    collapsed_summary: "Short daily context.",
    context_details: "Longer daily context.",
    source_support: "medium",
    source_timing_alignment: "same_day",
  });

  assert.equal(signal.target_type, "signal_event_v02");
  assert.equal(daily.prompt_mode, "daily_overview");
  assert.equal(tables.claude_briefs_v02.length, 2);
  assert.equal(tables.claude_briefs.length, 0);
  assert.equal(
    (
      await getClaudeBriefV02ByTarget(
        db,
        "signal_event_v02",
        "sig_public",
        "signal_event",
      )
    )?.public_label,
    "Likely Cause",
  );
  await assert.rejects(() =>
    upsertClaudeBriefV02(db, {
      target_type: "market_story_v02" as never,
      target_id: "story_public",
      prompt_mode: "signal_event",
    }),
  );
  await assert.rejects(() =>
    upsertClaudeBriefV02(db, {
      target_type: "signal_event_v02",
      target_id: "sig_public",
      prompt_mode: "daily_overview",
    }),
  );
});

test("claude_briefs_v02 repository lists and updates status", async () => {
  const { db } = createMemoryD1();
  const brief = await upsertClaudeBriefV02(db, {
    target_type: "signal_event_v02",
    target_id: "sig_public",
    prompt_mode: "signal_event",
    status: "queued_for_analysis",
  });

  assert.equal(
    (await listClaudeBriefsV02ByStatus(db, "queued_for_analysis")).length,
    1,
  );
  await updateClaudeBriefV02Status(db, brief.id, {
    status: "analysis_limited",
    error_code: "source_timeout",
    error_message: "No source result in fixture.",
    updated_at: "2026-06-19T15:30:00.000Z",
  });

  const updated = await getClaudeBriefV02ByTarget(
    db,
    "signal_event_v02",
    "sig_public",
    "signal_event",
  );
  assert.equal(updated?.status, "analysis_limited");
  assert.equal(updated?.error_code, "source_timeout");
});

test("claude_briefs_v02 protects terminal rows from retryable overwrites", async () => {
  const { db } = createMemoryD1();
  await upsertClaudeBriefV02(db, {
    target_type: "signal_event_v02",
    target_id: "sig_terminal",
    prompt_mode: "signal_event",
    status: "no_clear_cause",
    public_label: "No Clear Cause",
    headline: "No source",
    collapsed_summary: "No clear source.",
    updated_at: "2026-06-19T15:00:00.000Z",
  });

  const blocked = await upsertClaudeBriefV02(db, {
    target_type: "signal_event_v02",
    target_id: "sig_terminal",
    prompt_mode: "signal_event",
    status: "failed_retryable",
    public_label: null,
    error_code: "validation_error",
    error_message: "late failure",
    updated_at: "2026-06-19T15:10:00.000Z",
  });

  assert.equal(blocked.status, "no_clear_cause");
  assert.equal(blocked.public_label, "No Clear Cause");
  assert.equal(blocked.error_code, null);

  const stored = await getClaudeBriefV02ByTarget(
    db,
    "signal_event_v02",
    "sig_terminal",
    "signal_event",
  );
  assert.equal(stored?.status, "no_clear_cause");
  assert.equal(stored?.updated_at, "2026-06-19T15:00:00.000Z");
});

test("claude_briefs_v02 protects strong terminal statuses from weaker later statuses", async () => {
  const { db } = createMemoryD1();
  await upsertClaudeBriefV02(db, {
    target_type: "signal_event_v02",
    target_id: "sig_ready",
    prompt_mode: "signal_event",
    status: "brief_ready",
    public_label: "Likely Cause",
    updated_at: "2026-06-19T15:00:00.000Z",
  });
  await upsertClaudeBriefV02(db, {
    target_type: "daily_overview_v02",
    target_id: "daily_context",
    prompt_mode: "daily_overview",
    status: "context_only",
    updated_at: "2026-06-19T15:00:00.000Z",
  });

  const ready = await upsertClaudeBriefV02(db, {
    target_type: "signal_event_v02",
    target_id: "sig_ready",
    prompt_mode: "signal_event",
    status: "failed_retryable",
    error_code: "late_failure",
    updated_at: "2026-06-19T15:10:00.000Z",
  });
  const context = await upsertClaudeBriefV02(db, {
    target_type: "daily_overview_v02",
    target_id: "daily_context",
    prompt_mode: "daily_overview",
    status: "claude_limited",
    error_code: "late_limit",
    updated_at: "2026-06-19T15:10:00.000Z",
  });

  assert.equal(ready.status, "brief_ready");
  assert.equal(ready.error_code, null);
  assert.equal(context.status, "context_only");
  assert.equal(context.error_code, null);
});

test("claude_briefs_v02 retryable statuses can update", async () => {
  const { db } = createMemoryD1();
  await upsertClaudeBriefV02(db, {
    target_type: "signal_event_v02",
    target_id: "sig_retry",
    prompt_mode: "signal_event",
    status: "queued_for_analysis",
  });

  const updated = await upsertClaudeBriefV02(db, {
    target_type: "signal_event_v02",
    target_id: "sig_retry",
    prompt_mode: "signal_event",
    status: "failed_retryable",
    error_code: "validation_error",
  });

  assert.equal(updated.status, "failed_retryable");
  assert.equal(updated.error_code, "validation_error");
});

test("claude_briefs_v02 force can explicitly overwrite terminal rows", async () => {
  const { db } = createMemoryD1();
  await upsertClaudeBriefV02(db, {
    target_type: "daily_overview_v02",
    target_id: "daily_terminal",
    prompt_mode: "daily_overview",
    status: "context_only",
    updated_at: "2026-06-19T15:00:00.000Z",
  });

  const forced = await upsertClaudeBriefV02(db, {
    target_type: "daily_overview_v02",
    target_id: "daily_terminal",
    prompt_mode: "daily_overview",
    status: "claude_limited",
    error_code: "manual_force",
    updated_at: "2026-06-19T15:10:00.000Z",
    force: true,
  });

  assert.equal(forced.status, "claude_limited");
  assert.equal(forced.error_code, "manual_force");
});

test("claude_briefs_v02 claim skips terminal and processing targets", async () => {
  const { db } = createMemoryD1();
  const first = await claimClaudeBriefV02Target(db, {
    target_type: "signal_event_v02",
    target_id: "sig_claim",
    prompt_mode: "signal_event",
    prompt_version: "v02-test",
    model: "claude-test",
    updated_at: "2026-06-19T15:00:00.000Z",
  });
  const second = await claimClaudeBriefV02Target(db, {
    target_type: "signal_event_v02",
    target_id: "sig_claim",
    prompt_mode: "signal_event",
    prompt_version: "v02-test",
    model: "claude-test",
    updated_at: "2026-06-19T15:01:00.000Z",
  });

  assert.equal(first.claimed, true);
  assert.equal(first.row.status, "processing");
  assert.equal(second.claimed, false);
  assert.equal(second.skipped_reason, "processing");
  assert.equal(isSelectableClaudeBriefV02(second.row), false);
});

test("claude_briefs_v02 claim force explicitly claims terminal target", async () => {
  const { db } = createMemoryD1();
  await upsertClaudeBriefV02(db, {
    target_type: "signal_event_v02",
    target_id: "sig_force_claim",
    prompt_mode: "signal_event",
    status: "no_clear_cause",
    updated_at: "2026-06-19T15:00:00.000Z",
  });

  const claim = await claimClaudeBriefV02Target(db, {
    target_type: "signal_event_v02",
    target_id: "sig_force_claim",
    prompt_mode: "signal_event",
    prompt_version: "v02-test",
    model: "claude-test",
    updated_at: "2026-06-19T15:10:00.000Z",
    force: true,
  });

  assert.equal(claim.claimed, true);
  assert.equal(claim.row.status, "processing");
});

test("source_references_v02 repository writes accepted and rejected v0.2 sources idempotently", async () => {
  const { db, tables } = createMemoryD1();
  const brief = await upsertClaudeBriefV02(db, {
    target_type: "signal_event_v02",
    target_id: "sig_public",
    prompt_mode: "signal_event",
    status: "brief_ready",
  });
  const sources = [
    {
      target_type: "signal_event_v02" as const,
      target_id: "sig_public",
      brief_id: brief.id,
      source_role: "Likely cause source" as const,
      source_strength: "medium",
      publisher: "Reuters",
      title: "Crypto context",
      url: articleUrl,
      published_at: "2026-06-19T14:20:00.000Z",
      used_for: "likely_cause",
      accepted: true as const,
      rejection_reason: null,
      metadata: { why_relevant: "Time aligned." },
    },
    {
      target_type: "signal_event_v02" as const,
      target_id: "sig_public",
      brief_id: brief.id,
      source_role: "Rejected source" as const,
      source_strength: null,
      publisher: "CoinDesk",
      title: "Homepage",
      url: "https://www.coindesk.com/",
      published_at: null,
      used_for: null,
      accepted: false as const,
      rejection_reason: "generic_homepage_url",
      metadata: {},
    },
  ];

  assert.equal(await upsertSourceReferencesV02(db, sources), 2);
  assert.equal(await upsertSourceReferencesV02(db, sources), 2);
  assert.equal(tables.source_references_v02.length, 2);
  assert.equal(tables.source_references.length, 0);

  const accepted = await listAcceptedSourceReferencesV02ByTarget(
    db,
    "signal_event_v02",
    "sig_public",
  );
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].url, articleUrl);
  assert.equal(accepted[0].brief_id, null);
  assert.equal(accepted[0].brief_v02_id, brief.id);
});

test("source_references_v02 rejects Market Story target", async () => {
  const { db } = createMemoryD1();

  await assert.rejects(() =>
    upsertSourceReferencesV02(db, [
      {
        target_type: "market_story_v02" as never,
        target_id: "story_public",
        brief_id: null,
        source_role: "Backdrop source",
        source_strength: null,
        publisher: "Reuters",
        title: "Story source should not be allowed",
        url: articleUrl,
        published_at: null,
        used_for: null,
        accepted: true,
        rejection_reason: null,
        metadata: {},
      },
    ]),
  );
});
