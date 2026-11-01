/**
 * Stripe webhook signatures (E-12). Stripe signs `${timestamp}.${rawBody}` with the
 * endpoint's signing secret (HMAC-SHA256) and sends `Stripe-Signature: t=…,v1=…`.
 * The raw body must be verified exactly as received, before parsing it. Uses WebCrypto so it
 * runs on edge workers.
 */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export type SignatureCheck = { ok: true } | { ok: false; reason: string };

const encoder = new TextEncoder();

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time comparison of two hex strings. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function parseSignatureHeader(
  header: string,
): { timestamp: number; signatures: string[] } | null {
  let timestamp = NaN;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2).map((x) => x?.trim());
    if (k === "t") timestamp = Number(v);
    else if (k === "v1" && v) signatures.push(v);
  }
  if (!Number.isFinite(timestamp) || signatures.length === 0) return null;
  return { timestamp, signatures };
}

export async function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<SignatureCheck> {
  if (!header) return { ok: false, reason: "missing signature" };
  const parsed = parseSignatureHeader(header);
  if (!parsed) return { ok: false, reason: "malformed signature" };
  if (Math.abs(nowSeconds - parsed.timestamp) > SIGNATURE_TOLERANCE_SECONDS)
    return { ok: false, reason: "timestamp outside tolerance" };
  const expected = await hmacHex(secret, `${parsed.timestamp}.${rawBody}`);
  return parsed.signatures.some((s) => safeEqual(s, expected))
    ? { ok: true }
    : { ok: false, reason: "signature mismatch" };
}

/** Builds a signature header the way Stripe does (for tests and the test gateway). */
export async function signStripePayload(rawBody: string, secret: string, timestamp: number) {
  return `t=${timestamp},v1=${await hmacHex(secret, `${timestamp}.${rawBody}`)}`;
}
