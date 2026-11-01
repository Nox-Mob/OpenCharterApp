/**
 * Encrypts each organization's gateway credentials at rest (E-12, D-127): AES-256-GCM with
 * the server secret GATEWAY_ENCRYPTION_KEY (32 bytes, base64). Only ciphertext is stored, in
 * private.gateway_secrets, which the API never exposes. Format: `v1:<iv b64>:<ciphertext b64>`.
 */
const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function importKey(keyB64: string): Promise<CryptoKey> {
  let raw: Uint8Array;
  try {
    raw = fromB64(keyB64.trim());
  } catch {
    throw new Error("GATEWAY_ENCRYPTION_KEY must be base64");
  }
  if (raw.length !== 32) throw new Error("GATEWAY_ENCRYPTION_KEY must be 32 bytes (base64)");
  return crypto.subtle.importKey("raw", raw as BufferSource, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function sealSecret(plaintext: string, keyB64: string): Promise<string> {
  const key = await importKey(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `v1:${toB64(iv)}:${toB64(new Uint8Array(ct))}`;
}

export async function openSecret(sealed: string, keyB64: string): Promise<string> {
  const [version, ivB64, ctB64] = sealed.split(":");
  if (version !== "v1" || !ivB64 || !ctB64) throw new Error("unknown secret format");
  const key = await importKey(keyB64);
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(ivB64) },
      key,
      fromB64(ctB64),
    );
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error("could not decrypt the gateway credentials");
  }
}

/** The credentials stored per org (sealed as one JSON string). */
export type StripeCredentials = { secretKey: string; webhookSecret: string };
