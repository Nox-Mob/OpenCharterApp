// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  createStripeGateway,
  formEncode,
  isLiveKey,
  looksLikeStripeKey,
  parseStripeEvent,
} from "./stripe";

function stubFetch(status: number, json: unknown) {
  return vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify(json), { status }),
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe("formEncode", () => {
  it("encodes nested params the way Stripe expects", () => {
    expect(formEncode({ a: 1, b: { c: "x y", d: { 0: { e: 2 } } }, skip: undefined })).toBe(
      "a=1&b%5Bc%5D=x%20y&b%5Bd%5D%5B0%5D%5Be%5D=2",
    );
  });
});

describe("keys", () => {
  it("tells live from test keys", () => {
    expect(isLiveKey("sk_live_abc")).toBe(true);
    expect(isLiveKey("rk_test_abc")).toBe(false);
    expect(looksLikeStripeKey("rk_test_1234567890abcdef")).toBe(true);
    expect(looksLikeStripeKey("pk_test_1234567890")).toBe(false);
  });
});

describe("createStripeGateway", () => {
  const req = {
    paymentId: "pay_123",
    orgId: "org_1",
    amount: { amount_minor: 2500, currency: "USD" },
    description: "Regular · 1 year",
    successUrl: "https://app/done",
    cancelUrl: "https://app/cancel",
  };
  it("creates a Checkout Session with the amount, ids and an idempotency key", async () => {
    const f = stubFetch(200, { id: "cs_1", url: "https://checkout.stripe.com/c/cs_1" });
    const gw = createStripeGateway("rk_test_1234567890abc", f);
    expect(await gw.createCheckout(req)).toEqual({
      id: "cs_1",
      url: "https://checkout.stripe.com/c/cs_1",
    });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    const headers = init!.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer rk_test_1234567890abc");
    expect(headers["Idempotency-Key"]).toBe("checkout-pay_123");
    const body = new URLSearchParams(String(init!.body));
    expect(body.get("mode")).toBe("payment");
    expect(body.get("line_items[0][price_data][unit_amount]")).toBe("2500");
    expect(body.get("line_items[0][price_data][currency]")).toBe("usd");
    expect(body.get("metadata[payment_id]")).toBe("pay_123");
    expect(body.get("client_reference_id")).toBe("pay_123");
  });
  it("verifies a key and reports test mode", async () => {
    const gw = createStripeGateway("sk_test_1234567890abc", stubFetch(200, { data: [] }));
    expect(await gw.verify()).toEqual({
      ok: true,
      livemode: false,
      accountLabel: "Stripe (test mode)",
    });
  });
  it("explains a rejected or under-permissioned key", async () => {
    expect(
      await createStripeGateway(
        "sk_test_x",
        stubFetch(401, { error: { message: "bad" } }),
      ).verify(),
    ).toEqual({
      ok: false,
      reason: "Stripe didn't accept that key",
    });
    expect(
      await createStripeGateway("rk_test_x", stubFetch(403, { error: {} })).verify(),
    ).toMatchObject({ ok: false });
  });
  it("refunds a payment intent", async () => {
    const f = stubFetch(200, { id: "re_1" });
    expect(await createStripeGateway("sk_test_x", f).refund("pi_1")).toEqual({ refundId: "re_1" });
    expect(String(f.mock.calls[0]![1]!.body)).toBe("payment_intent=pi_1");
  });
  it("surfaces Stripe errors", async () => {
    await expect(
      createStripeGateway(
        "sk_test_x",
        stubFetch(402, { error: { message: "Your card was declined." } }),
      ).createCheckout(req),
    ).rejects.toThrow("Your card was declined.");
  });
});

describe("parseStripeEvent", () => {
  const session = (extra: Record<string, unknown> = {}) => ({
    id: "cs_1",
    payment_status: "paid",
    payment_intent: "pi_1",
    amount_total: 2500,
    currency: "usd",
    metadata: { payment_id: "pay_123" },
    ...extra,
  });
  it("turns a paid checkout into a success", () => {
    expect(
      parseStripeEvent({
        id: "evt_1",
        type: "checkout.session.completed",
        livemode: false,
        data: { object: session() },
      }),
    ).toEqual({
      type: "payment.succeeded",
      eventId: "evt_1",
      paymentId: "pay_123",
      gatewayRef: "pi_1",
      amount: { amount_minor: 2500, currency: "USD" },
      livemode: false,
    });
  });
  it("waits for delayed payment methods and ignores unknown events", () => {
    expect(
      parseStripeEvent({
        id: "evt_2",
        type: "checkout.session.completed",
        livemode: true,
        data: { object: session({ payment_status: "unpaid" }) },
      }).type,
    ).toBe("ignored");
    expect(
      parseStripeEvent({
        id: "evt_3",
        type: "customer.created",
        livemode: true,
        data: { object: {} },
      }).type,
    ).toBe("ignored");
  });
  it("maps expired and failed checkouts, and refunds", () => {
    expect(
      parseStripeEvent({
        id: "e",
        type: "checkout.session.expired",
        livemode: true,
        data: { object: session() },
      }),
    ).toMatchObject({ type: "payment.failed", paymentId: "pay_123", reason: "Checkout expired" });
    expect(
      parseStripeEvent({
        id: "e",
        type: "charge.refunded",
        livemode: true,
        data: { object: { payment_intent: "pi_1", amount_refunded: 2500, currency: "usd" } },
      }),
    ).toMatchObject({
      type: "payment.refunded",
      gatewayRef: "pi_1",
      amount: { amount_minor: 2500, currency: "USD" },
    });
  });
  it("rejects things that aren't events", () => {
    expect(() => parseStripeEvent({ nope: true })).toThrow("not a Stripe event");
  });
});
