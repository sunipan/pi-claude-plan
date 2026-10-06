import { describe, expect, it } from "vitest";
import { compareVersions, extractClaudeCodeVersion, nextPackageVersion } from "../scripts/sync-upstream.js";

describe("sync-upstream", () => {
  it("compares versions numerically", () => {
    expect(compareVersions("2.1.99", "2.1.284")).toBeLessThan(0);
  });

  it("computes the next package version", () => {
    expect(nextPackageVersion("1.8.2", "1.8.6")).toBe("1.8.6");
    expect(nextPackageVersion("1.8.7", "1.8.7")).toBe("1.8.8");
    expect(nextPackageVersion("1.8.10", "1.8.9")).toBe("1.8.11");
  });

  it("extracts the Claude Code version", () => {
    expect(extractClaudeCodeVersion("export const CLAUDE_CODE_VERSION = '2.1.284'")).toBe("2.1.284");
    expect(extractClaudeCodeVersion('export const CLAUDE_CODE_VERSION = "2.1.284";')).toBe("2.1.284");
    expect(() => extractClaudeCodeVersion("nothing")).toThrow("CLAUDE_CODE_VERSION not found");
  });
});
