import { createServerFn } from "@tanstack/react-start";
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
