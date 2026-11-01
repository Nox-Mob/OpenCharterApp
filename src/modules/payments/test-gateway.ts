import type { CheckoutRequest, GatewayEvent, Money, PaymentGateway } from "@/engines/payments";

/**
 * Test gateway for demo orgs (E-12, D-129). Checkout opens our own page, /pay/test/$paymentId,
 * whose buttons mimic Stripe's test cards. Each outcome becomes the same GatewayEvent a
 * Stripe webhook would produce, so joining, approval, renewal and refunds run the real path.
 * Payments made this way are marked livemode = false ("Test") everywhere.
 */
export const TEST_OUTCOMES = [
  { value: "accepted", label: "Card accepted", card: "4242 4242 4242 4242" },
  { value: "declined", label: "Card declined", card: "4000 0000 0000 0002" },
  { value: "insufficient_funds", label: "Insufficient funds", card: "4000 0000 0000 9995" },
  { value: "slow", label: "Accepted, slow confirmation", card: "4242 4242 4242 4242" },
  { value: "cancel", label: "Cancel", card: "" },
] as const;
export type TestOutcome = (typeof TEST_OUTCOMES)[number]["value"];

export const TEST_DECLINE_REASONS: Record<"declined" | "insufficient_funds", string> = {
  declined: "Your card was declined.",
  insufficient_funds: "Your card has insufficient funds.",
};

/** How long "slow confirmation" holds the result back, to exercise the waiting page. */
export const SLOW_CONFIRMATION_MS = 4000;

export function testCheckoutPath(paymentId: string): string {
  return `/pay/test/${encodeURIComponent(paymentId)}`;
}

/** The event a test outcome produces, or null for Cancel (nothing happens, like closing Checkout). */
export function testOutcomeEvent(
  outcome: TestOutcome,
  paymentId: string,
  amount: Money,
  eventId: string = `test_evt_${crypto.randomUUID()}`,
): GatewayEvent | null {
  switch (outcome) {
    case "accepted":
    case "slow":
      return {
        type: "payment.succeeded",
        eventId,
        paymentId,
        gatewayRef: `test_pay_${paymentId}`,
        amount,
        livemode: false,
      };
    case "declined":
    case "insufficient_funds":
      return {
        type: "payment.failed",
        eventId,
        paymentId,
        reason: TEST_DECLINE_REASONS[outcome],
        livemode: false,
      };
    case "cancel":
      return null;
  }
}

export function createTestGateway(origin: string): PaymentGateway {
  return {
    kind: "test",
    async verify() {
      return { ok: true, accountLabel: "Test payments", livemode: false };
    },
    async createCheckout(req: CheckoutRequest) {
      return { id: `test_cs_${req.paymentId}`, url: `${origin}${testCheckoutPath(req.paymentId)}` };
    },
    async refund(gatewayRef: string) {
      return { refundId: `test_re_${gatewayRef}` };
    },
  };
}

/** Demo orgs (docs/demo-data.md) may use the test gateway; the database enforces the same. */
export const isDemoOrgId = (orgId: string) => orgId.startsWith("d1000000-");
