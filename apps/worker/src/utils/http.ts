export type JsonRecord = Record<string, unknown>;

const METRICS_VIEWS_PATH = "/api/metrics/views";
const DEFAULT_PUBLIC_WEB_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
];

export interface CorsEnv {
  PUBLIC_WEB_ORIGINS?: string;
}

export function json(body: JsonRecord, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  headers?: HeadersInit,
): Response {
  return json(
    {
      ok: false,
      error: {
        code,
        message,
      },
    },
    {
      status,
      headers,
    },
  );
}

export function methodNotAllowed(): Response {
  return jsonError(405, "method_not_allowed", "Method is not allowed.");
}

export function notFound(): Response {
  return jsonError(404, "not_found", "Route not found.");
}

export function corsPreflightResponse(
  request: Request,
  env?: CorsEnv,
): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, env),
  });
}

export function withCors(
  request: Request,
  response: Response,
  env?: CorsEnv,
): Response {
  const headers = new Headers(response.headers);
  const cors = corsHeaders(request, env);

  for (const [key, value] of cors.entries()) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function corsHeaders(request: Request, env?: CorsEnv): Headers {
  const headers = new Headers();
  const origin = request.headers.get("origin");
  const pathname = new URL(request.url).pathname;
  const methods =
    pathname === METRICS_VIEWS_PATH ? "GET, POST, OPTIONS" : "GET, OPTIONS";

  headers.set("vary", "Origin");
  headers.set("access-control-allow-methods", methods);
  headers.set("access-control-allow-headers", "content-type");
  headers.set("access-control-max-age", "86400");

  if (origin && publicWebOrigins(env).has(origin)) {
    headers.set("access-control-allow-origin", origin);
  }

  return headers;
}

function publicWebOrigins(env?: CorsEnv): Set<string> {
  const origins = new Set(DEFAULT_PUBLIC_WEB_ORIGINS);

  for (const value of (env?.PUBLIC_WEB_ORIGINS ?? "").split(",")) {
    const origin = normalizeOrigin(value);

    if (origin) {
      origins.add(origin);
    }
  }

  return origins;
}

function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

export function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message.slice(0, 180);
  }

  return "Unexpected error.";
}
