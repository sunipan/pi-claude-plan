import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolveClaudeCodeVersion } from "./src/config.js";
import { CLAUDE_CODE_VERSION } from "./src/constants.js";
import { createClaudePlanProvider } from "./src/provider.js";

export default function claudePlanExtension(pi: ExtensionAPI): void {
  // Resolved once so every request reports the same version in the
  // user-agent header and the billing block.
  const resolution = resolveClaudeCodeVersion();
  if (resolution.type === "invalid") {
    pi.on("session_start", (_event, ctx) => ctx.ui.notify(resolution.error, "error"));
  } else if (resolution.type === "outdated") {
    pi.on("session_start", (_event, ctx) => ctx.ui.notify(resolution.warning, "warning"));
  }
  pi.registerProvider(
    createClaudePlanProvider(
      resolution.type === "invalid" ? CLAUDE_CODE_VERSION : resolution.version,
    ),
  );
}
