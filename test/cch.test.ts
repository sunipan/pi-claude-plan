import { describe, expect, it } from "vitest";
import {
  buildBillingHeaderValue,
  computeCCH,
  computeVersionSuffix,
  extractFirstUserMessageText,
} from "../src/cch.js";

describe("billing header", () => {
  it("extracts the first user text block", () => {
    expect(
      extractFirstUserMessageText([
        { role: "assistant", content: "ignore" },
        {
          role: "user",
          content: [
            { type: "image" },
            { type: "text", text: "hello world test message" },
          ],
        },
      ]),
    ).toBe("hello world test message");
  });

  it("matches the reference hashes and billing shape", () => {
    expect(computeCCH("hello world test message")).toBe("4ffc3");
    expect(computeVersionSuffix("hello world test message", "2.1.87")).toBe(
      "6ff",
    );
    expect(
      buildBillingHeaderValue(
        [{ role: "user", content: "hello world test message" }],
        "2.1.87",
        "sdk-cli",
      ),
    ).toBe(
      "x-anthropic-billing-header: cc_version=2.1.87.6ff; cc_entrypoint=sdk-cli; cch=4ffc3;",
    );
  });
});
