import { VISIBLE_RANGE_DAYS, MARKET_INTERVAL } from "../config.ts";
import {
  getRecentIncidentsForFeed,
  type FeedResponseBody,
} from "../db/incidentRepository.ts";
import { json } from "../utils/http.ts";

export async function intelligenceFeedResponse(
  db: D1Database,
): Promise<Response> {
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
