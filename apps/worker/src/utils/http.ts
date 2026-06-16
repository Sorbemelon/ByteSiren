export type JsonRecord = Record<string, unknown>;

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

export function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message.slice(0, 180);
  }

  return "Unexpected error.";
}
