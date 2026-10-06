import {
  createProvider,
  type Model,
  type Provider,
} from "@earendil-works/pi-ai";
import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import { CLAUDE_CODE_VERSION, PROVIDER_ID, PROVIDER_NAME } from "./constants.js";
import { claudePlanOAuth } from "./oauth.js";
import { streamClaudePlan, streamClaudePlanRaw } from "./streamer.js";

const ZERO_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
} as const;

type AnthropicCompatWithFallbacks = NonNullable<
  Model<"anthropic-messages">["compat"]
> & {
  allowedFallbackModels?: unknown;
};

function installedAnthropicProvider(): Provider<"anthropic-messages"> {
  // Pi's extension loader exposes providers/all but does not alias individual
  // provider subpaths. builtinProviders() constructs the same anthropicProvider().
  const provider = builtinProviders().find((candidate) => candidate.id === "anthropic");
  if (!provider) throw new Error("Pi's built-in Anthropic provider is unavailable");
  return provider as Provider<"anthropic-messages">;
}

function sanitizeCompat(
  compat: Model<"anthropic-messages">["compat"],
): Model<"anthropic-messages">["compat"] {
  if (!compat) return compat;

  const { allowedFallbackModels: _ignored, ...sanitized } =
    compat as AnthropicCompatWithFallbacks;

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

export function cloneAnthropicModels(
  source: Provider<"anthropic-messages"> = installedAnthropicProvider(),
): Model<"anthropic-messages">[] {
  return source.getModels().map((model) => ({
    ...model,
    provider: PROVIDER_ID,
    name: `${model.name} (Claude Plan)`,
    cost: { ...ZERO_COST },
    compat: sanitizeCompat(model.compat),
  }));
}

export function createClaudePlanProvider(
  claudeCodeVersion: string = CLAUDE_CODE_VERSION,
): Provider<"anthropic-messages"> {
  const models = cloneAnthropicModels();
  return createProvider({
    id: PROVIDER_ID,
    name: PROVIDER_NAME,
    baseUrl: "https://api.anthropic.com",
    auth: { oauth: claudePlanOAuth() },
    models,
    api: {
      stream: (model, context, options) =>
        streamClaudePlanRaw(
          model as Model<"anthropic-messages">,
          context,
          options,
          claudeCodeVersion,
        ),
      streamSimple: (model, context, options) =>
        streamClaudePlan(
          model as Model<"anthropic-messages">,
          context,
          options,
          claudeCodeVersion,
        ),
    },
  });
}
