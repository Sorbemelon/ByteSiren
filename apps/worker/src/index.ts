import {
  CLAUDE_ENRICHMENT_CRON,
  CLEANUP_CRON,
  DETECTOR_CRON,
  GITHUB_INGEST_DISPATCH_CRON,
  LEGACY_POLL_MARKET_CRON,
  parseBooleanFlag,
} from "./config.ts";
import { cleanupOldData } from "./jobs/cleanupOldData.ts";
import { dispatchGitHubIngest } from "./jobs/dispatchGitHubIngest.ts";
import { enrichQueuedIncidents } from "./jobs/enrichQueuedIncidents.ts";
import { pollMarket } from "./jobs/pollMarket.ts";
import {
  isClaudeEnrichmentV02Enabled,
  runClaudeEnrichmentV02,
} from "./jobs/runClaudeEnrichmentV02.ts";
import {
  isDailyOverviewGenerationEnabled,
  isIncrementalDailyOverviewGenerationEnabled,
  runIncrementalDailyOverviewsV02,
  runDailyOverviewsV02,
} from "./jobs/runDailyOverviewsV02.ts";
import {
  isV02IncrementalRefreshEnabled,
  runIncrementalRefreshV02,
} from "./jobs/runIncrementalRefreshV02.ts";
import { runDetector } from "./jobs/runDetector.ts";
import { healthResponse, versionResponse } from "./routes/health.ts";
import { intelligenceFeedResponse } from "./routes/intelligence.ts";
import { ingestCandlesResponse } from "./routes/ingest.ts";
import {
  latestMarketResponse,
  marketCandlesResponse,
} from "./routes/market.ts";
import {
  incrementViewMetricsResponse,
  viewMetricsResponse,
} from "./routes/metrics.ts";
import { adminResponse } from "./routes/admin.ts";
import type { Env } from "./types/env.ts";
import {
  corsPreflightResponse,
  jsonError,
  methodNotAllowed,
  notFound,
  safeErrorMessage,
  withCors,
} from "./utils/http.ts";

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

function isAdminPath(pathname: string): boolean {
  return pathname.startsWith("/api/admin/");
}

function isIngestPath(pathname: string): boolean {
  return pathname.startsWith("/api/ingest/");
}

function isPrivateApiPath(pathname: string): boolean {
  return isAdminPath(pathname) || isIngestPath(pathname);
}

function isWorkerMarketFetchEnabled(env: Env): boolean {
  return env.MARKET_FETCH_MODE?.trim().toLowerCase() === "worker_fetch";
}

function areScheduledJobsEnabled(env: Env): boolean {
  return env.ENABLE_SCHEDULED_JOBS?.trim().toLowerCase() !== "false";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const respond = (response: Response): Response =>
      isApiPath(url.pathname) && !isPrivateApiPath(url.pathname)
        ? withCors(request, response, env)
        : response;

    if (isAdminPath(url.pathname)) {
      try {
        return await adminResponse(request, env);
      } catch (error) {
        return jsonError(500, "internal_error", safeErrorMessage(error));
      }
    }

    if (isIngestPath(url.pathname)) {
      try {
        return await ingestCandlesResponse(request, env);
      } catch (error) {
        return jsonError(500, "internal_error", safeErrorMessage(error));
      }
    }

    if (
      request.method === "OPTIONS" &&
      isApiPath(url.pathname) &&
      !isPrivateApiPath(url.pathname)
    ) {
      return corsPreflightResponse(request, env);
    }

    if (url.pathname === "/api/metrics/views") {
      try {
        if (request.method === "GET") {
          return respond(await viewMetricsResponse(env.DB));
        }

        if (request.method === "POST") {
          return respond(await incrementViewMetricsResponse(env.DB));
        }

        return respond(methodNotAllowed());
      } catch (error) {
        return respond(
          jsonError(500, "internal_error", safeErrorMessage(error)),
        );
      }
    }

    if (request.method !== "GET") {
      return respond(methodNotAllowed());
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
      return respond(healthResponse());
    }

    if (request.method === "GET" && url.pathname === "/api/version") {
      return respond(versionResponse(env));
    }

    try {
      if (url.pathname === "/api/market/latest") {
        return respond(await latestMarketResponse(env.DB));
      }

      if (url.pathname === "/api/market/candles") {
        return respond(await marketCandlesResponse(request, env.DB));
      }

      if (url.pathname === "/api/intelligence/feed") {
        return respond(await intelligenceFeedResponse(env.DB, env));
      }
    } catch (error) {
      return respond(jsonError(500, "internal_error", safeErrorMessage(error)));
    }

    return respond(notFound());
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    if (!areScheduledJobsEnabled(env)) {
      return;
    }

    if (controller.cron === GITHUB_INGEST_DISPATCH_CRON) {
      await dispatchGitHubIngest(env.DB, env);
      return;
    }

    if (controller.cron === DETECTOR_CRON) {
      if (isV02IncrementalRefreshEnabled(env)) {
        await runIncrementalRefreshV02(env.DB, env, {
          triggerSource: "cloudflare_cron",
          dispatchClaude: parseBooleanFlag(
            env.ENABLE_V02_SIGNAL_CLAUDE_WORKFLOW_DISPATCH,
          ),
        });
      }

      await runDetector(env.DB, { env });

      return;
    }

    if (controller.cron === LEGACY_POLL_MARKET_CRON) {
      if (isWorkerMarketFetchEnabled(env)) {
        await pollMarket(env.DB);
        await runDetector(env.DB, { env });
      }

      return;
    }

    if (controller.cron === CLEANUP_CRON) {
      await cleanupOldData(env.DB);

      if (isIncrementalDailyOverviewGenerationEnabled(env)) {
        await runIncrementalDailyOverviewsV02(env.DB, env, {
          requestId: crypto.randomUUID(),
          triggerSource: "cloudflare_cron_daily",
          dispatchClaude: parseBooleanFlag(
            env.ENABLE_V02_DAILY_CLAUDE_WORKFLOW_DISPATCH,
          ),
        });
      } else if (isDailyOverviewGenerationEnabled(env)) {
        await runDailyOverviewsV02(env.DB, env, {
          triggerSource: "cloudflare_cron_daily",
          dispatchClaude: parseBooleanFlag(
            env.ENABLE_V02_DAILY_CLAUDE_WORKFLOW_DISPATCH,
          ),
        });
      }

      return;
    }

    if (controller.cron === CLAUDE_ENRICHMENT_CRON) {
      if (isClaudeEnrichmentV02Enabled(env)) {
        await runClaudeEnrichmentV02(env.DB, env);
      } else {
        await enrichQueuedIncidents(env.DB, env);
      }
    }
  },
} satisfies ExportedHandler<Env>;
