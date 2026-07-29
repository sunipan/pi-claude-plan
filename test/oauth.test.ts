import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLIENT_ID,
  CODE_CALLBACK_URL,
  EXPIRY_SKEW_MS,
  OAUTH_SCOPES,
} from "../src/constants.js";
import {
  createAuthorizationRequest,
  exchangeAuthorizationCode,
  parseCallbackInput,
  refreshOAuthCredential,
} from "../src/oauth.js";
import { generatePKCE } from "../src/pkce.js";

afterEach(() => vi.restoreAllMocks());

describe("PKCE and OAuth callback handling", () => {
  it("generates RFC 7636 S256 values", async () => {
    const first = await generatePKCE();
    const second = await generatePKCE();
    expect(first.method).toBe("S256");
    expect(first.verifier).toMatch(/^[A-Za-z0-9_-]{86}$/);
    expect(first.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.verifier).not.toBe(second.verifier);
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(first.verifier),
    );
    expect(Buffer.from(digest).toString("base64url")).toBe(first.challenge);
  });

  it("uses the hosted platform callback and independent random state", async () => {
    const authorization = await createAuthorizationRequest();
    const url = new URL(authorization.url);
    expect(url.origin).toBe("https://claude.ai");
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(CODE_CALLBACK_URL);
    expect(url.searchParams.get("scope")).toBe(OAUTH_SCOPES.join(" "));
    expect(url.searchParams.get("state")).toBe(authorization.state);
    expect(authorization.state).not.toBe(authorization.verifier);
    expect(authorization.redirectUri).not.toContain("localhost");
  });

  it("parses full URLs, code#state, and query strings", () => {
    expect(
      parseCallbackInput(
        `${CODE_CALLBACK_URL}?code=url-code&state=url-state`,
      ),
    ).toEqual({ code: "url-code", state: "url-state" });
    expect(parseCallbackInput("hash-code#hash-state")).toEqual({
      code: "hash-code",
      state: "hash-state",
    });
    expect(parseCallbackInput("code=query-code&state=query-state")).toEqual({
      code: "query-code",
      state: "query-state",
    });
    expect(parseCallbackInput("invalid")).toBeNull();
  });

  it("rejects state mismatch before making a token request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(
      exchangeAuthorizationCode("code#wrong", {
        state: "expected",
        verifier: "verifier",
        redirectUri: CODE_CALLBACK_URL,
      }),
    ).rejects.toThrow("state mismatch");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exchanges code and state and applies expiry skew", async () => {
    let requestBody: Record<string, string> | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, string>;
      return new Response(
        JSON.stringify({
          access_token: "test-access",
          refresh_token: "test-refresh",
          expires_in: 3600,
        }),
        { status: 200 },
      );
    });
    const before = Date.now();
    const credential = await exchangeAuthorizationCode("test-code#test-state", {
      state: "test-state",
      verifier: "test-verifier",
      redirectUri: CODE_CALLBACK_URL,
    });
    const after = Date.now();
    expect(requestBody).toMatchObject({
      code: "test-code",
      state: "test-state",
      code_verifier: "test-verifier",
      redirect_uri: CODE_CALLBACK_URL,
      client_id: CLIENT_ID,
    });
    expect(credential).toMatchObject({
      type: "oauth",
      access: "test-access",
      refresh: "test-refresh",
    });
    expect(credential.expires).toBeGreaterThanOrEqual(
      before + 3600_000 - EXPIRY_SKEW_MS,
    );
    expect(credential.expires).toBeLessThanOrEqual(
      after + 3600_000 - EXPIRY_SKEW_MS,
    );
  });

  it("refreshes with the stored refresh token and persists token rotation", async () => {
    let requestBody: Record<string, string> | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, string>;
      return new Response(
        JSON.stringify({
          access_token: "rotated-access",
          refresh_token: "rotated-refresh",
          expires_in: 7200,
        }),
        { status: 200 },
      );
    });
    const refreshed = await refreshOAuthCredential({
      type: "oauth",
      access: "old-access",
      refresh: "old-refresh",
      expires: 0,
    });
    expect(requestBody).toEqual({
      grant_type: "refresh_token",
      refresh_token: "old-refresh",
      client_id: CLIENT_ID,
    });
    expect(refreshed).toMatchObject({
      type: "oauth",
      access: "rotated-access",
      refresh: "rotated-refresh",
    });
    expect(refreshed.expires).toBeGreaterThan(
      Date.now() + 7200_000 - EXPIRY_SKEW_MS - 1000,
    );
  });
});
