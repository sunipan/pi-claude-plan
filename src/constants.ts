export const PROVIDER_ID = "claude-plan";
export const PROVIDER_NAME = "Claude Plan (Pro/Max)";

export const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
export const AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
export const CODE_CALLBACK_URL = "https://platform.claude.com/oauth/code/callback";
export const TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
export const OAUTH_SCOPES = [
  "org:create_api_key",
  "user:profile",
  "user:inference",
  "user:sessions:claude_code",
  "user:mcp_servers",
  "user:file_upload",
] as const;

export const EXPIRY_SKEW_MS = 5 * 60 * 1000;
export const TOOL_PREFIX = "mcp_";
export const REQUIRED_BETAS = [
  "oauth-2025-04-20",
  "interleaved-thinking-2025-05-14",
] as const;

export const CLAUDE_AGENT_IDENTITY =
  "You are a Claude agent, built on Anthropic's Claude Agent SDK.";
export const PI_IDENTITY_PREFIX =
  "You are an expert coding assistant operating inside pi, a coding agent harness.";
export const PI_PARAGRAPH_REMOVAL_ANCHORS = [
  "Pi documentation (read only when the user asks about pi itself",
] as const;
export const PI_TEXT_REPLACEMENTS = [
  {
    match: "Here is some useful information about the environment you are running in:",
    replacement: "Environment context you are running in:",
  },
] as const;

export const CCH_SALT = "59cf53e54c78";
export const CCH_POSITIONS = [4, 7, 20] as const;
export const CLAUDE_CODE_VERSION = "2.1.284";
export const CLAUDE_CODE_ENTRYPOINT = "sdk-cli";

export function formatUserAgent(version: string): string {
  return `claude-cli/${version} (external, cli)`;
}
