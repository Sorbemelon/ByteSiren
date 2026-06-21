import {
  VISIBLE_RANGE_DAYS,
  MARKET_INTERVAL,
  parseFeedVersion,
} from "../config.ts";
import { getIntelligenceFeedV02 } from "../db/feedRepositoryV02.ts";
import {
  getRecentIncidentsForFeed,
  type FeedResponseBody,
} from "../db/incidentRepository.ts";
import type { Env } from "../types/env.ts";
import { json } from "../utils/http.ts";

export async function intelligenceFeedResponse(
  db: D1Database,
  env: Pick<Env, "FEED_VERSION"> = {},
): Promise<Response> {
  if (parseFeedVersion(env.FEED_VERSION) === "v02") {
    return json(
      (await getIntelligenceFeedV02(db)) as unknown as Record<string, unknown>,
      {
        headers: {
          "cache-control": "public, max-age=60",
        },
      },
    );
  }

  const items = await getRecentIncidentsForFeed(db);
  const body: FeedResponseBody = {
    ok: true,
    updated_at: new Date().toISOString(),
    range_days: VISIBLE_RANGE_DAYS,
    signal_window: MARKET_INTERVAL,
    baseline_window: "24h",
    items,
  };

  return json(body as unknown as Record<string, unknown>, {
    headers: {
      "cache-control": "public, max-age=60",
    },
  });
}
