import { createFileRoute } from "@tanstack/react-router";

// Stripe webhooks for one organization's own account (E-12, D-105). Each org's endpoint is
// verified with that org's signing secret; the body is read raw before parsing.
export const Route = createFileRoute("/api/public/stripe/$orgId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { handleStripeWebhook } = await import("@/modules/payments/payments.server");
        return handleStripeWebhook(params.orgId, request);
      },
    },
  },
});
