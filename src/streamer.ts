import Anthropic from "@anthropic-ai/sdk";
import { getApiProvider } from "@earendil-works/pi-ai/compat";
import {
  createAssistantMessageEventStream,
  type Api,
  type AssistantMessage,
  type AssistantMessageEvent,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type SimpleStreamOptions,
  type ThinkingLevel,
} from "@earendil-works/pi-ai";
import { CLAUDE_CODE_VERSION } from "./constants.js";
import {
  buildAnthropicClientOptions,
  createToolNameMap,
  fingerprintRequestPayload,
  fromWireToolName,
} from "./transform.js";

const DEFAULT_THINKING_BUDGETS = {
  minimal: 1024,
  low: 2048,
  medium: 8192,
  high: 16384,
} as const;

function clampReasoning(level: ThinkingLevel): keyof typeof DEFAULT_THINKING_BUDGETS {
  return level === "xhigh" || level === "max" ? "high" : level;
}

function mapAdaptiveEffort(
  model: Model<"anthropic-messages">,
  level: ThinkingLevel,
): "low" | "medium" | "high" | "xhigh" | "max" {
  const mapped = model.thinkingLevelMap?.[level];
  if (
    mapped === "low" ||
    mapped === "medium" ||
    mapped === "high" ||
    mapped === "xhigh" ||
    mapped === "max"
  ) {
    return mapped;
  }
  if (level === "minimal" || level === "low") return "low";
  if (level === "medium") return "medium";
  return "high";
}

function estimatedContextTokens(context: Context): number {
  let characters = context.systemPrompt?.length ?? 0;
  for (const tool of context.tools ?? []) {
    characters += tool.name.length + tool.description.length;
    characters += JSON.stringify(tool.parameters).length;
  }
  for (const message of context.messages) {
    if (typeof message.content === "string") characters += message.content.length;
    else {
      for (const block of message.content) {
        if (block.type === "text") characters += block.text.length;
        else if (block.type === "thinking") characters += block.thinking.length;
        else if (block.type === "toolCall") {
          characters += block.name.length + JSON.stringify(block.arguments).length;
        } else characters += 4000;
      }
    }
  }
  return Math.ceil(characters / 4);
}

function clampMaxTokens(
  model: Model<"anthropic-messages">,
  context: Context,
  requested: number,
): number {
  if (model.contextWindow <= 0) return Math.max(1, requested);
  const available = model.contextWindow - estimatedContextTokens(context) - 4096;
  return Math.min(requested, Math.max(1, available));
}

function remapMessageToolNames(
  message: AssistantMessage,
  names: ReadonlyMap<string, string>,
): void {
  for (const block of message.content) {
    if (block.type === "toolCall") {
      block.name = fromWireToolName(block.name, names);
    }
  }
}

function remapEvent(
  event: AssistantMessageEvent,
  names: ReadonlyMap<string, string>,
): void {
  if (event.type === "done") remapMessageToolNames(event.message, names);
  else if (event.type === "error") remapMessageToolNames(event.error, names);
  else remapMessageToolNames(event.partial, names);
  if (event.type === "toolcall_end") {
    event.toolCall.name = fromWireToolName(event.toolCall.name, names);
  }
}

function forwardWithToolNameMapping(
  inner: AssistantMessageEventStream,
  names: ReadonlyMap<string, string>,
  model: Model<"anthropic-messages">,
): AssistantMessageEventStream {
  const outer = createAssistantMessageEventStream();
  void (async () => {
    let finalMessage: AssistantMessage | undefined;
    try {
      for await (const event of inner) {
        remapEvent(event, names);
        if (event.type === "done") finalMessage = event.message;
        if (event.type === "error") finalMessage = event.error;
        outer.push(event);
      }
      outer.end(finalMessage ?? (await inner.result()));
    } catch (error) {
      const fallback: AssistantMessage = {
        role: "assistant",
        content: [],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "error",
        errorMessage: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      };
      outer.push({ type: "error", reason: "error", error: fallback });
      outer.end(fallback);
    }
  })();
  return outer;
}

type RawAnthropicOptions = SimpleStreamOptions & {
  thinkingEnabled?: boolean;
  thinkingBudgetTokens?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  thinkingDisplay?: "summarized" | "omitted";
  interleavedThinking?: boolean;
  toolChoice?: "auto" | "any" | "none" | { type: "tool"; name: string };
};

function streamClaudePlanWithOptions(
  model: Model<"anthropic-messages">,
  context: Context,
  options: RawAnthropicOptions,
  version: string,
): AssistantMessageEventStream {
  const accessToken = options.apiKey;
  if (!accessToken) {
    const stream = createAssistantMessageEventStream();
    const error: AssistantMessage = {
      role: "assistant",
      content: [],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "error",
      errorMessage: "No OAuth credential for claude-plan; run /login claude-plan",
      timestamp: Date.now(),
    };
    stream.push({ type: "error", reason: "error", error });
    stream.end(error);
    return stream;
  }

  const client = new Anthropic(
    buildAnthropicClientOptions(
      accessToken,
      model.baseUrl,
      model.headers,
      options.headers,
      version,
    ),
  );
  const callerPayloadHook = options.onPayload;
  const maxTokens = clampMaxTokens(
    model,
    context,
    options.maxTokens ?? model.maxTokens,
  );
  const advancedOptions: Record<string, unknown> = {
    ...options,
    client,
    maxTokens,
    onPayload: async (payload: unknown, hookModel: Model<Api>) => {
      const fingerprinted = fingerprintRequestPayload(payload, version);
      const replacement = await callerPayloadHook?.(fingerprinted, hookModel);
      return replacement === undefined ? fingerprinted : replacement;
    },
  };

  const anthropicApi = getApiProvider("anthropic-messages");
  if (!anthropicApi) {
    throw new Error("Pi's Anthropic Messages streamer is unavailable");
  }
  const toolNames = createToolNameMap(context);
  const inner = anthropicApi.stream(model, context, advancedOptions);
  return forwardWithToolNameMapping(inner, toolNames, model);
}

export function streamClaudePlanRaw(
  model: Model<"anthropic-messages">,
  context: Context,
  options: RawAnthropicOptions = {},
  version: string = CLAUDE_CODE_VERSION,
): AssistantMessageEventStream {
  return streamClaudePlanWithOptions(model, context, options, version);
}

export function streamClaudePlan(
  model: Model<"anthropic-messages">,
  context: Context,
  options: SimpleStreamOptions = {},
  version: string = CLAUDE_CODE_VERSION,
): AssistantMessageEventStream {
  const mapped: RawAnthropicOptions = { ...options };
  if (!options.reasoning) {
    mapped.thinkingEnabled = false;
  } else if (model.compat?.forceAdaptiveThinking === true) {
    mapped.thinkingEnabled = true;
    mapped.effort = mapAdaptiveEffort(model, options.reasoning);
  } else {
    const level = clampReasoning(options.reasoning);
    const budget = options.thinkingBudgets?.[level] ?? DEFAULT_THINKING_BUDGETS[level];
    const expandedMax = clampMaxTokens(
      model,
      context,
      Math.min((options.maxTokens ?? model.maxTokens) + budget, model.maxTokens),
    );
    mapped.maxTokens = expandedMax;
    mapped.thinkingEnabled = true;
    mapped.thinkingBudgetTokens = Math.min(
      budget,
      Math.max(0, expandedMax - 1024),
    );
  }
  return streamClaudePlanWithOptions(model, context, mapped, version);
}
