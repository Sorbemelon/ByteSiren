import {
  cleanupOldData as cleanupOldMarketData,
  recordJobRun,
  retentionCutoffIso,
} from "../db/marketRepository.ts";
import { safeErrorMessage } from "../utils/http.ts";

export interface CleanupOldDataResult {
  status: "success" | "failed";
  message: string;
  cutoff_iso: string;
  deleted: {
    market_candles: number;
    market_features: number;
  };
}

export async function cleanupOldData(
  db: D1Database,
  now = new Date(),
): Promise<CleanupOldDataResult> {
  const startedAt = new Date();
  const cutoffIso = retentionCutoffIso(now);

  try {
    const deleted = await cleanupOldMarketData(db, cutoffIso);
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
      },
    };
  }
}
