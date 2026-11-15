import { describe, expect, it } from "vitest";
import { handleStripeWebhook } from "./payments.server";

const org = "00000000-0000-4000-8000-000000000001";
const post = (headers: Record<string, string>, body = "{}") =>
  new Request(`https://charter.example/api/public/stripe/${org}`, {
    method: "POST",
    headers,
    body,
  });

describe("Stripe webhook guard", () => {
  it("turns away a badly formed organization id", async () => {
    expect(
      (await handleStripeWebhook("x'; drop", post({ "stripe-signature": "t=1,v1=a" }))).status,
    ).toBe(404);
  });
  it("turns away a request with no signature", async () => {
    expect((await handleStripeWebhook(org, post({}))).status).toBe(400);
  });
  it("turns away a body over 1 MB", async () => {
    const big = post({ "stripe-signature": "t=1,v1=a" }, "x".repeat(1_000_001));
    expect((await handleStripeWebhook(org, big)).status).toBe(413);
  });
});
