import { describe, expect, it } from "vitest";
import { resolveClaudeCodeVersion } from "../src/config.js";
import { CLAUDE_CODE_VERSION } from "../src/constants.js";

describe("resolveClaudeCodeVersion", () => {
  it("uses the bundled version when unset", () => {
    expect(resolveClaudeCodeVersion(undefined)).toEqual({
      type: "success",
      version: CLAUDE_CODE_VERSION,
    });
  });

  it("trims and accepts equal-or-newer versions", () => {
    expect(resolveClaudeCodeVersion(" 2.1.300 ")).toEqual({
      type: "success",
      version: "2.1.300",
    });
    expect(resolveClaudeCodeVersion("3.0.0")).toEqual({ type: "success", version: "3.0.0" });
  });

  it("compares numerically, not lexically", () => {
    const result = resolveClaudeCodeVersion("2.1.99");
    expect(result.type).toBe("outdated");
    if (result.type === "outdated") expect(result.version).toBe("2.1.99");
  });

  it.each(["latest", "2.1"])("rejects malformed value %s", (raw) => {
    const result = resolveClaudeCodeVersion(raw);
    expect(result.type).toBe("invalid");
    expect(result).not.toHaveProperty("version");
    if (result.type === "invalid") {
      expect(result.error).toContain("ANTHROPIC_CLAUDE_CODE_VERSION");
    }
  });
});
