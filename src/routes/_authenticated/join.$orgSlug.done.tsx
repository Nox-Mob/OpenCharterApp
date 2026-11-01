import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { joinOutcome, paymentProgressQuery } from "@/modules/membership/joining";
import { formatPrice } from "@/modules/membership/tiers";
import { RequiresDatabase } from "@/components/db/requires-database";
import { Button } from "@/components/ui/button";

const search = z.object({ payment: z.string().uuid().optional() });

export const Route = createFileRoute("/_authenticated/join/$orgSlug/done")({
  validateSearch: search,
  head: () => ({
    meta: [{ title: "Payment — OpenCharterApp" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <RequiresDatabase feature="joining">
      <Done />
    </RequiresDatabase>
  ),
});

/** Polls the payment for up to two minutes: the webhook, not the browser, confirms it. */
const POLL_MS = 2000;
const GIVE_UP_MS = 120_000;

function Done() {
  const { orgSlug } = Route.useParams();
  const { payment } = Route.useSearch();
  const [started] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const progress = useQuery({
    ...paymentProgressQuery(payment ?? ""),
    enabled: !!payment,
    refetchInterval: (q) =>
      joinOutcome(q.state.data) === "waiting" && Date.now() - started < GIVE_UP_MS
        ? POLL_MS
        : false,
  });
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), POLL_MS);
    return () => clearInterval(t);
  }, []);
  const outcome = payment
    ? progress.isLoading
      ? "waiting"
      : joinOutcome(progress.data)
    : "missing";
  const p = progress.data;
  const amount = p ? formatPrice(p.amount_minor, p.currency) : "";
  const back = (
    <Button asChild variant="outline">
      <Link to="/dashboard">Go to your dashboard</Link>
    </Button>
  );

  return (
    <div className="mx-auto max-w-xl space-y-4 py-10">
      {outcome === "waiting" &&
        (now - started < GIVE_UP_MS ? (
          <>
            <h1 className="text-2xl font-semibold">Confirming your payment…</h1>
            <p className="text-muted-foreground">
              This usually takes a few seconds. You can leave this page; your membership updates as
              soon as the payment is confirmed.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">Still waiting for confirmation</h1>
            <p className="text-muted-foreground">
              The payment hasn't been confirmed yet. Check your membership again in a little while,
              or contact the organization.
            </p>
            {back}
          </>
        ))}
      {outcome === "welcome" && (
        <>
          <h1 className="text-2xl font-semibold">Welcome to {p!.org_name}!</h1>
          <p>Your payment of {amount} was received and your membership is active.</p>
          {back}
        </>
      )}
      {outcome === "renewed" && (
        <>
          <h1 className="text-2xl font-semibold">Thank you for renewing</h1>
          <p>Your payment of {amount} was received and your membership has been extended.</p>
          {back}
        </>
      )}
      {outcome === "awaiting_approval" && (
        <>
          <h1 className="text-2xl font-semibold">Application received</h1>
          <p>
            Your payment of {amount} was received. An admin of {p!.org_name} will review your
            application. If it's declined, you'll be refunded in full.
          </p>
          {back}
        </>
      )}
      {outcome === "failed" && (
        <>
          <h1 className="text-2xl font-semibold">The payment didn't go through</h1>
          <p>{p!.failure_reason ?? "The payment failed."} Nothing was charged.</p>
          <Button asChild>
            <Link to="/join/$orgSlug" params={{ orgSlug }}>
              Try again
            </Link>
          </Button>
        </>
      )}
      {outcome === "refunded" && (
        <>
          <h1 className="text-2xl font-semibold">This payment was refunded</h1>
          <p>{amount} was refunded.</p>
          {back}
        </>
      )}
      {outcome === "missing" && (
        <>
          <h1 className="text-2xl font-semibold">We couldn't find that payment</h1>
          {back}
        </>
      )}
      {p && !p.livemode && (
        <p className="text-xs text-muted-foreground">
          This was a test payment; no real money moved.
        </p>
      )}
    </div>
  );
}
