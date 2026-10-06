import type { Context } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import {
  CLAUDE_AGENT_IDENTITY,
  REQUIRED_BETAS,
} from "../src/constants.js";
import {
  buildAnthropicClientOptions,
  createToolNameMap,
  fingerprintRequestPayload,
  fromWireToolName,
  sanitizePiSystemText,
  toWireToolName,
} from "../src/transform.js";

describe("Pi request fingerprint", () => {
  it("sanitizes only Pi harness identity/docs and is idempotent", () => {
    const prompt = [
      "You are an expert coding assistant operating inside pi, a coding agent harness. You help users.",
      "Available tools:\n- read: read files",
      "Pi documentation (read only when the user asks about pi itself):\n- /opt/pi/docs",
      "Project-specific instructions stay, including .pi paths.",
      "Here is some useful information about the environment you are running in:\nCWD=/tmp/project",
    ].join("\n\n");
    const once = sanitizePiSystemText(prompt);
    expect(once).not.toContain("operating inside pi");
    expect(once).not.toContain("Pi documentation (read only");
    expect(once).toContain("Available tools");
    expect(once).toContain("Project-specific instructions stay");
    expect(once).toContain("Environment context you are running in:");
    expect(sanitizePiSystemText(once)).toBe(once);
  });

  it("uses exact billing, identity, then sanitized-system block order", () => {
    const payload = fingerprintRequestPayload({
      system:
        "You are an expert coding assistant operating inside pi, a coding agent harness.\n\nKeep this instruction.",
      messages: [{ role: "user", content: "hello world test message" }],
    }, "2.1.87") as { system: Array<{ text: string }> };
    expect(payload.system).toHaveLength(3);
    expect(payload.system[0]?.text).toBe(
      "x-anthropic-billing-header: cc_version=2.1.87.6ff; cc_entrypoint=sdk-cli; cch=4ffc3;",
    );
    expect(payload.system[1]?.text).toBe(CLAUDE_AGENT_IDENTITY);
    expect(payload.system[2]?.text).toBe("Keep this instruction.");
  });

  it("is idempotent and prefixes definitions plus historical tool calls", () => {
    const input = {
      system: "Keep this.",
      tools: [{ name: "read_file", input_schema: { type: "object" } }],
      messages: [
        { role: "user", content: "inspect" },
        {
          role: "assistant",
          content: [
            { type: "tool_use", id: "call-1", name: "bash", input: {} },
          ],
        },
      ],
    };
    const once = fingerprintRequestPayload(input) as typeof input & {
      system: Array<{ text: string }>;
    };
    const twice = fingerprintRequestPayload(once);
    expect(once.tools[0]?.name).toBe("mcp_Read_file");
    const historicalBlock = (once.messages[1]?.content as Array<{ name?: string }>)[0];
    expect(historicalBlock?.name).toBe("mcp_Bash");
    expect(twice).toEqual(once);
    expect(once.system.filter((block) => block.text === CLAUDE_AGENT_IDENTITY)).toHaveLength(1);
  });

  it("maps streamed names back exactly, including names found only in history", () => {
    const context = {
      messages: [
        {
          role: "assistant",
          content: [
            { type: "toolCall", id: "1", name: "myURLTool", arguments: {} },
          ],
          api: "anthropic-messages",
          provider: "claude-plan",
          model: "test",
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: "toolUse",
          timestamp: 0,
        },
      ],
      tools: [
        {
          name: "read_file",
          description: "read",
          parameters: { type: "object", properties: {} },
        },
      ],
    } as unknown as Context;
    const names = createToolNameMap(context);
    expect(toWireToolName("read_file")).toBe("mcp_Read_file");
    expect(fromWireToolName("mcp_Read_file", names)).toBe("read_file");
    expect(fromWireToolName("mcp_MyURLTool", names)).toBe("myURLTool");
    expect(fromWireToolName("mcp_Unknown")).toBe("unknown");
  });

  it("rejects original tool names that collide on the Claude wire name", () => {
    const context = {
      messages: [],
      tools: [
        { name: "read", description: "lower", parameters: { type: "object" } },
        { name: "Read", description: "upper", parameters: { type: "object" } },
      ],
    } as unknown as Context;
    expect(() => createToolNameMap(context)).toThrow(/tool-name collision/);
  });

  it("configures the SDK query and required headers without API-key headers", () => {
    const options = buildAnthropicClientOptions(
      "fake-access-token",
      "https://api.anthropic.com",
      { "x-model": "yes" },
      {
        "anthropic-beta": "caller-value, oauth-2025-04-20",
        aUtHoRiZaTiOn: "must-not-pass-through",
        "X-API-KEY": "must-not-pass-through",
      },
      "2.1.87",
    ) as {
      defaultQuery: Record<string, string>;
      defaultHeaders: Record<string, string>;
      authToken: string;
    };
    expect(options.defaultQuery).toEqual({ beta: "true" });
    expect(options.defaultHeaders["anthropic-beta"].split(",")).toEqual([
      ...REQUIRED_BETAS,
      "caller-value",
    ]);
    expect(options.defaultHeaders["user-agent"]).toBe("claude-cli/2.1.87 (external, cli)");
    expect(options.defaultHeaders["x-model"]).toBe("yes");
    expect(
      Object.keys(options.defaultHeaders).some(
        (name) => name.toLowerCase() === "authorization",
      ),
    ).toBe(false);
    expect(
      Object.keys(options.defaultHeaders).some(
        (name) => name.toLowerCase() === "x-api-key",
      ),
    ).toBe(false);
    expect(options.authToken).toBe("fake-access-token");
  });
});
