import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import type { Provider } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import registerExtension from "../index.js";
import { cloneAnthropicModels, createClaudePlanProvider } from "../src/provider.js";

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
      const { provider: _sourceProvider, name: sourceName, cost: _sourceCost, ...sourceRest } = original;
      const { provider, name, cost, ...copyRest } = copy;
      expect(provider).toBe("claude-plan");
      expect(name).toBe(`${sourceName} (Claude Plan)`);
      expect(cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
      expect(copyRest).toEqual(sourceRest);
    }
    expect(sourceProvider.id).toBe("anthropic");
    expect(source.some((model) => model.cost.input > 0 || model.cost.output > 0)).toBe(true);
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
