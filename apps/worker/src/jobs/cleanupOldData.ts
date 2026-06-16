import {
  cleanupOldData as cleanupOldMarketData,
  recordJobRun,
  retentionCutoffIso,
} from "../db/marketRepository.ts";
import { cleanupDetectorDataOlderThan31Days } from "../db/detectorRepository.ts";
import { safeErrorMessage } from "../utils/http.ts";

export interface CleanupOldDataResult {
  status: "success" | "failed";
  message: string;
  cutoff_iso: string;
  deleted: {
    market_candles: number;
    market_features: number;
    raw_signal_events: number;
    incidents: number;
  };
}

export async function cleanupOldData(
  db: D1Database,
  now = new Date(),
): Promise<CleanupOldDataResult> {
  const startedAt = new Date();
  const cutoffIso = retentionCutoffIso(now);

  try {
    const marketDeleted = await cleanupOldMarketData(db, cutoffIso);
    const detectorDeleted = await cleanupDetectorDataOlderThan31Days(
      db,
      cutoffIso,
    );
    const deleted = {
      market_candles: marketDeleted.market_candles,
      market_features:
        marketDeleted.market_features + detectorDeleted.market_features,
      raw_signal_events: detectorDeleted.raw_signal_events,
      incidents: detectorDeleted.incidents,
    };
    const message = `Cleanup completed for records older than ${cutoffIso}.`;

    await recordJobRun(
      db,
      "cleanup_old_data",
      "success",
      message,
      {
        cutoff_iso: cutoffIso,
        deleted,
      },
      startedAt,
      new Date(),
    );

    return {
      status: "success",
      message,
      cutoff_iso: cutoffIso,
      deleted,
    };
  } catch (error) {
    const message = `Cleanup failed: ${safeErrorMessage(error)}`;

    await recordJobRun(
      db,
      "cleanup_old_data",
      "failed",
      message,
      {
        cutoff_iso: cutoffIso,
      },
      startedAt,
      new Date(),
    );

    return {
      status: "failed",
      message,
      cutoff_iso: cutoffIso,
      deleted: {
        market_candles: 0,
        market_features: 0,
        raw_signal_events: 0,
        incidents: 0,
      },
    };
  }
}
