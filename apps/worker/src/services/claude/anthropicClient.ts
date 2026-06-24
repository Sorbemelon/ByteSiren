import type {
  ClaudeCitationSource,
  ClaudeClientRequest,
  ClaudeClientResult,
  ClaudeParsedMessage,
  ClaudeResponseMetadata,
  ClaudeToolErrorCode,
} from "./types.ts";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_RETRIES = 2;
const RETRYABLE_HTTP_STATUSES = new Set([
  408, 409, 425, 429, 500, 502, 503, 504, 529,
]);
const RETRYABLE_TOOL_ERRORS = new Set<ClaudeToolErrorCode>([
  "too_many_requests",
  "unavailable",
]);

type Fetcher = typeof fetch;

interface AnthropicClientOptions {
  apiKey: string;
  fetcher?: Fetcher;
  endpoint?: string;
  timeoutMs?: number;
  retries?: number;
  now?: () => Date;
}

export class AnthropicClient {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly fetcher: Fetcher;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly now: () => Date;

  constructor(options: AnthropicClientOptions) {
    this.apiKey = options.apiKey;
    this.endpoint = options.endpoint ?? ANTHROPIC_MESSAGES_URL;
    this.fetcher = options.fetcher ?? ((input, init) => fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retries = options.retries ?? DEFAULT_RETRIES;
    this.now = options.now ?? (() => new Date());
  }

  async createIncidentBrief(
    request: ClaudeClientRequest,
  ): Promise<ClaudeClientResult> {
    const body = buildAnthropicMessagesRequest(request);
    let lastResult: ClaudeClientResult | null = null;

    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      let response: Response;

      try {
        response = await this.fetchWithTimeout(body);
      } catch (error) {
        lastResult = errorResult({
          request,
          generatedAt: this.now().toISOString(),
          errorCode: "unavailable",
          message: safeTransportErrorMessage(error),
          retryable: true,
        });

        if (attempt < this.retries) {
          continue;
        }

        return lastResult;
      }

      if (!response.ok) {
        lastResult = await responseToErrorResult(
          response,
          request,
          this.now().toISOString(),
        );

        if (
          lastResult.parsed.retryable &&
          attempt < this.retries &&
          RETRYABLE_HTTP_STATUSES.has(response.status)
        ) {
          continue;
        }

        return lastResult;
      }

      const raw = await readJson(response);
      const parsed = parseAnthropicMessage(raw, {
        model: request.model,
        toolType: request.tool_type,
        maxUses: request.max_uses,
        generatedAt: this.now().toISOString(),
      });

      lastResult = {
        ok: parsed.error_message === null,
        parsed,
      };

      return lastResult;
    }

    return (
      lastResult ??
      errorResult({
        request,
        generatedAt: this.now().toISOString(),
        errorCode: "unknown",
        message: "Claude request did not complete.",
        retryable: true,
      })
    );
  }

  private async fetchWithTimeout(body: Record<string, unknown>) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await this.fetcher(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function normalizeDomainFilters(domains: string[]): string[] {
  const normalized = new Set<string>();

  for (const value of domains) {
    const domain = normalizeDomainFilter(value);

    if (domain) {
      normalized.add(domain);
    }
  }

  return [...normalized];
}

export function buildAnthropicMessagesRequest(
  request: ClaudeClientRequest,
): Record<string, unknown> {
  const allowedDomains = normalizeDomainFilters(request.allowed_domains);
  const blockedDomains =
    allowedDomains.length > 0
      ? []
      : normalizeDomainFilters(request.blocked_domains);
  const tool: Record<string, unknown> = {
    type: request.tool_type,
    name: "web_search",
    max_uses: request.max_uses,
  };

  if (allowedDomains.length > 0) {
    tool.allowed_domains = allowedDomains;
  } else if (blockedDomains.length > 0) {
    tool.blocked_domains = blockedDomains;
  }

  const body: Record<string, unknown> = {
    model: request.model,
    max_tokens: DEFAULT_MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: request.user_prompt,
      },
    ],
    tools: [tool],
  };

  // Send the system prompt as a cached text block so the static instruction
  // prefix can be served from the prompt cache across enrichment calls. The
  // cache only activates once the prefix exceeds the model's minimum cacheable
  // size; below that it is a no-op (no error), and the adherence benefit of
  // keeping rules in the system role still stands.
  if (request.system_prompt) {
    body.system = [
      {
        type: "text",
        text: request.system_prompt,
        cache_control: { type: "ephemeral" },
      },
    ];
  }

  return body;
}

