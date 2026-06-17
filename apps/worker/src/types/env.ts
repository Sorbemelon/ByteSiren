export interface Env {
  DB: D1Database;
  APP_VERSION?: string;
  BUILD_PHASE?: string;
  ANTHROPIC_API_KEY?: string;
  CLAUDE_MODEL?: string;
  CLAUDE_WEB_SEARCH_TOOL_TYPE?: string;
  CLAUDE_DEFAULT_MAX_USES?: string;
  CLAUDE_SECOND_SEARCH_MAX_USES?: string;
  CLAUDE_PUBLIC_DAILY_ANALYSIS_LIMIT?: string;
  CLAUDE_ALLOWED_DOMAINS?: string;
  CLAUDE_BLOCKED_DOMAINS?: string;
  PUBLIC_WEB_ORIGINS?: string;
}
