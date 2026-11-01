// Server only: reads sealed gateway credentials with the service role. Import it dynamically
// inside server handlers (`await import("./payments.server")`) so it never ships to browsers.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { GatewayEvent, PaymentGateway } from "@/engines/payments";
import type { FullDatabase } from "@/lib/db/pending-schema";
import { isMissingSchemaError } from "@/lib/db/readiness";
import { openSecret, type StripeCredentials } from "./secret-box";
import { createStripeGateway } from "./stripe";
import { createTestGateway } from "./test-gateway";
import { processStripeWebhook } from "./webhook-handler";

const admin = () => supabaseAdmin as unknown as SupabaseClient<FullDatabase>;
const encryptionKey = () => process.env["GATEWAY_ENCRYPTION_KEY"];

/** The org's own gateway, ready to use, or null when it has no verified connection. */
export async function loadOrgGateway(
  orgId: string,
  origin: string,
): Promise<PaymentGateway | null> {
  const db = admin();
  const { data: conn, error } = await db
    .from("gateway_connections")
    .select("gateway,status")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (!conn || conn.status !== "verified") return null;
  if (conn.gateway === "test") return createTestGateway(origin);
  const { data: sealed, error: e2 } = await db.rpc("gateway_sealed_credentials", { _org: orgId });
  if (e2) throw e2;
  const key = encryptionKey();
  if (!sealed || !key) return null;
  const creds = JSON.parse(await openSecret(sealed, key)) as StripeCredentials;
  return createStripeGateway(creds.secretKey);
}

/** Forward a normalized gateway event to the database (idempotent per event id). */
export async function applyGatewayEvent(
  event: Exclude<GatewayEvent, { type: "ignored" }>,
): Promise<string> {
  const db = admin();
  const { data, error } =
    event.type === "payment.succeeded"
      ? await db.rpc("complete_gateway_payment", {
          _event_id: event.eventId,
          _payment: event.paymentId,
          _gateway_ref: event.gatewayRef,
          _amount_minor: event.amount.amount_minor,
          _currency: event.amount.currency,
          _livemode: event.livemode,
        })
      : event.type === "payment.failed"
        ? await db.rpc("fail_gateway_payment", {
            _event_id: event.eventId,
            _payment: event.paymentId,
            _reason: event.reason,
          })
        : await db.rpc("mark_payment_refunded", {
            _event_id: event.eventId,
            _gateway: "stripe",
            _gateway_ref: event.gatewayRef,
            _amount_minor: event.amount.amount_minor,
          });
  if (error) throw error;
  return String(data);
}

/** POST /api/public/stripe/$orgId: one endpoint per org, verified with that org's secret. */
export async function handleStripeWebhook(orgId: string, request: Request): Promise<Response> {
  const rawBody = await request.text();
  const { data: sealed, error } = await admin().rpc("gateway_sealed_credentials", { _org: orgId });
  if (error)
    return new Response(isMissingSchemaError(error) ? "database update needed" : "error", {
      status: isMissingSchemaError(error) ? 503 : 500,
    });
  const r = await processStripeWebhook({
    rawBody,
    signature: request.headers.get("stripe-signature"),
    sealedCredentials: sealed ?? null,
    encryptionKey: encryptionKey(),
    apply: applyGatewayEvent,
  });
  return new Response(r.body, { status: r.status, headers: { "content-type": "text/plain" } });
}
