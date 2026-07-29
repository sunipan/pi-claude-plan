function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export async function generatePKCE(): Promise<{
  verifier: string;
  challenge: string;
  method: "S256";
}> {
  const random = crypto.getRandomValues(new Uint8Array(64));
  const verifier = base64UrlEncode(random);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return {
    verifier,
    challenge: base64UrlEncode(new Uint8Array(digest)),
    method: "S256",
  };
}
