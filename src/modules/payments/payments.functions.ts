import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FullDatabase } from "@/lib/db/pending-schema";
import { stripeConnectSchema } from "./connect";
import { createStripeGateway } from "./stripe";
import { sealSecret } from "./secret-box";

/**
 * Connect an org's own Stripe account (E-12, D-105, D-127). Runs on the server: the key is
 * checked against Stripe, sealed with GATEWAY_ENCRYPTION_KEY and handed to
 * save_stripe_connection, which checks the caller's payments.manage permission itself.
 * The plain key never reaches the database or the browser again.
 */
export const connectStripe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => stripeConnectSchema.parse(input))
  .handler(async ({ data, context }) => {
    const key = process.env["GATEWAY_ENCRYPTION_KEY"];
    if (!key)
      throw new Error(
        "Payments aren't set up on this server yet (GATEWAY_ENCRYPTION_KEY is missing)",
      );
    const check = await createStripeGateway(data.secretKey).verify();
    if (!check.ok) throw new Error(check.reason);
    const sealed = await sealSecret(
      JSON.stringify({ secretKey: data.secretKey, webhookSecret: data.webhookSecret }),
      key,
    );
    const client = context.supabase as unknown as SupabaseClient<FullDatabase>;
    const { error } = await client.rpc("save_stripe_connection", {
      _org: data.orgId,
      _sealed: sealed,
      _account_label: check.accountLabel,
      _livemode: check.livemode,
    });
    if (error)
      throw new Error(
        error.message.includes("not allowed") ? "Not allowed" : "Couldn't save the connection",
      );
    return { accountLabel: check.accountLabel, livemode: check.livemode };
  });

const startCheckoutSchema = z.object({ paymentId: z.string().uuid() });

/**
 * Open checkout for the caller's own pending payment (E-13b). Reads the payment as the
 * caller (RLS: payers see their own), creates a checkout with the org's own gateway and
 * returns its URL: Stripe Checkout, or our test page for demo orgs.
 */
export const startCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => startCheckoutSchema.parse(input))
  .handler(async ({ data, context }) => {
    const client = context.supabase as unknown as SupabaseClient<FullDatabase>;
    const { data: pay, error } = await client
      .from("payments")
      .select(
        "id,org_id,amount_minor,currency,status,purpose,organizations(name,slug),tier_terms(label,membership_tiers(name))",
      )
      .eq("id", data.paymentId)
      .maybeSingle();
    if (error) throw new Error("Couldn't load the payment");
    if (!pay) throw new Error("Payment not found");
    if (pay.status !== "pending" && pay.status !== "failed")
      throw new Error("This payment is already finished");
    const org = pay.organizations as unknown as { name: string; slug: string } | null;
    const term = pay.tier_terms as unknown as {
      label: string;
      membership_tiers: { name: string } | null;
    } | null;
    const origin = new URL(getRequest().url).origin;
    const { loadOrgGateway } = await import("./payments.server");
    const gateway = await loadOrgGateway(pay.org_id, origin);
    if (!gateway) throw new Error("Online payments aren't open for this organization");
    const slug = org?.slug ?? "";
    const session = await gateway.createCheckout({
      paymentId: pay.id,
      orgId: pay.org_id,
      amount: { amount_minor: pay.amount_minor, currency: pay.currency },
      description:
        `${org?.name ?? "Membership"}: ${term?.membership_tiers?.name ?? "Membership"} · ${term?.label ?? ""}`.trim(),
      successUrl: `${origin}/join/${slug}/done?payment=${pay.id}`,
      cancelUrl: `${origin}/join/${slug}/cancelled?payment=${pay.id}`,
      ...(context.claims["email"] ? { customerEmail: String(context.claims["email"]) } : {}),
    });
    await client.rpc("set_checkout_ref", { _payment: pay.id, _ref: session.id });
    return { url: session.url };
  });

const declineSchema = z.object({
  membershipId: z.string().uuid(),
  note: z.string().max(500).default(""),
});

/**
 * Decline a paid application and refund it (E-13b, pay first then approval). The database
 * checks the caller may decline; a test payment is refunded there, a Stripe payment is
 * refunded here with the org's own key and recorded by the charge.refunded webhook.
 */
export const declineApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => declineSchema.parse(input))
  .handler(async ({ data, context }) => {
    const client = context.supabase as unknown as SupabaseClient<FullDatabase>;
    const { data: result, error } = await client.rpc("decline_application", {
      _membership: data.membershipId,
      _note: data.note,
    });
    if (error)
      throw new Error(error.message.includes("not allowed") ? "Not allowed" : "Couldn't decline");
    const r = (result ?? {}) as {
      refund: "done" | "stripe" | null;
      gateway_ref?: string;
      org_id?: string;
      amount_minor?: number;
      currency?: string;
    };
    if (r.refund !== "stripe") return { refund: r.refund };
    try {
      const origin = new URL(getRequest().url).origin;
      const { loadOrgGateway } = await import("./payments.server");
      const gateway = await loadOrgGateway(r.org_id!, origin);
      if (!gateway) throw new Error("no gateway");
      await gateway.refund(r.gateway_ref!, {
        amount_minor: r.amount_minor!,
        currency: r.currency!,
      });
      return { refund: "requested" as const };
    } catch {
      // Declined already; the refund must then be made in Stripe by hand.
      return { refund: "failed" as const };
    }
  });
