import {
  ALLOWED_SYMBOLS,
  BINANCE_KLINES_LIMIT,
  type MarketSymbol,
  parseMarketSymbol,
} from "../config.ts";
import { pollMarket } from "../jobs/pollMarket.ts";
import { checkBinanceKlines } from "../services/binance.ts";
import type { Env } from "../types/env.ts";
import type { SymbolPollResult } from "../types/market.ts";
import { json, jsonError, methodNotAllowed, notFound } from "../utils/http.ts";

const ADMIN_TOKEN_HEADER = "x-bytesiren-admin-token";

function isMaintenanceEnabled(env: Env): boolean {
  return env.ENABLE_ADMIN_MAINTENANCE?.trim().toLowerCase() === "true";
}

function isAuthorized(request: Request, env: Env): boolean {
  const expected = env.ADMIN_BACKFILL_TOKEN?.trim();
  const provided = request.headers.get(ADMIN_TOKEN_HEADER)?.trim();

  return Boolean(
    isMaintenanceEnabled(env) && expected && provided === expected,
  );
}

function parseMode(value: string | null): "recent" | "backfill" | undefined {
  if (value === null || value === "") {
    return undefined;
  }

  return value === "recent" || value === "backfill" ? value : undefined;
}

function parseLimit(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return Math.min(BINANCE_KLINES_LIMIT, Math.max(1, Math.trunc(parsed)));
}

function parseOptionalSymbol(value: string | null): MarketSymbol | undefined {
  if (!value) {
    return undefined;
  }

  return parseMarketSymbol(value) ?? undefined;
}

function failuresForResponse(results: SymbolPollResult[]) {
  return results
    .filter((result) => !result.ok)
    .map((result) => ({
      symbol: result.symbol,
      mode: result.mode,
      stage: result.error_stage ?? null,
      code: result.error_code ?? "unknown_error",
      http_status: result.http_status ?? null,
      message: result.error ?? null,
    }));
}

export async function adminResponse(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return notFound();
  }

  const url = new URL(request.url);

  if (url.pathname === "/api/admin/binance-check") {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }

    const symbol = parseMarketSymbol(url.searchParams.get("symbol"));

    if (!symbol) {
      return jsonError(
        400,
        "invalid_symbol",
        `Symbol must be one of: ${ALLOWED_SYMBOLS.join(", ")}.`,
      );
    }

    return json({ ...(await checkBinanceKlines({ symbol })) });
  }

  if (url.pathname === "/api/admin/market-poll") {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    const rawMode = url.searchParams.get("mode");
    const mode = parseMode(rawMode);

    if (rawMode && !mode) {
      return jsonError(400, "invalid_mode", "Mode must be recent or backfill.");
    }

    const rawSymbol = url.searchParams.get("symbol");
    const symbol = parseOptionalSymbol(rawSymbol);

    if (rawSymbol && !symbol) {
      return jsonError(
        400,
        "invalid_symbol",
        `Symbol must be one of: ${ALLOWED_SYMBOLS.join(", ")}.`,
      );
    }

    const result = await pollMarket(env.DB, {
      mode,
      symbol,
      limit: parseLimit(url.searchParams.get("limit")),
    });
    const symbolsUpdated = result.symbols.filter((item) => item.ok).length;

    return json({
      ok: result.status !== "failed",
      mode: mode ?? "auto",
      symbols_attempted: result.symbols.length,
      symbols_updated: symbolsUpdated,
      failures: failuresForResponse(result.symbols),
      message: result.message,
    });
  }

  return notFound();
}
