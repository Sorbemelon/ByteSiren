import { recordJobRun } from "../db/marketRepository.ts";
import {
  dispatchV02SnapshotRefreshWorkflow,
  type V02RefreshDispatchOptions,
  type V02RefreshDispatchResult,
} from "../services/githubDispatch.ts";
import type { Env } from "../types/env.ts";
import type { JobRunStatus } from "../types/market.ts";
import { safeErrorMessage } from "../utils/http.ts";

export interface DispatchV02SnapshotRefreshJobResult extends V02RefreshDispatchResult {
  job_status: JobRunStatus;
}

function jobStatusFor(result: V02RefreshDispatchResult): JobRunStatus {
  if (result.outcome === "success") {
    return "success";
  }

  if (result.outcome === "skipped") {
    return "skipped";
  }

  return "failed";
}

function metadataFor(
  result: V02RefreshDispatchResult,
): Record<string, unknown> {
  return {
    status: result.status,
    dispatch_status: result.dispatch_status,
    workflow: result.workflow,
    repo: result.repo,
    ref: result.ref,
    inputs: result.inputs_summary,
    dispatch_attempted: result.dispatch_attempted,
    duplicate_check_status: result.duplicate_check_status,
    ...(result.active_run ? { active_run: result.active_run } : {}),
    ...(result.error_summary ? { error_summary: result.error_summary } : {}),
  };
}

export async function dispatchV02SnapshotRefresh(
  db: D1Database,
  env: Env,
  options: V02RefreshDispatchOptions = {},
): Promise<DispatchV02SnapshotRefreshJobResult> {
  const startedAt = new Date();

  try {
    const result = await dispatchV02SnapshotRefreshWorkflow(env, options);
    const jobStatus = jobStatusFor(result);

    await recordJobRun(
      db,
      "v02_snapshot_refresh_dispatch",
      jobStatus,
      result.message,
      metadataFor(result),
      startedAt,
      new Date(),
    );

    return {
      ...result,
      job_status: jobStatus,
    };
  } catch (error) {
    const message = `v0.2 refresh workflow dispatch failed: ${safeErrorMessage(
      error,
    )}`;

    await recordJobRun(
      db,
      "v02_snapshot_refresh_dispatch",
      "failed",
      message,
      {},
      startedAt,
      new Date(),
    );

    return {
      ok: false,
      outcome: "failed",
      status: null,
      message,
      dispatch_status: "failed_dispatch",
      workflow: "v02-snapshot-refresh.yml",
      repo: "Sorbemelon/ByteSiren",
      ref: "main",
      inputs_summary: {
        trigger_source: "cloudflare_cron",
        refresh_mode: "scheduled",
        requested_at: startedAt.toISOString(),
        idempotency_key: `v02-refresh-${startedAt.toISOString().slice(0, 10)}`,
        dry_run: "false",
        confirm_live: "true",
      },
      dispatch_attempted: false,
      duplicate_check_status: null,
      token_present: false,
      job_status: "failed",
    };
  }
}
