import assert from "node:assert/strict";
import test from "node:test";

import {
  AnthropicClient,
  buildAnthropicMessagesRequest,
  normalizeDomainFilters,
  parseAnthropicMessage,
  type ClaudeClientRequest,
} from "./index.ts";

function request(
  overrides: Partial<ClaudeClientRequest> = {},
): ClaudeClientRequest {
  return {
    system_prompt: "system",
    user_prompt: "user",
    model: "claude-test-model",
    tool_type: "web_search_20250305",
    max_uses: 1,
    allowed_domains: [],
    blocked_domains: [],
    ...overrides,
  };
}

function validBriefJson() {
  return {
    schema_version: "1.0",
    generated_at: "2026-06-16T12:00:00.000Z",
    incident_id: "incident_1",
    analysis_mode: "live_context",
    catalyst_status: "context_only",
    ui_label: "Market Backdrop",
    headline: "Same-day market context",
    brief_summary:
      "Same-day reporting described broader market context near the detected movement.",
    confidence: "low",
    price_context_check: "matches_binance",
    main_catalyst: null,
    broader_context: [],
    caveats: [],
    tags: ["same_day_context"],
    source_links: [],
  };
}

test("Claude request construction includes model, web_search tool, max_uses, and allowed domains", () => {
  const body = buildAnthropicMessagesRequest(
    request({
      allowed_domains: ["https://www.reuters.com/markets", "coindesk.com"],
      blocked_domains: ["example.com"],
    }),
  );
  const tools = body.tools as Array<Record<string, unknown>>;
  const tool = tools[0];

  assert.equal(body.model, "claude-test-model");
  assert.equal(tool.type, "web_search_20250305");
  assert.equal(tool.name, "web_search");
  assert.equal(tool.max_uses, 1);
  assert.deepEqual(tool.allowed_domains, ["www.reuters.com", "coindesk.com"]);
  assert.equal("blocked_domains" in tool, false);
});

test("Claude request construction uses blocked domains only when allowed domains are absent", () => {
  const body = buildAnthropicMessagesRequest(
    request({
      blocked_domains: ["https://forecast.example/news", "bad domain"],
    }),
  );
  const tool = (body.tools as Array<Record<string, unknown>>)[0];

  assert.deepEqual(tool.blocked_domains, ["forecast.example"]);
  assert.equal("allowed_domains" in tool, false);
});

test("domain filters strip URL schemes and reject invalid domains safely", () => {
  assert.deepEqual(
    normalizeDomainFilters([
      "https://coindesk.com/markets",
      "HTTP://WWW.REUTERS.COM/world",
      "*.example.org",
      "not a domain",
      "localhost",
    ]),
    ["coindesk.com", "www.reuters.com", "example.org"],
  );
});

test("AnthropicClient posts a non-streaming Messages request with configured tool data", async () => {
  let capturedBody: unknown = null;
  const fetcher: typeof fetch = async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        content: [
          {
            type: "text",
            text: JSON.stringify(validBriefJson()),
          },
        ],
        usage: {
          server_tool_use: {
            web_search_requests: 1,
          },
        },
      }),
      { status: 200 },
    );
  };
  const client = new AnthropicClient({
    apiKey: "test-key",
    fetcher,
    now: () => new Date("2026-06-16T12:00:00.000Z"),
  });

  const result = await client.createIncidentBrief(request());

  assert.equal(result.ok, true);
  assert.ok(capturedBody && typeof capturedBody === "object");
  const body = capturedBody as Record<string, unknown>;
  assert.equal(body.model, "claude-test-model");
  assert.equal(body.stream, undefined);
  assert.equal(result.parsed.metadata.searches_used, 1);
});

test("AnthropicClient treats fetch exceptions as retryable unavailable errors", async () => {
  const client = new AnthropicClient({
    apiKey: "test-key",
    fetcher: async () => {
      throw new Error("network timeout");
    },
    retries: 0,
    now: () => new Date("2026-06-16T12:00:00.000Z"),
  });

  const result = await client.createIncidentBrief(request());

  assert.equal(result.ok, false);
  assert.equal(result.parsed.retryable, true);
  assert.equal(result.parsed.metadata.error_code, "unavailable");
});

test("parser strips markdown fences and parses valid JSON text content", () => {
  const parsed = parseAnthropicMessage(
    {
      content: [
        {
          type: "text",
          text: `\`\`\`json\n${JSON.stringify(validBriefJson())}\n\`\`\``,
        },
      ],
    },
    {
      model: "claude-test-model",
      toolType: "web_search_20250305",
      maxUses: 1,
      generatedAt: "2026-06-16T12:00:00.000Z",
    },
  );

  assert.equal(parsed.error_message, null);
  assert.equal((parsed.json as Record<string, unknown>).schema_version, "1.0");
});

test("parser extracts web search citations without exposing cited text", () => {
  const parsed = parseAnthropicMessage(
    {
      content: [
        {
          type: "text",
          text: JSON.stringify(validBriefJson()),
          citations: [
            {
              type: "web_search_result_location",
              url: "https://www.reuters.com/markets/context",
              title: "Market context",
              cited_text: "internal citation excerpt",
              encrypted_index: "hidden",
            },
          ],
        },
      ],
    },
    {
      model: "claude-test-model",
      toolType: "web_search_20250305",
      maxUses: 1,
      generatedAt: "2026-06-16T12:00:00.000Z",
    },
  );

  assert.equal(parsed.citations.length, 1);
  assert.equal(parsed.citations[0].publisher, "reuters.com");
  assert.equal(JSON.stringify(parsed.citations).includes("cited_text"), false);
  assert.equal(JSON.stringify(parsed.citations).includes("encrypted"), false);
});

test("parser detects web search result errors and classifies retryable codes", () => {
  const tooManyRequests = parseAnthropicMessage(
    {
      content: [
        {
          type: "web_search_tool_result_error",
          error_code: "too_many_requests",
        },
      ],
    },
    {
      model: "claude-test-model",
      toolType: "web_search_20250305",
      maxUses: 1,
      generatedAt: "2026-06-16T12:00:00.000Z",
    },
  );
  const invalidInput = parseAnthropicMessage(
    {
      content: [
        {
          type: "web_search_tool_result_error",
          error_code: "invalid_input",
        },
      ],
    },
    {
      model: "claude-test-model",
      toolType: "web_search_20250305",
      maxUses: 1,
      generatedAt: "2026-06-16T12:00:00.000Z",
    },
  );

  assert.equal(tooManyRequests.metadata.error_code, "too_many_requests");
  assert.equal(tooManyRequests.retryable, true);
  assert.equal(invalidInput.metadata.error_code, "invalid_input");
  assert.equal(invalidInput.retryable, false);
});

test("parser detects max_uses_exceeded and query_too_long safely", () => {
  for (const errorCode of ["max_uses_exceeded", "query_too_long"]) {
    const parsed = parseAnthropicMessage(
      {
        content: [
          {
            type: "web_search_tool_result_error",
            error_code: errorCode,
          },
        ],
      },
      {
        model: "claude-test-model",
        toolType: "web_search_20250305",
        maxUses: 1,
        generatedAt: "2026-06-16T12:00:00.000Z",
      },
    );

    assert.equal(parsed.metadata.error_code, errorCode);
    assert.equal(parsed.json, null);
  }
});
