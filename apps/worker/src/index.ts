export interface Env {
  DB: D1Database;
  APP_VERSION?: string;
  BUILD_PHASE?: string;
}

type JsonBody = Record<string, unknown>;

function json(body: JsonBody, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

function notFound(): Response {
  return json(
    {
      ok: false,
      error: "not_found",
    },
    {
      status: 404,
    },
  );
}

function healthResponse(): Response {
  return json({
    ok: true,
    service: "bytesiren-worker",
    time: new Date().toISOString(),
  });
}

function versionResponse(env: Env): Response {
  return json({
    service: "bytesiren-worker",
    version: env.APP_VERSION ?? "0.1.0-placeholder",
    phase: env.BUILD_PHASE ?? "phase-1a-cloudflare-foundation",
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/health") {
      return healthResponse();
    }

    if (request.method === "GET" && url.pathname === "/api/version") {
      return versionResponse(env);
    }

    return notFound();
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    // Future phases route cron expressions to market polling, enrichment, and cleanup.
    console.log(`ByteSiren scheduled placeholder: ${controller.cron}`);
    void env.DB;
  },
} satisfies ExportedHandler<Env>;
