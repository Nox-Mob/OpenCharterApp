// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { processStripeWebhook } from "./webhook-handler";
import { sealSecret } from "./secret-box";
import { signStripePayload } from "./webhook";

const key = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i + 1)));
const webhookSecret = "whsec_unit_test_secret_123";
const now = 1_790_000_000;
const event = {
  id: "evt_1",
  type: "checkout.session.completed",
  livemode: false,
  data: {
    object: {
      payment_status: "paid",
      payment_intent: "pi_1",
      amount_total: 2500,
      currency: "usd",
      metadata: { payment_id: "pay_1" },
    },
  },
};

async function setup() {
  const sealed = await sealSecret(JSON.stringify({ secretKey: "sk_test_x", webhookSecret }), key);
  const rawBody = JSON.stringify(event);
  const signature = await signStripePayload(rawBody, webhookSecret, now);
  return { sealed, rawBody, signature };
}

describe("processStripeWebhook", () => {
  it("verifies, parses and applies a payment", async () => {
    const { sealed, rawBody, signature } = await setup();
    const apply = vi.fn(async () => "active");
    const r = await processStripeWebhook({
      rawBody,
      signature,
      sealedCredentials: sealed,
      encryptionKey: key,
      apply,
      nowSeconds: now,
    });
    expect(r).toEqual({ status: 200, body: "active" });
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "payment.succeeded",
        paymentId: "pay_1",
        gatewayRef: "pi_1",
      }),
    );
  });
  it("rejects bad signatures without touching the database", async () => {
    const { sealed, rawBody } = await setup();
    const apply = vi.fn(async () => "x");
    const r = await processStripeWebhook({
      rawBody,
      signature: "t=1,v1=00",
      sealedCredentials: sealed,
      encryptionKey: key,
      apply,
      nowSeconds: now,
    });
    expect(r.status).toBe(400);
    expect(apply).not.toHaveBeenCalled();
  });
  it("answers 404 for orgs without a connection and 503 when not configured", async () => {
    const { rawBody, signature } = await setup();
    const apply = vi.fn(async () => "x");
    expect(
      (
        await processStripeWebhook({
          rawBody,
          signature,
          sealedCredentials: null,
          encryptionKey: key,
          apply,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await processStripeWebhook({
          rawBody,
          signature,
          sealedCredentials: "v1:a:b",
          encryptionKey: undefined,
          apply,
        })
      ).status,
    ).toBe(503);
  });
  it("acknowledges events it doesn't need", async () => {
    const { sealed } = await setup();
    const rawBody = JSON.stringify({
      id: "evt_2",
      type: "customer.created",
      livemode: false,
      data: { object: {} },
    });
    const signature = await signStripePayload(rawBody, webhookSecret, now);
    const apply = vi.fn(async () => "x");
    const r = await processStripeWebhook({
      rawBody,
      signature,
      sealedCredentials: sealed,
      encryptionKey: key,
      apply,
      nowSeconds: now,
    });
    expect(r.status).toBe(200);
    expect(apply).not.toHaveBeenCalled();
  });
});
