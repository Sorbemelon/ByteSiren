import { recordJobRun } from "../db/marketRepository.ts";
import {
  dispatchMarketIngestWorkflow,
  type GitHubDispatchOptions,
  type GitHubDispatchResult,
} from "../services/githubDispatch.ts";
import type { Env } from "../types/env.ts";
import type { JobRunStatus } from "../types/market.ts";
import { safeErrorMessage } from "../utils/http.ts";

export interface DispatchGitHubIngestJobResult extends GitHubDispatchResult {
  job_status: JobRunStatus;
}

function jobStatusFor(result: GitHubDispatchResult): JobRunStatus {
  if (result.outcome === "success") {
    return "success";
  }

  if (result.outcome === "skipped") {
    return "skipped";
  }

  return "failed";
}

function metadataFor(result: GitHubDispatchResult): Record<string, unknown> {
  return {
    status: result.status,
    workflow: result.workflow,
    ref: result.ref,
    hours: result.inputs_summary.hours,
    symbols: result.inputs_summary.symbols,
    dry_run: result.inputs_summary.dry_run,
    ...(result.error_summary ? { error_summary: result.error_summary } : {}),
  };
}

export async function dispatchGitHubIngest(
  db: D1Database,
  env: Env,
  options: GitHubDispatchOptions = {},
): Promise<DispatchGitHubIngestJobResult> {
  const startedAt = new Date();

  try {
    const result = await dispatchMarketIngestWorkflow(env, options);
    const jobStatus = jobStatusFor(result);

    await recordJobRun(
      db,
      "github_ingest_dispatch",
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
    const message = `GitHub ingest dispatch failed: ${safeErrorMessage(error)}`;

    await recordJobRun(
      db,
      "github_ingest_dispatch",
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
      workflow: "market-ingest.yml",
      ref: "main",
      inputs_summary: {
        hours: "6",
        symbols: [],
        dry_run: "false",
      },
      job_status: "failed",
    };
  }
}