function normalizeDomainFilter(value: string): string | null {
  const trimmed = value.trim().toLowerCase();

  if (!trimmed) {
    return null;
  }

  let candidate = trimmed;

  try {
    if (candidate.includes("://")) {
      candidate = new URL(candidate).hostname;
    }
  } catch {
    return null;
  }

  candidate = candidate.replace(/^\*\./, "").split(/[/?#]/)[0].trim();

  if (
    !candidate ||
    candidate.includes(":") ||
    candidate.startsWith(".") ||
    candidate.endsWith(".") ||
    !candidate.includes(".") ||
    !/^[a-z0-9.-]+$/.test(candidate)
  ) {
    return null;
  }

  return candidate;
}

interface ParseContext {
  model: string;
  toolType: string;
  maxUses: number;
  generatedAt: string;
}

export function parseAnthropicMessage(
  raw: unknown,
  context: ParseContext,
): ClaudeParsedMessage {
  const contentBlocks = arrayField(fieldValue(raw, "content"));
  const text = contentBlocks
    .map((block) => stringField(block, "text"))
    .filter((value): value is string => Boolean(value))
    .join("\n")
    .trim();
  const toolErrorCode = findToolErrorCode(raw);
  const usageSearches = numberField(
    recordField(recordField(raw, "usage"), "server_tool_use"),
    "web_search_requests",
  );
  const searchesUsed =
    usageSearches ??
    countWebSearchToolUse(raw) ??
    (toolErrorCode ? context.maxUses : 0);
  const citations = extractCitationSources(raw, context.generatedAt);
  const metadata: ClaudeResponseMetadata = {
    searches_used: searchesUsed,
    claude_model: context.model,
    tool_type: context.toolType,
    max_uses: context.maxUses,
    error_code: toolErrorCode,
    generated_at: context.generatedAt,
  };

  const parsedJson = parseAssistantJson(text);

  if (toolErrorCode) {
    if (toolErrorCode === "max_uses_exceeded" && parsedJson.ok) {
      return {
        json: parsedJson.value,
        text,
        citations,
        metadata,
        retryable: false,
        error_message: null,
      };
    }

    return {
      json: null,
      text,
      citations,
      metadata,
      retryable: RETRYABLE_TOOL_ERRORS.has(toolErrorCode),
      error_message: `Claude Web Search returned ${toolErrorCode}.`,
    };
  }

  if (!parsedJson.ok) {
    return {
      json: null,
      text,
      citations,
      metadata: {
        ...metadata,
        error_code: "parse_error",
      },
      retryable: false,
      error_message: "Claude response was not valid JSON.",
    };
  }

  return {
    json: parsedJson.value,
    text,
    citations,
    metadata,
    retryable: false,
    error_message: null,
  };
}

function parseAssistantJson(
  text: string,
): { ok: true; value: unknown } | { ok: false } {
  if (!text) {
    return { ok: false };
  }

  const candidates = [stripMarkdownJsonFence(text), firstJsonObject(text)];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    try {
      return {
        ok: true,
        value: JSON.parse(candidate),
      };
    } catch {
      // Try the next defensive candidate.
    }
  }

  return { ok: false };
}

function stripMarkdownJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function firstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return text.slice(start, end + 1);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function responseToErrorResult(
  response: Response,
  request: ClaudeClientRequest,
  generatedAt: string,
): Promise<ClaudeClientResult> {
  const body = await readJson(response);
  const bodyCode = stringField(recordField(body, "error"), "type");
  const errorCode =
    httpStatusToErrorCode(response.status, bodyCode) ?? "http_error";

  const bodyMessage = stringField(recordField(body, "error"), "message");
  const detail = [bodyCode, bodyMessage && safeDiagnosticText(bodyMessage)]
    .filter(Boolean)
    .join(": ");

  return errorResult({
    request,
    generatedAt,
    errorCode,
    message: `Claude request failed with HTTP ${response.status}${detail ? ` (${detail})` : ""}.`,
    retryable: RETRYABLE_HTTP_STATUSES.has(response.status),
  });
}

function safeTransportErrorMessage(error: unknown): string {
  const detail = errorDiagnostic(error);

  return detail
    ? `Claude request failed before a response (${detail}).`
    : "Claude request failed before a response.";
}

function errorDiagnostic(error: unknown): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const record = error as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const message =
    typeof record.message === "string"
      ? safeDiagnosticText(record.message)
      : "";
  const code = typeof record.code === "string" ? record.code.trim() : "";
  const cause =
    record.cause && typeof record.cause === "object"
      ? (record.cause as Record<string, unknown>)
      : null;
  const causeCode =
    cause && typeof cause.code === "string" ? cause.code.trim() : "";
  const causeName =
    cause && typeof cause.name === "string" ? cause.name.trim() : "";
  const pieces = [
    name,
    code,
    message && message !== name ? message : "",
    causeCode && causeCode !== code ? `cause:${causeCode}` : "",
    causeName && causeName !== name ? `cause:${causeName}` : "",
  ].filter(Boolean);

  return pieces.length > 0 ? pieces.join(" ").slice(0, 180) : null;
}

