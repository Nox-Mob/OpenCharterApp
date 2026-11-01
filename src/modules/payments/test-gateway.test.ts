// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createTestGateway,
  isDemoOrgId,
  testCheckoutPath,
  testOutcomeEvent,
  TEST_OUTCOMES,
} from "./test-gateway";

const amount = { amount_minor: 2500, currency: "USD" };

describe("test gateway", () => {
  it("offers the outcomes of Stripe's test cards", () => {
    expect(TEST_OUTCOMES.map((o) => o.value)).toEqual([
      "accepted",
      "declined",
      "insufficient_funds",
      "slow",
      "cancel",
    ]);
  });
  it("turns outcomes into the same events Stripe produces, never live", () => {
    expect(testOutcomeEvent("accepted", "pay_1", amount, "e1")).toEqual({
      type: "payment.succeeded",
      eventId: "e1",
      paymentId: "pay_1",
      gatewayRef: "test_pay_pay_1",
      amount,
      livemode: false,
    });
    expect(testOutcomeEvent("slow", "pay_1", amount, "e2")?.type).toBe("payment.succeeded");
    expect(testOutcomeEvent("declined", "pay_1", amount, "e3")).toMatchObject({
      type: "payment.failed",
      reason: "Your card was declined.",
      livemode: false,
    });
    expect(testOutcomeEvent("insufficient_funds", "pay_1", amount, "e4")).toMatchObject({
      reason: "Your card has insufficient funds.",
    });
    expect(testOutcomeEvent("cancel", "pay_1", amount)).toBeNull();
  });
  it("gives each click its own event id unless one is supplied", () => {
    const a = testOutcomeEvent("accepted", "p", amount);
    const b = testOutcomeEvent("accepted", "p", amount);
    expect(a?.eventId).not.toBe(b?.eventId);
  });
  it("checks out on our own page and verifies instantly", async () => {
    const gw = createTestGateway("https://app.example");
    expect(await gw.verify()).toEqual({ ok: true, accountLabel: "Test payments", livemode: false });
    const s = await gw.createCheckout({
      paymentId: "pay 1",
      orgId: "o",
      amount,
      description: "x",
      successUrl: "",
      cancelUrl: "",
    });
    expect(s.url).toBe("https://app.example/pay/test/pay%201");
    expect(testCheckoutPath("abc")).toBe("/pay/test/abc");
  });
  it("is limited to demo orgs", () => {
    expect(isDemoOrgId("d1000000-0000-4000-8000-000000000001")).toBe(true);
    expect(isDemoOrgId("22222222-0000-4000-8000-000000000001")).toBe(false);
  });
});
