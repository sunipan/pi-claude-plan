import type { Api, Context, Model } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import { cloneAnthropicModels } from "../src/provider.js";
import { streamClaudePlan, streamClaudePlanRaw } from "../src/streamer.js";

afterEach(() => vi.restoreAllMocks());

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

describe("custom Anthropic streamer (offline)", () => {
  it("sends the fingerprint through the SDK and reverses a streamed tool name", async () => {
    let requestUrl = "";
    let requestHeaders = new Headers();
    let requestBody = "";
    const responseText =
      sse("message_start", {
        type: "message_start",
        message: { id: "msg_offline", usage: { input_tokens: 7, output_tokens: 0 } },
      }) +
      sse("content_block_start", {
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "tool_offline",
          name: "mcp_Read_file",
          input: {},
        },
      }) +
      sse("content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: '{"path":"README.md"}' },
      }) +
      sse("content_block_stop", { type: "content_block_stop", index: 0 }) +
      sse("message_delta", {
        type: "message_delta",
        delta: { stop_reason: "tool_use", stop_sequence: null },
        usage: { output_tokens: 4 },
      }) +
      sse("message_stop", { type: "message_stop" });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      requestUrl = request.url;
      requestHeaders = new Headers(request.headers);
      requestBody = await request.text();
      return new Response(responseText, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    });

    const model: Model<"anthropic-messages"> = {
      id: "claude-test",
      name: "Claude Test (Claude Plan)",
      api: "anthropic-messages",
      provider: "claude-plan",
      baseUrl: "https://api.anthropic.com",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200_000,
      maxTokens: 4096,
    };
    const context = {
      systemPrompt:
        "You are an expert coding assistant operating inside pi, a coding agent harness.\n\nKeep this.",
      messages: [{ role: "user", content: "inspect", timestamp: 0 }],
      tools: [
        {
          name: "read_file",
          description: "Read a file",
          parameters: { type: "object", properties: { path: { type: "string" } } },
        },
      ],
    } as unknown as Context;

    const events = [];
    for await (const event of streamClaudePlan(model, context, {
      apiKey: "offline-oauth-token",
      maxRetries: 0,
    })) {
      events.push(event);
    }

    const url = new URL(requestUrl);
    expect(url.pathname).toBe("/v1/messages");
    expect(url.searchParams.get("beta")).toBe("true");
    expect(requestHeaders.get("authorization")).toBe("Bearer offline-oauth-token");
    expect(requestHeaders.get("anthropic-beta")).toContain("oauth-2025-04-20");
    const body = JSON.parse(requestBody) as {
      system: Array<{ text: string }>;
      tools: Array<{ name: string }>;
    };
    expect(body.system.map((block) => block.text)).toEqual([
      expect.stringMatching(/^x-anthropic-billing-header:/),
      "You are a Claude agent, built on Anthropic's Claude Agent SDK.",
      "Keep this.",
    ]);
    expect(body.tools[0]?.name).toBe("mcp_Read_file");
    const end = events.find((event) => event.type === "toolcall_end");
    expect(end).toMatchObject({
      type: "toolcall_end",
      toolCall: {
        name: "read_file",
        arguments: { path: "README.md" },
      },
    });
  });



  it("omits unsupported fallbacks while chaining payload, header, and response hooks", async () => {
    const sourceProvider = builtinProviders().find(
      (provider) => provider.id === "anthropic",
    )!;
    const sourceModel = sourceProvider
      .getModels()
      .find((model) => model.id === "claude-fable-5")!;
    const anthropicSourceModel = sourceModel as Model<"anthropic-messages">;
    expect(anthropicSourceModel.compat?.allowedFallbackModels?.length).toBeGreaterThan(0);

    const model = cloneAnthropicModels(
      sourceProvider as import("@earendil-works/pi-ai").Provider<"anthropic-messages">,
    ).find((candidate) => candidate.id === sourceModel.id)!;
    expect(model.compat?.allowedFallbackModels).toBeUndefined();

    let requestHeaders = new Headers();
    let requestPayload: Record<string, unknown> = {};
    const payloadHook = vi.fn((payload: unknown, hookModel: Model<Api>) => ({
      ...(payload as Record<string, unknown>),
      metadata: { user_id: `offline-${hookModel.provider}` },
    }));
    const responseHook = vi.fn();
    const responseText =
      sse("message_start", {
        type: "message_start",
        message: { id: "msg_fallback_regression", usage: { input_tokens: 1, output_tokens: 0 } },
      }) +
      sse("content_block_start", {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      }) +
      sse("content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "OK" },
      }) +
      sse("content_block_stop", { type: "content_block_stop", index: 0 }) +
      sse("message_delta", {
        type: "message_delta",
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { output_tokens: 1 },
      }) +
      sse("message_stop", { type: "message_stop" });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      requestHeaders = new Headers(request.headers);
      requestPayload = JSON.parse(await request.text()) as Record<string, unknown>;
      return new Response(responseText, {
        status: 200,
        headers: { "content-type": "text/event-stream", "x-offline": "true" },
      });
    });

    const events = [];
    for await (const event of streamClaudePlanRaw(
      model,
      {
        messages: [{ role: "user", content: "Reply with OK", timestamp: 0 }],
      } as Context,
      {
        apiKey: "offline-oauth-token",
        maxRetries: 0,
        headers: { "x-host-hook": "present" },
        onPayload: payloadHook,
        onResponse: responseHook,
      },
    )) {
      events.push(event);
    }

    expect(payloadHook).toHaveBeenCalledOnce();
    expect(responseHook).toHaveBeenCalledOnce();
    expect(requestHeaders.get("x-host-hook")).toBe("present");
    expect(requestPayload).not.toHaveProperty("fallbacks");
    expect(requestPayload.metadata).toEqual({ user_id: "offline-claude-plan" });
    expect(events.at(-1)).toMatchObject({ type: "done" });
  });

  it("rejects colliding tool names before starting a request", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const model = {
      id: "claude-test",
      name: "Claude Test",
      api: "anthropic-messages",
      provider: "claude-plan",
      baseUrl: "https://api.anthropic.com",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200_000,
      maxTokens: 4096,
    } as Model<"anthropic-messages">;
    const context = {
      messages: [{ role: "user", content: "test", timestamp: 0 }],
      tools: [
        { name: "read", description: "lower", parameters: { type: "object" } },
        { name: "Read", description: "upper", parameters: { type: "object" } },
      ],
    } as unknown as Context;

    expect(() =>
      streamClaudePlan(model, context, { apiKey: "offline-oauth-token" }),
    ).toThrow(/tool-name collision/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