function safeDiagnosticText(value: string): string {
  return value
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "sk-ant-[redacted]")
    .replace(/github_pat_[A-Za-z0-9_]+/g, "github_pat_[redacted]")
    .replace(/ghp_[A-Za-z0-9_]+/g, "ghp_[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
    .replace(/x-api-key['":\s]+[A-Za-z0-9._-]+/gi, "x-api-key [redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

function errorResult(input: {
  request: ClaudeClientRequest;
  generatedAt: string;
  errorCode: ClaudeToolErrorCode;
  message: string;
  retryable: boolean;
}): ClaudeClientResult {
  return {
    ok: false,
    parsed: {
      json: null,
      text: "",
      citations: [],
      metadata: {
        searches_used: 0,
        claude_model: input.request.model,
        tool_type: input.request.tool_type,
        max_uses: input.request.max_uses,
        error_code: input.errorCode,
        generated_at: input.generatedAt,
      },
      retryable: input.retryable,
      error_message: input.message,
    },
  };
}

function httpStatusToErrorCode(
  status: number,
  bodyCode: string | null,
): ClaudeToolErrorCode | null {
  if (bodyCode === "rate_limit_error" || status === 429) {
    return "too_many_requests";
  }

  if (status >= 500) {
    return "unavailable";
  }

  if (status === 400) {
    return "invalid_input";
  }

  return null;
}

function findToolErrorCode(value: unknown): ClaudeToolErrorCode | null {
  let found: ClaudeToolErrorCode | null = null;

  visitRecords(value, (record) => {
    if (found) {
      return;
    }

    const type = stringField(record, "type");
    const errorCode = stringField(record, "error_code");

    if (
      type === "web_search_tool_result_error" &&
      isClaudeToolErrorCode(errorCode)
    ) {
      found = errorCode;
    }
  });

  return found;
}

function countWebSearchToolUse(value: unknown): number | null {
  let count = 0;

  visitRecords(value, (record) => {
    if (
      stringField(record, "type") === "server_tool_use" &&
      stringField(record, "name") === "web_search"
    ) {
      count += 1;
    }
  });

  return count > 0 ? count : null;
}

function extractCitationSources(
  value: unknown,
  accessedAt: string,
): ClaudeCitationSource[] {
  const byUrl = new Map<string, ClaudeCitationSource>();

  visitRecords(value, (record) => {
    if (stringField(record, "type") !== "web_search_result_location") {
      return;
    }

    const url = stringField(record, "url");

    if (!url) {
      return;
    }

    const publisher = publisherFromUrl(url);
    const title = stringField(record, "title") ?? publisher;

    byUrl.set(url, {
      publisher,
      title,
      url,
      published_at: null,
      accessed_at: accessedAt,
      used_for: "backdrop",
      source_strength: "acceptable",
    });
  });

  return [...byUrl.values()];
}

function publisherFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host || "Unknown";
  } catch {
    return "Unknown";
  }
}

function recordField(
  value: unknown,
  key: string,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const field = (value as Record<string, unknown>)[key];
  return field && typeof field === "object" && !Array.isArray(field)
    ? (field as Record<string, unknown>)
    : null;
}

function fieldValue(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return (value as Record<string, unknown>)[key];
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringField(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.trim() ? field.trim() : null;
}

function numberField(value: unknown, key: string): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const field = (value as Record<string, unknown>)[key];
  return typeof field === "number" && Number.isFinite(field) ? field : null;
}

function visitRecords(
  value: unknown,
  visitor: (record: Record<string, unknown>) => void,
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      visitRecords(item, visitor);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;
  visitor(record);

  for (const child of Object.values(record)) {
    visitRecords(child, visitor);
  }
}

function isClaudeToolErrorCode(
  value: string | null,
): value is ClaudeToolErrorCode {
  return (
    value === "too_many_requests" ||
    value === "invalid_input" ||
    value === "max_uses_exceeded" ||
    value === "query_too_long" ||
    value === "unavailable"
  );
}
