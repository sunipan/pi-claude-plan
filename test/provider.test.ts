import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import type { Context, Model, Provider } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import registerExtension from "../index.js";
import { cloneAnthropicModels, createClaudePlanProvider } from "../src/provider.js";
import { streamClaudePlanRaw } from "../src/streamer.js";

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

afterEach(() => vi.restoreAllMocks());

describe("provider registration and model cloning", () => {
  it("clones the installed Anthropic catalog and changes only provider/name/cost", () => {
    const sourceProvider = builtinProviders().find(
      (provider) => provider.id === "anthropic",
    )!;
    const source = sourceProvider.getModels();
    const cloned = cloneAnthropicModels(
      sourceProvider as Provider<"anthropic-messages">,
    );
    expect(cloned).toHaveLength(source.length);
    expect(cloned.length).toBeGreaterThan(0);

    for (let index = 0; index < source.length; index += 1) {
      const original = source[index]!;
      const copy = cloned[index]!;
      const {
        provider: _sourceProvider,
        name: sourceName,
        cost: _sourceCost,
        compat: sourceCompat,
        ...sourceRest
      } = original;
      const { provider, name, cost, compat: copyCompat, ...copyRest } = copy;
      expect(provider).toBe("claude-plan");
      expect(name).toBe(`${sourceName} (Claude Plan)`);
      expect(cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
      expect(copyRest).toEqual(sourceRest);
      const {
        allowedFallbackModels: _sourceFallbacks,
        ...expectedCompat
      } = (sourceCompat ?? {}) as NonNullable<
        Model<"anthropic-messages">["compat"]
      >;
      expect(copyCompat).toEqual(
        Object.keys(expectedCompat).length > 0 ? expectedCompat : undefined,
      );
    }
    expect(sourceProvider.id).toBe("anthropic");
    expect(source.some((model) => model.cost.input > 0 || model.cost.output > 0)).toBe(true);
  });

  it("removes fallback metadata from cloned compat without mutating the source catalog", () => {
    const sourceModel = {
      id: "claude-opus-5",
      name: "Claude Opus 5",
      api: "anthropic-messages",
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com",
      reasoning: true,
      thinkingLevelMap: { low: { type: "enabled", budgetTokens: 1024 } },
      input: ["text", "image"],
      cost: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
      contextWindow: 200_000,
      maxTokens: 32_000,
      headers: { "anthropic-beta": "verified-feature" },
      compat: {
        allowedFallbackModels: ["claude-sonnet-4-5"],
        forceAdaptiveThinking: true,
        supportsStrictTools: true,
        supportsTemperature: false,
      },
    } as const;
    const sourceSnapshot = structuredClone(sourceModel);
    const sourceProvider = {
      id: "anthropic",
      name: "Anthropic",
      auth: {} as Provider["auth"],
      getModels: () => [sourceModel],
    } as unknown as Provider<"anthropic-messages">;

    const [copy] = cloneAnthropicModels(sourceProvider);

    expect(copy).toBeDefined();
    expect(copy).toMatchObject({
      id: sourceModel.id,
      provider: "claude-plan",
      name: `${sourceModel.name} (Claude Plan)`,
      baseUrl: sourceModel.baseUrl,
      reasoning: sourceModel.reasoning,
      thinkingLevelMap: sourceModel.thinkingLevelMap,
      input: sourceModel.input,
      contextWindow: sourceModel.contextWindow,
      maxTokens: sourceModel.maxTokens,
      headers: sourceModel.headers,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      compat: {
        forceAdaptiveThinking: true,
        supportsStrictTools: true,
        supportsTemperature: false,
      },
    });
    expect(copy!.compat).not.toBe(sourceModel.compat);
    expect((copy!.compat as { allowedFallbackModels?: unknown }).allowedFallbackModels).toBeUndefined();
    expect(sourceModel).toEqual(sourceSnapshot);
  });

  it("provides OAuth only under the distinct provider id", () => {
    const provider = createClaudePlanProvider();
    expect(provider.id).toBe("claude-plan");
    expect(provider.name).toBe("Claude Plan (Pro/Max)");
    expect(provider.auth.oauth).toBeDefined();
    expect(provider.auth.apiKey).toBeUndefined();
    expect(provider.getModels().every((model) => model.provider === "claude-plan")).toBe(true);
  });

  it("registers one complete provider without overriding anthropic", () => {
    const registered: unknown[] = [];
    registerExtension({
      registerProvider(provider: unknown) {
        registered.push(provider);
      },
    } as never);
    expect(registered).toHaveLength(1);
    expect(registered[0]).toMatchObject({ id: "claude-plan" });
  });
});
