import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Org } from "@/lib/orgs";
import { formatPrice } from "@/modules/membership/tiers";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/modules/membership/memberships";
import { STRIPE_WEBHOOK_EVENTS, stripeConnectSchema, webhookUrl } from "@/modules/payments/connect";
import { connectStripe } from "@/modules/payments/payments.functions";
import {
  connectionQuery,
  connectTestGateway,
  disconnectGateway,
  paymentsQuery,
} from "@/modules/payments/queries";
import { isDemoOrgId } from "@/modules/payments/test-gateway";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STATUS_LABELS = { pending: "Pending", paid: "Paid", refunded: "Refunded", failed: "Failed" };

/** Payments tab (E-12): the org's own gateway connection and the payments it has received. */
export function PaymentsTab({ org, canManage }: { org: Org; canManage: boolean }) {
  const qc = useQueryClient();
  const connection = useQuery(connectionQuery(org.id));
  const payments = useQuery(paymentsQuery(org.id));
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const isDemo = isDemoOrgId(org.id) || org.ancestor_ids.some(isDemoOrgId);
  const c = connection.data;
  const connected = c?.status === "verified";
  const hook = typeof window === "undefined" ? "" : webhookUrl(window.location.origin, org.id);
  const refresh = () => qc.invalidateQueries({ queryKey: ["gateway-connection", org.id] });

  async function saveStripe() {
    const parsed = stripeConnectSchema.safeParse({ orgId: org.id, secretKey, webhookSecret });
    if (!parsed.success)
      return void toast.error(parsed.error.issues[0]?.message ?? "Check the keys");
    setBusy(true);
    try {
      const r = await connectStripe({ data: parsed.data });
      toast.success(`Connected: ${r.accountLabel}`);
      setSecretKey("");
      setWebhookSecret("");
      refresh();
    } catch (e) {
      toast.error(String((e as Error).message) || "Couldn't connect Stripe");
    } finally {
      setBusy(false);
    }
  }

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true);
    try {
      await action();
      toast.success(done);
      refresh();
    } catch (e) {
      toast.error(
        String((e as Error).message).includes("demo organizations")
          ? "Test payments are only available to demo organizations"
          : "Couldn't update the connection",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4 rounded-md border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">Payment connection</h2>
          {connected ? (
            <Badge>{c!.account_label}</Badge>
          ) : (
            <Badge variant="outline">Not connected</Badge>
          )}
          {connected && !c!.livemode && <Badge variant="secondary">Test mode</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          {org.name} collects into its own Stripe account. Money never passes through
          OpenCharterApp, and card details never touch our servers. Online joining and renewal open
          once a connection is verified.
        </p>

        {canManage && !connected && (
          <div className="space-y-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>
                In Stripe, create a <strong>restricted key</strong> with write access to Checkout
                Sessions and Refunds (or use your secret key).
              </li>
              <li>
                Add a webhook endpoint at the address below, sending:{" "}
                {STRIPE_WEBHOOK_EVENTS.join(", ")}.
              </li>
              <li>Paste the key and the endpoint's signing secret here.</li>
            </ol>
            <div className="space-y-1">
              <Label htmlFor="webhook-url">Webhook address</Label>
              <div className="flex gap-2">
                <Input id="webhook-url" readOnly value={hook} />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(hook);
                    toast.success("Copied");
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="stripe-key">Stripe key</Label>
                <Input
                  id="stripe-key"
                  type="password"
                  autoComplete="off"
                  placeholder="rk_live_… or sk_live_…"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="webhook-secret">Webhook signing secret</Label>
                <Input
                  id="webhook-secret"
                  type="password"
                  autoComplete="off"
                  placeholder="whsec_…"
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={saveStripe} disabled={busy}>
                {busy ? "Checking…" : "Connect Stripe"}
              </Button>
              {isDemo && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => run(() => connectTestGateway(org.id), "Test payments turned on")}
                >
                  Use test payments (demo only)
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Stripe test keys (sk_test_…) work too, with Stripe's test cards. Keys are checked with
              Stripe, then stored encrypted.
            </p>
          </div>
        )}

        {canManage && connected && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Turn off online payments? Joining and renewing online stop."))
                void run(() => disconnectGateway(org.id), "Payments disconnected");
            }}
          >
            Disconnect
          </Button>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Payments received</h2>
        {(payments.data?.length ?? 0) === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No payments yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Member</TableHead>
                <TableHead>For</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>How</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.data!.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    {p.received_on ?? new Date(p.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>{p.member_name}</TableCell>
                  <TableCell className="capitalize">
                    {p.purpose === "join" ? "Joining" : "Renewal"}
                  </TableCell>
                  <TableCell>
                    {formatPrice(p.amount_minor, p.currency)}
                    {p.refunded_amount_minor > 0 && (
                      <span className="block text-xs text-muted-foreground">
                        Refunded {formatPrice(p.refunded_amount_minor, p.currency)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {p.gateway === "manual"
                      ? (PAYMENT_METHOD_LABELS[p.method as PaymentMethod] ?? "Recorded")
                      : p.gateway === "stripe"
                        ? "Stripe"
                        : "Test payment"}
                    {!p.livemode && (
                      <Badge variant="secondary" className="ml-2">
                        Test
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{STATUS_LABELS[p.status]}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
