import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { Context, Provider } from "@earendil-works/pi-ai";
import { discoverAndLoadExtensions } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

afterEach(() => vi.restoreAllMocks());

describe("installed Pi extension loader (offline)", () => {
  it("loads index.ts, registers the native provider, and completes a request", async () => {
    const isolatedAgentDir = await mkdtemp(resolve(tmpdir(), "pi-claude-plan-loader-"));
    try {
      const loaded = await discoverAndLoadExtensions(
        [resolve("index.ts")],
        isolatedAgentDir,
        isolatedAgentDir,
      );
      expect(loaded.errors).toEqual([]);
      expect(loaded.extensions).toHaveLength(1);
      expect(loaded.runtime.pendingProviderRegistrations).toEqual([]);
      expect(loaded.runtime.pendingNativeProviderRegistrations).toHaveLength(1);

      const provider = loaded.runtime.pendingNativeProviderRegistrations[0]!
        .provider as Provider<"anthropic-messages">;
      expect(provider.id).toBe("claude-plan");
      const model = provider.getModels().find((candidate) => candidate.id === "claude-fable-5")!;
      expect(model).toBeDefined();
      expect(model.compat?.allowedFallbackModels).toBeUndefined();

      let payload: Record<string, unknown> = {};
      const responseText =
        sse("message_start", {
          type: "message_start",
          message: { id: "msg_loader", usage: { input_tokens: 1, output_tokens: 0 } },
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

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        payload = JSON.parse(await request.text()) as Record<string, unknown>;
        return new Response(responseText, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      });

      const events = [];
      for await (const event of provider.streamSimple(
        model,
        {
          messages: [{ role: "user", content: "Reply with OK", timestamp: 0 }],
        } as Context,
        { apiKey: "synthetic-loader-oauth", maxRetries: 0 },
      )) {
        events.push(event);
      }

      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(payload).not.toHaveProperty("fallbacks");
      expect(events.at(-1)).toMatchObject({ type: "done" });
      expect(events).toContainEqual(
        expect.objectContaining({ type: "text_delta", delta: "OK" }),
      );
    } finally {
      await rm(isolatedAgentDir, { recursive: true, force: true });
    }
  });
});
