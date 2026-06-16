import {
  CLAUDE_ENRICHMENT_CRON,
  CLEANUP_CRON,
  POLL_MARKET_CRON,
} from "./config.ts";
import { cleanupOldData } from "./jobs/cleanupOldData.ts";
import { enrichQueuedIncidents } from "./jobs/enrichQueuedIncidents.ts";
import { pollMarket } from "./jobs/pollMarket.ts";
import { runDetector } from "./jobs/runDetector.ts";
import { healthResponse, versionResponse } from "./routes/health.ts";
import { intelligenceFeedResponse } from "./routes/intelligence.ts";
import {
  latestMarketResponse,
  marketCandlesResponse,
} from "./routes/market.ts";
import type { Env } from "./types/env.ts";
import {
  jsonError,
  methodNotAllowed,
  notFound,
  safeErrorMessage,
} from "./utils/http.ts";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== "GET") {
      return methodNotAllowed();
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
      return healthResponse();
    }

    if (request.method === "GET" && url.pathname === "/api/version") {
      return versionResponse(env);
    }

    try {
      if (url.pathname === "/api/market/latest") {
        return await latestMarketResponse(env.DB);
      }

      if (url.pathname === "/api/market/candles") {
        return await marketCandlesResponse(request, env.DB);
      }

      if (url.pathname === "/api/intelligence/feed") {
        return await intelligenceFeedResponse(env.DB);
      }
    } catch (error) {
      return jsonError(500, "internal_error", safeErrorMessage(error));
    }

    return notFound();
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    if (controller.cron === POLL_MARKET_CRON) {
      await pollMarket(env.DB);
      await runDetector(env.DB);
      return;
    }

    if (controller.cron === CLEANUP_CRON) {
      await cleanupOldData(env.DB);
      return;
    }

    if (controller.cron === CLAUDE_ENRICHMENT_CRON) {
      await enrichQueuedIncidents(env.DB, env);
    }
  },
} satisfies ExportedHandler<Env>;
