import type { Context, ProviderHeaders } from "@earendil-works/pi-ai";
import type Anthropic from "@anthropic-ai/sdk";
import { buildBillingHeaderValue } from "./cch.js";
import {
  CLAUDE_AGENT_IDENTITY,
  CLAUDE_CODE_VERSION,
  PI_IDENTITY_PREFIX,
  PI_PARAGRAPH_REMOVAL_ANCHORS,
  PI_TEXT_REPLACEMENTS,
  REQUIRED_BETAS,
  TOOL_PREFIX,
  formatUserAgent,
} from "./constants.js";

type UnknownRecord = Record<string, unknown>;
export type SystemBlock = { type: string; text: string; [key: string]: unknown };

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function sanitizePiSystemText(text: string): string {
  const kept = text.split(/\n\n+/).filter((paragraph) => {
    if (paragraph.includes(PI_IDENTITY_PREFIX)) return false;
    return !PI_PARAGRAPH_REMOVAL_ANCHORS.some((anchor) =>
      paragraph.includes(anchor),
    );
  });
  let sanitized = kept.join("\n\n");
  for (const { match, replacement } of PI_TEXT_REPLACEMENTS) {
    sanitized = sanitized.split(match).join(replacement);
  }
  return sanitized.trim();
}

function toSystemBlocks(system: unknown): SystemBlock[] {
  if (system == null) return [];
  const values = Array.isArray(system) ? system : [system];
  return values
    .map((value): SystemBlock => {
      if (typeof value === "string") {
        return { type: "text", text: sanitizePiSystemText(value) };
      }
      if (isRecord(value)) {
        return {
          ...value,
          type: typeof value.type === "string" ? value.type : "text",
          text: sanitizePiSystemText(
            typeof value.text === "string" ? value.text : "",
          ),
        } as SystemBlock;
      }
      return { type: "text", text: String(value) };
    })
    .filter(
      (block) =>
        block.text.length > 0 &&
        !block.text.startsWith("x-anthropic-billing-header:"),
    );
}

export function buildFingerprintSystem(
  system: unknown,
  messages: Array<{ role?: string; content?: unknown }>,
  version: string = CLAUDE_CODE_VERSION,
): SystemBlock[] {
  const blocks = toSystemBlocks(system);
  const identityIndex = blocks.findIndex(
    (block) => block.text === CLAUDE_AGENT_IDENTITY,
  );
  if (identityIndex >= 0) blocks.splice(identityIndex, 1);
  blocks.unshift({ type: "text", text: CLAUDE_AGENT_IDENTITY });

  if (messages.some((message) => message.role === "user")) {
    blocks.unshift({
      type: "text",
      text: buildBillingHeaderValue(
        messages as Array<{
          role?: string;
          content?: string | Array<{ type?: string; text?: string }>;
        }>,
        version,
      ),
    });
  }
  return blocks;
}

export function toWireToolName(name: string): string {
  if (name.startsWith(TOOL_PREFIX)) return name;
  return `${TOOL_PREFIX}${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

export function fromWireToolName(
  name: string,
  reverseNames?: ReadonlyMap<string, string>,
): string {
  const mapped = reverseNames?.get(name);
  if (mapped) return mapped;
  if (!name.startsWith(TOOL_PREFIX)) return name;
  const unprefixed = name.slice(TOOL_PREFIX.length);
  return `${unprefixed.charAt(0).toLowerCase()}${unprefixed.slice(1)}`;
}

export function createToolNameMap(context: Context): Map<string, string> {
  const names = new Map<string, string>();
  const remember = (name: string) => {
    const wireName = toWireToolName(name);
    const existing = names.get(wireName);
    if (existing && existing !== name) {
      throw new Error(
        `Claude Plan tool-name collision: ${existing} and ${name} both map to ${wireName}`,
      );
    }
    names.set(wireName, name);
  };
  for (const tool of context.tools ?? []) remember(tool.name);
  for (const message of context.messages) {
    if (message.role !== "assistant") continue;
    for (const block of message.content) {
      if (block.type === "toolCall") remember(block.name);
    }
  }
  return names;
}

function prefixPayloadTools(payload: UnknownRecord): void {
  if (Array.isArray(payload.tools)) {
    payload.tools = payload.tools.map((tool) => {
      if (!isRecord(tool) || typeof tool.name !== "string") return tool;
      return { ...tool, name: toWireToolName(tool.name) };
    });
  }
  if (Array.isArray(payload.messages)) {
    payload.messages = payload.messages.map((message) => {
      if (!isRecord(message) || !Array.isArray(message.content)) return message;
      return {
        ...message,
        content: message.content.map((block) => {
          if (
            !isRecord(block) ||
            block.type !== "tool_use" ||
            typeof block.name !== "string"
          ) {
            return block;
          }
          return { ...block, name: toWireToolName(block.name) };
        }),
      };
    });
  }
}

export function fingerprintRequestPayload(
  payload: unknown,
  version: string = CLAUDE_CODE_VERSION,
): unknown {
  if (!isRecord(payload)) return payload;
  const transformed: UnknownRecord = { ...payload };
  const messages = Array.isArray(transformed.messages)
    ? (transformed.messages.filter(isRecord) as Array<{
        role?: string;
        content?: unknown;
      }>)
    : [];
  transformed.system = buildFingerprintSystem(transformed.system, messages, version);
  prefixPayloadTools(transformed);
  return transformed;
}

export function buildRequestHeaders(
  modelHeaders?: Record<string, string>,
  optionHeaders?: ProviderHeaders,
  version: string = CLAUDE_CODE_VERSION,
): Record<string, string> {
  const headers: Record<string, string> = {};
  const betaFeatures = new Set<string>(REQUIRED_BETAS);
  for (const source of [modelHeaders, optionHeaders]) {
    for (const [name, value] of Object.entries(source ?? {})) {
      const lowerName = name.toLowerCase();
      if (lowerName === "authorization" || lowerName === "x-api-key") continue;
      if (lowerName === "anthropic-beta") {
        if (value !== null) {
          for (const feature of value.split(",")) {
            const trimmed = feature.trim();
            if (trimmed) betaFeatures.add(trimmed);
          }
        }
        continue;
      }
      const existingName = Object.keys(headers).find(
        (candidate) => candidate.toLowerCase() === lowerName,
      );
      if (existingName) delete headers[existingName];
      if (value !== null) headers[name] = value;
    }
  }
  headers.accept = "application/json";
  headers["anthropic-dangerous-direct-browser-access"] = "true";
  headers["anthropic-beta"] = [...betaFeatures].join(",");
  headers["user-agent"] = formatUserAgent(version);
  headers["x-app"] = "cli";
  return headers;
}

export function buildAnthropicClientOptions(
  accessToken: string,
  baseURL: string,
  modelHeaders?: Record<string, string>,
  optionHeaders?: ProviderHeaders,
  version: string = CLAUDE_CODE_VERSION,
): ConstructorParameters<typeof Anthropic>[0] {
  return {
    apiKey: null,
    authToken: accessToken,
    baseURL,
    defaultQuery: { beta: "true" },
    defaultHeaders: buildRequestHeaders(modelHeaders, optionHeaders, version),
    dangerouslyAllowBrowser: true,
  };
}
