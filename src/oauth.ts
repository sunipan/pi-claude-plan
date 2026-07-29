import type {
  AuthInteraction,
  OAuthCredential,
  OAuthAuth,
} from "@earendil-works/pi-ai";
import {
  AUTHORIZE_URL,
  CLIENT_ID,
  CODE_CALLBACK_URL,
  EXPIRY_SKEW_MS,
  OAUTH_SCOPES,
  TOKEN_URL,
} from "./constants.js";
import { generatePKCE } from "./pkce.js";

export interface CallbackParams {
  code: string;
  state: string;
}

export interface AuthorizationRequest {
  url: string;
  redirectUri: string;
  state: string;
  verifier: string;
}

interface TokenResponse {
  refresh_token?: string;
  access_token?: string;
  expires_in?: number;
}

export function parseCallbackInput(input: string): CallbackParams | null {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (code && state) return { code, state };
  } catch {
    // Continue with the manual formats accepted by the hosted callback page.
  }

  const hashIndex = trimmed.indexOf("#");
  if (hashIndex > 0 && hashIndex < trimmed.length - 1) {
    return {
      code: trimmed.slice(0, hashIndex),
      state: trimmed.slice(hashIndex + 1),
    };
  }

  const params = new URLSearchParams(trimmed);
  const code = params.get("code");
  const state = params.get("state");
  return code && state ? { code, state } : null;
}

export async function createAuthorizationRequest(): Promise<AuthorizationRequest> {
  const pkce = await generatePKCE();
  const state = crypto.randomUUID().replaceAll("-", "");
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("code", "true");
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", CODE_CALLBACK_URL);
  url.searchParams.set("scope", OAUTH_SCOPES.join(" "));
  url.searchParams.set("code_challenge", pkce.challenge);
  url.searchParams.set("code_challenge_method", pkce.method);
  url.searchParams.set("state", state);
  return {
    url: url.toString(),
    redirectUri: CODE_CALLBACK_URL,
    state,
    verifier: pkce.verifier,
  };
}

function tokenExpiry(expiresIn: number): number {
  return Date.now() + Math.max(0, expiresIn * 1000 - EXPIRY_SKEW_MS);
}

function toCredential(json: TokenResponse, fallbackRefresh?: string): OAuthCredential {
  const refresh = json.refresh_token ?? fallbackRefresh;
  if (!json.access_token || !refresh || !Number.isFinite(json.expires_in)) {
    throw new Error("Anthropic OAuth token response was incomplete");
  }
  return {
    type: "oauth",
    access: json.access_token,
    refresh,
    expires: tokenExpiry(json.expires_in as number),
  };
}

async function requestToken(
  body: Record<string, string>,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(TOKEN_URL, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
      "User-Agent": "axios/1.13.6",
    },
    body: JSON.stringify(body),
  });
}

export async function exchangeAuthorizationCode(
  input: string,
  authorization: Pick<AuthorizationRequest, "verifier" | "redirectUri" | "state">,
  signal?: AbortSignal,
): Promise<OAuthCredential> {
  const callback = parseCallbackInput(input);
  if (!callback) throw new Error("Invalid Anthropic OAuth callback value");
  if (callback.state !== authorization.state) {
    throw new Error("Anthropic OAuth state mismatch");
  }
  const response = await requestToken(
    {
      code: callback.code,
      state: callback.state,
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      redirect_uri: authorization.redirectUri,
      code_verifier: authorization.verifier,
    },
    signal,
  );
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Anthropic OAuth token exchange failed (${response.status})`);
  }
  return toCredential((await response.json()) as TokenResponse);
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Anthropic OAuth refresh aborted"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("Anthropic OAuth refresh aborted"));
      },
      { once: true },
    );
  });
}

export async function refreshOAuthCredential(
  credential: OAuthCredential,
  signal?: AbortSignal,
): Promise<OAuthCredential> {
  const maxRetries = 2;
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (attempt > 0) await wait(500 * 2 ** (attempt - 1), signal);
    try {
      const response = await requestToken(
        {
          grant_type: "refresh_token",
          refresh_token: credential.refresh,
          client_id: CLIENT_ID,
        },
        signal,
      );
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        if (response.status >= 500 && attempt < maxRetries) continue;
        throw new Error(`Anthropic OAuth token refresh failed (${response.status})`);
      }
      return toCredential(
        (await response.json()) as TokenResponse,
        credential.refresh,
      );
    } catch (error) {
      lastError = error;
      if (signal?.aborted || attempt === maxRetries) break;
      if (error instanceof Error && !/fetch failed|ECONN|ETIMEDOUT|UND_ERR/.test(error.message)) {
        throw error;
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Anthropic OAuth token refresh failed");
}

async function login(interaction: AuthInteraction): Promise<OAuthCredential> {
  const authorization = await createAuthorizationRequest();
  interaction.notify({
    type: "auth_url",
    url: authorization.url,
    instructions:
      "Authorize Claude Pro/Max, then paste the full platform callback URL or code#state value.",
  });
  const callback = await interaction.prompt({
    type: "manual_code",
    message: "Paste the Anthropic platform callback URL or code#state:",
  });
  return exchangeAuthorizationCode(callback, authorization, interaction.signal);
}

export function claudePlanOAuth(): OAuthAuth {
  return {
    name: "Claude Plan (separate Pro/Max OAuth)",
    loginLabel: "Sign in with Claude Pro/Max (unsupported plan routing)",
    login,
    refresh: refreshOAuthCredential,
    async toAuth(credential) {
      return { apiKey: credential.access };
    },
  };
}
