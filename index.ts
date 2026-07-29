import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createClaudePlanProvider } from "./src/provider.js";

export default function claudePlanExtension(pi: ExtensionAPI): void {
  pi.registerProvider(createClaudePlanProvider());
}
