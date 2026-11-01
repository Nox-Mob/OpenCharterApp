import { z } from "zod";
import { looksLikeStripeKey, looksLikeWebhookSecret } from "./stripe";

/** Input for connecting an org's own Stripe account (E-12). Shared by the form and the server. */
export const stripeConnectSchema = z.object({
  orgId: z.string().uuid(),
  secretKey: z
    .string()
    .trim()
    .refine(looksLikeStripeKey, "Paste a secret or restricted key (starts with sk_ or rk_)"),
  webhookSecret: z
    .string()
    .trim()
    .refine(looksLikeWebhookSecret, "Paste the webhook signing secret (starts with whsec_)"),
});
export type StripeConnectInput = z.infer<typeof stripeConnectSchema>;

/** Where an org's Stripe account sends its events (one endpoint per org, D-105). */
export const webhookUrl = (origin: string, orgId: string) => `${origin}/api/public/stripe/${orgId}`;

/** Events the org's Stripe webhook endpoint must send. */
export const STRIPE_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "charge.refunded",
] as const;
