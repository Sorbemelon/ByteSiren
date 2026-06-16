import type { Env } from "../types/env.ts";
import { json } from "../utils/http.ts";

export function healthResponse(): Response {
  return json({
    ok: true,
    service: "bytesiren-worker",
    time: new Date().toISOString(),
  });
}

export function versionResponse(env: Env): Response {
  return json({
    ok: true,
    service: "bytesiren-worker",
    version: env.APP_VERSION ?? "0.1.0-placeholder",
    phase: env.BUILD_PHASE ?? "phase-2a-market-ingestion",
  });
}
