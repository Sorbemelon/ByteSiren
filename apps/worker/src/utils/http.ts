export type JsonRecord = Record<string, unknown>;

const LOCAL_WEB_ORIGIN = "http://localhost:3000";

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

export function corsPreflightResponse(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}

export function withCors(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  const cors = corsHeaders(request);

  for (const [key, value] of cors.entries()) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function corsHeaders(request: Request): Headers {
  const headers = new Headers();
  const origin = request.headers.get("origin");

  headers.set("vary", "Origin");
  headers.set("access-control-allow-methods", "GET, OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
  headers.set("access-control-max-age", "86400");

  if (origin === LOCAL_WEB_ORIGIN) {
    headers.set("access-control-allow-origin", origin);
  }

  return headers;
}

export function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message.slice(0, 180);
  }

  return "Unexpected error.";
}
