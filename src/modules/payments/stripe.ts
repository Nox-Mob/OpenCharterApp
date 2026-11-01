import {
  GatewayError,
  type CheckoutRequest,
  type CheckoutSession,
  type GatewayEvent,
  type Money,
  type PaymentGateway,
  type VerifyResult,
} from "@/engines/payments";

/**
 * Stripe adapter (E-12, D-105, D-127): plain REST over fetch, no SDK, so it runs on edge
 * workers. Direct mode only: each org uses its own (restricted) secret key. Connect mode and
 * the national fee come with E-21.
 */
const API = "https://api.stripe.com/v1";

/** Stripe's form encoding: nested keys as a[b][c]=v. */
export function formEncode(params: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") parts.push(formEncode(v as Record<string, unknown>, key));
    else parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return parts.filter(Boolean).join("&");
}

export const isLiveKey = (key: string) => /^(sk|rk)_live_/.test(key);
export const looksLikeStripeKey = (key: string) =>
  /^(sk|rk)_(live|test)_[A-Za-z0-9]{10,}$/.test(key);
export const looksLikeWebhookSecret = (s: string) => /^whsec_[A-Za-z0-9]{10,}$/.test(s);

export function createStripeGateway(
  secretKey: string,
  fetchImpl: typeof fetch = fetch,
): PaymentGateway {
  async function call<T>(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<T> {
    const headers: Record<string, string> = { Authorization: `Bearer ${secretKey}` };
    if (body) headers["Content-Type"] = "application/x-www-form-urlencoded";
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    const res = await fetchImpl(`${API}${path}`, {
      method,
      headers,
      ...(body ? { body: formEncode(body) } : {}),
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string };
    } & T;
    if (!res.ok)
      throw new GatewayError(
        json.error?.message ?? `Stripe error ${res.status}`,
        res.status,
        json.error?.code,
      );
    return json;
  }

  return {
    kind: "stripe",
    async verify(): Promise<VerifyResult> {
      try {
        // Needs only "Checkout Sessions: read", which the restricted key needs anyway.
        await call("GET", "/checkout/sessions?limit=1");
        const live = isLiveKey(secretKey);
        return { ok: true, livemode: live, accountLabel: live ? "Stripe" : "Stripe (test mode)" };
      } catch (e) {
        const err = e as GatewayError;
        return {
          ok: false,
          reason:
            err.status === 401
              ? "Stripe didn't accept that key"
              : err.status === 403
                ? "That key isn't allowed to create checkout sessions"
                : "Couldn't reach Stripe",
        };
      }
    },
    async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
      const s = await call<{ id: string; url: string }>(
        "POST",
        "/checkout/sessions",
        {
          mode: "payment",
          client_reference_id: req.paymentId,
          success_url: req.successUrl,
          cancel_url: req.cancelUrl,
          customer_email: req.customerEmail,
          metadata: { payment_id: req.paymentId, org_id: req.orgId },
          payment_intent_data: { metadata: { payment_id: req.paymentId, org_id: req.orgId } },
          line_items: {
            0: {
              quantity: 1,
              price_data: {
                currency: req.amount.currency.toLowerCase(),
                unit_amount: req.amount.amount_minor,
                product_data: { name: req.description },
              },
            },
          },
        },
        `checkout-${req.paymentId}`,
      );
      return { id: s.id, url: s.url };
    },
    async refund(gatewayRef: string, amount?: Money) {
      const r = await call<{ id: string }>(
        "POST",
        "/refunds",
        { payment_intent: gatewayRef, amount: amount?.amount_minor },
        `refund-${gatewayRef}-${amount?.amount_minor ?? "full"}`,
      );
      return { refundId: r.id };
    },
  };
}

type StripeEvent = {
  id: string;
  type: string;
  livemode: boolean;
  data: { object: Record<string, unknown> };
};

/** Normalize a (signature-verified) Stripe event into a GatewayEvent. */
export function parseStripeEvent(raw: unknown): GatewayEvent {
  const e = raw as StripeEvent;
  if (!e || typeof e.id !== "string" || !e.data?.object)
    throw new GatewayError("not a Stripe event");
  const o = e.data.object;
  const meta = (o["metadata"] ?? {}) as Record<string, string>;
  const paymentId = meta["payment_id"] ?? (o["client_reference_id"] as string | undefined);
  const currency = String(o["currency"] ?? "usd").toUpperCase();
  switch (e.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      if (o["payment_status"] !== "paid")
        return { type: "ignored", eventId: e.id, reason: "payment not finished yet" };
      if (!paymentId) return { type: "ignored", eventId: e.id, reason: "no payment id" };
      return {
        type: "payment.succeeded",
        eventId: e.id,
        paymentId,
        gatewayRef: String(o["payment_intent"] ?? o["id"]),
        amount: { amount_minor: Number(o["amount_total"] ?? 0), currency },
        livemode: e.livemode,
      };
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired":
      if (!paymentId) return { type: "ignored", eventId: e.id, reason: "no payment id" };
      return {
        type: "payment.failed",
        eventId: e.id,
        paymentId,
        reason: e.type === "checkout.session.expired" ? "Checkout expired" : "Payment failed",
        livemode: e.livemode,
      };
    case "charge.refunded":
      return {
        type: "payment.refunded",
        eventId: e.id,
        gatewayRef: String(o["payment_intent"] ?? ""),
        amount: { amount_minor: Number(o["amount_refunded"] ?? 0), currency },
        livemode: e.livemode,
      };
    default:
      return { type: "ignored", eventId: e.id, reason: `unhandled ${e.type}` };
  }
}
