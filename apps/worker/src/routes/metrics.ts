import {
  getPublicViewMetrics,
  incrementPublicViewCount,
} from "../db/publicMetricsRepository.ts";
import { json } from "../utils/http.ts";

export async function viewMetricsResponse(db: D1Database): Promise<Response> {
  const metrics = await getPublicViewMetrics(db);
  return json({
    ok: true,
    ...metrics,
  });
}

export async function incrementViewMetricsResponse(
  db: D1Database,
): Promise<Response> {
  const metrics = await incrementPublicViewCount(db);
  return json({
    ok: true,
    ...metrics,
  });
}
