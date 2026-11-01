/**
 * Payment gateway abstraction (E-12, D-043). Each organization connects its own account
 * (D-040, D-105). Adapters (Stripe, the demo test gateway) implement PaymentGateway, and
 * every gateway's callbacks are normalized into GatewayEvent so one code path completes,
 * fails or refunds a payment, whichever gateway it came from.
 * Money is always integer minor units with an ISO currency code.
 */
export type Money = { amount_minor: number; currency: string };

export type CheckoutRequest = {
  /** Our payments.id; also the idempotency key, so a retried request never charges twice. */
  paymentId: string;
  orgId: string;
  amount: Money;
  description: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
};

export type CheckoutSession = { id: string; url: string };

export type VerifyResult =
  { ok: true; accountLabel: string; livemode: boolean } | { ok: false; reason: string };

export type GatewayEvent =
  | {
      type: "payment.succeeded";
      eventId: string;
      paymentId: string;
      gatewayRef: string;
      amount: Money;
      livemode: boolean;
    }
  | {
      type: "payment.failed";
      eventId: string;
      paymentId: string;
      reason: string;
      livemode: boolean;
    }
  | {
      type: "payment.refunded";
      eventId: string;
      gatewayRef: string;
      amount: Money;
      livemode: boolean;
    }
  | { type: "ignored"; eventId: string; reason: string };

export interface PaymentGateway {
  readonly kind: "stripe" | "test";
  verify(): Promise<VerifyResult>;
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  refund(gatewayRef: string, amount?: Money): Promise<{ refundId: string }>;
}

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}
