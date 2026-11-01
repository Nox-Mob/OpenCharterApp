import type { GatewayEvent } from "@/engines/payments";
import { openSecret, type StripeCredentials } from "./secret-box";
import { parseStripeEvent } from "./stripe";
import { verifyStripeSignature } from "./webhook";

/**
 * Handles one Stripe webhook delivery for an org (E-12/E-13b). Pure apart from the injected
 * `apply`, which forwards the normalized event to the database (complete / fail / refund, each
 * idempotent per event id). Returns the HTTP status Stripe should see: 2xx stops retries.
 */
export type ApplyEvent = (event: Exclude<GatewayEvent, { type: "ignored" }>) => Promise<string>;

export async function processStripeWebhook(opts: {
  rawBody: string;
  signature: string | null;
  sealedCredentials: string | null;
  encryptionKey: string | undefined;
  apply: ApplyEvent;
  nowSeconds?: number;
}): Promise<{ status: number; body: string }> {
  if (!opts.encryptionKey) return { status: 503, body: "payments not configured" };
  if (!opts.sealedCredentials)
    return { status: 404, body: "no Stripe connection for this organization" };
  let creds: StripeCredentials;
  try {
    creds = JSON.parse(
      await openSecret(opts.sealedCredentials, opts.encryptionKey),
    ) as StripeCredentials;
  } catch {
    return { status: 500, body: "credentials unreadable" };
  }
  const check = await verifyStripeSignature(
    opts.rawBody,
    opts.signature,
    creds.webhookSecret,
    opts.nowSeconds,
  );
  if (!check.ok) return { status: 400, body: check.reason };
  let event: GatewayEvent;
  try {
    event = parseStripeEvent(JSON.parse(opts.rawBody));
  } catch {
    return { status: 400, body: "not a Stripe event" };
  }
  if (event.type === "ignored") return { status: 200, body: `ignored: ${event.reason}` };
  const result = await opts.apply(event);
  return { status: 200, body: result };
}
