import { createHash } from "node:crypto";
import {
  CCH_POSITIONS,
  CCH_SALT,
  CLAUDE_CODE_ENTRYPOINT,
  CLAUDE_CODE_VERSION,
} from "./constants.js";

type MessageLike = {
  role?: string;
  content?: string | Array<{ type?: string; text?: string }>;
};

export function extractFirstUserMessageText(messages: MessageLike[]): string {
  const message = messages.find((candidate) => candidate.role === "user");
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  return message.content?.find((block) => block.type === "text")?.text ?? "";
}

export function computeCCH(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 5);
}

export function computeVersionSuffix(
  text: string,
  version = CLAUDE_CODE_VERSION,
): string {
  const sampled = CCH_POSITIONS.map((position) => text[position] || "0").join("");
  return createHash("sha256")
    .update(`${CCH_SALT}${sampled}${version}`)
    .digest("hex")
    .slice(0, 3);
}

export function buildBillingHeaderValue(
  messages: MessageLike[],
  version = CLAUDE_CODE_VERSION,
  entrypoint = CLAUDE_CODE_ENTRYPOINT,
): string {
  const text = extractFirstUserMessageText(messages);
  return (
    "x-anthropic-billing-header: " +
    `cc_version=${version}.${computeVersionSuffix(text, version)}; ` +
    `cc_entrypoint=${entrypoint}; cch=${computeCCH(text)};`
  );
}
