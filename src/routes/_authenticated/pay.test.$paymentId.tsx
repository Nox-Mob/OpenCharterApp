import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { completeTestPayment, paymentProgressQuery } from "@/modules/membership/joining";
import { formatPrice } from "@/modules/membership/tiers";
import {
  SLOW_CONFIRMATION_MS,
  TEST_OUTCOMES,
  type TestOutcome,
} from "@/modules/payments/test-gateway";
import { RequiresDatabase } from "@/components/db/requires-database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/pay/test/$paymentId")({
  head: () => ({
    meta: [{ title: "Test checkout — OpenCharterApp" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <RequiresDatabase feature="joining">
      <TestCheckout />
    </RequiresDatabase>
  ),
});

/** Demo checkout (D-129): each button behaves like one of Stripe's test cards. */
function TestCheckout() {
  const { paymentId } = Route.useParams();
  const navigate = useNavigate();
  const payment = useQuery(paymentProgressQuery(paymentId));
  const [busy, setBusy] = useState(false);
  const p = payment.data;
  if (payment.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!p || p.gateway !== "test")
    return <p className="text-muted-foreground">This isn't a test payment you can complete.</p>;
  const slug = p.org_slug;
  const done = () =>
    navigate({
      to: "/join/$orgSlug/done",
      params: { orgSlug: slug },
      search: { payment: paymentId },
    });

  async function choose(outcome: TestOutcome) {
    if (outcome === "cancel")
      return void navigate({ to: "/join/$orgSlug/cancelled", params: { orgSlug: slug } });
    setBusy(true);
    try {
      if (outcome === "slow") {
        // Like a webhook that arrives late: the result lands while the return page waits.
        setTimeout(() => void completeTestPayment(paymentId, "accepted"), SLOW_CONFIRMATION_MS);
      } else {
        await completeTestPayment(paymentId, outcome);
      }
      await done();
    } catch {
      toast.error("Couldn't complete the test payment");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-5 py-10">
      <Badge variant="secondary">Test checkout: no real money</Badge>
      <div>
        <p className="text-sm text-muted-foreground">{p.org_name}</p>
        <h1 className="text-3xl font-semibold">{formatPrice(p.amount_minor, p.currency)}</h1>
        <p className="text-sm text-muted-foreground">
          {p.purpose === "renew" ? "Membership renewal" : "Membership"}
        </p>
      </div>
      {p.status !== "pending" && p.status !== "failed" ? (
        <p>This payment is already {p.status}.</p>
      ) : (
        <div className="space-y-2">
          {p.status === "failed" && p.failure_reason && (
            <p className="text-sm text-destructive">{p.failure_reason} Try another outcome.</p>
          )}
          {TEST_OUTCOMES.map((o) => (
            <Button
              key={o.value}
              className="w-full justify-between"
              variant={
                o.value === "accepted" ? "default" : o.value === "cancel" ? "ghost" : "outline"
              }
              disabled={busy}
              onClick={() => choose(o.value)}
            >
              <span>{o.label}</span>
              {o.card && <span className="font-mono text-xs opacity-70">{o.card}</span>}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
