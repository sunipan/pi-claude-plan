import { CLAUDE_CODE_VERSION } from "./constants.js";

/**
 * Overrides the reported Claude Code version. Anthropic gates model access on
 * this value server-side, on its own schedule; the override unblocks a
 * newly-gated model without waiting for a package release.
 */
export const ANTHROPIC_CLAUDE_CODE_VERSION_ENV_VAR = "ANTHROPIC_CLAUDE_CODE_VERSION";

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/** Numeric (not lexical) comparison: 2.1.99 is older than 2.1.280. */
function isOlderVersion(candidate: string, baseline: string): boolean {
  const [major = 0n, minor = 0n, patch = 0n] = candidate.split(".").map(BigInt);
  const [baseMajor = 0n, baseMinor = 0n, basePatch = 0n] = baseline.split(".").map(BigInt);
  if (major !== baseMajor) return major < baseMajor;
  if (minor !== baseMinor) return minor < baseMinor;
  return patch < basePatch;
}

export type ClaudeCodeVersionResolution =
  | { type: "success"; version: string }
  | { type: "outdated"; version: string; warning: string }
  | { type: "invalid"; error: string };

/**
 * Resolve the Claude Code version to report. Unset: bundled version. Malformed:
 * `invalid` (no version, so it can never reach a request). Older than bundled:
 * `outdated`, still honoured because it was set deliberately. Never throws.
 */
export function resolveClaudeCodeVersion(
  raw: string | undefined = process.env[ANTHROPIC_CLAUDE_CODE_VERSION_ENV_VAR],
): ClaudeCodeVersionResolution {
  if (raw === undefined) return { type: "success", version: CLAUDE_CODE_VERSION };

  const trimmed = raw.trim();
  if (!VERSION_PATTERN.test(trimmed)) {
    return {
      type: "invalid",
      error:
        `${ANTHROPIC_CLAUDE_CODE_VERSION_ENV_VAR} is set to ${JSON.stringify(raw)}, which is not a ` +
        `Claude Code version. Expected major.minor.patch (e.g. ${CLAUDE_CODE_VERSION}). ` +
        `Reporting the bundled version ${CLAUDE_CODE_VERSION} instead — correct or unset ` +
        `${ANTHROPIC_CLAUDE_CODE_VERSION_ENV_VAR} and restart Pi to use the override.`,
    };
  }

  if (isOlderVersion(trimmed, CLAUDE_CODE_VERSION)) {
    return {
      type: "outdated",
      version: trimmed,
      warning:
        `${ANTHROPIC_CLAUDE_CODE_VERSION_ENV_VAR} is set to ${JSON.stringify(trimmed)}, which is older ` +
        `than the bundled Claude Code version ${CLAUDE_CODE_VERSION}. Anthropic gates model access on ` +
        `the reported version, so reporting an older one can make newer models reject the request. ` +
        `Set ${ANTHROPIC_CLAUDE_CODE_VERSION_ENV_VAR} to ${CLAUDE_CODE_VERSION} or newer — or unset it ` +
        `to use the bundled version — and restart Pi.`,
    };
  }

  return { type: "success", version: trimmed };
}
