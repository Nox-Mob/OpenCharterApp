import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  joinOutcome,
  nextJoin,
  paymentProgressQuery,
  rememberNextJoin,
} from "@/modules/membership/joining";
import { formatPrice } from "@/modules/membership/tiers";
import { confirmCheckout } from "@/modules/payments/payments.functions";
import { useFeatureReady } from "@/lib/db/readiness";
import {
  homeChapterInfoQuery,
  setHomeChapter,
  takeRememberedHomeChapter,
} from "@/modules/membership/home-chapter";
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

/**
 * Polls the payment for up to two minutes. The webhook normally confirms it; for Stripe the page
 * also asks Stripe directly every few seconds (confirmCheckout, D-158), so a payment still
 * completes when the org's webhook is late or not set up.
 */
const POLL_MS = 2000;
const CONFIRM_MS = 6000;
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
  const isStripe = progress.data?.gateway === "stripe";
  const waiting = joinOutcome(progress.data) === "waiting";
  useEffect(() => {
    if (!payment || !isStripe || !waiting) return;
    let stop = false;
    const check = async () => {
      if (stop || Date.now() - started > GIVE_UP_MS) return;
      try {
        await confirmCheckout({ data: { paymentId: payment } });
        await progress.refetch();
      } catch {
        // The webhook may still confirm it; keep polling the payment.
      }
    };
    void check();
    const t = setInterval(() => void check(), CONFIRM_MS);
    return () => {
      stop = true;
      clearInterval(t);
    };
    // progress.refetch is stable; re-run only when the payment or its state changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment, isStripe, waiting, started]);
  const outcome = payment
    ? progress.isLoading
      ? "waiting"
      : joinOutcome(progress.data)
    : "missing";
  // Home-chapter model (A8): apply the chapter picked on the join page once the membership exists.
  const homeReady = useFeatureReady("home_chapter") === true;
  const home = useQuery({ ...homeChapterInfoQuery(orgSlug), enabled: homeReady });
  const joined = outcome === "welcome" || outcome === "awaiting_approval";
  useEffect(() => {
    if (!joined || home.data?.model !== "home_chapter" || home.data.org.type !== "national") return;
    const picked = takeRememberedHomeChapter(orgSlug);
    if (picked)
      void setHomeChapter(home.data.national.id, picked.chapterId).catch(() => {
        // the member can still pick it on their overview ("Your chapter")
      });
  }, [joined, home.data, orgSlug]);
  const p = progress.data;
  const amount = p ? formatPrice(p.amount_minor, p.currency) : "";
  // After paying national dues, continue to the chapter's (two-level dues, D-146).
  const [then] = useState(() => nextJoin());
  const next = then && then !== orgSlug ? then : null;
  const back = next ? (
    <Button asChild>
      <Link to="/join/$orgSlug" params={{ orgSlug: next }} onClick={() => rememberNextJoin(null)}>
        Continue to step 2: chapter dues
      </Link>
    </Button>
  ) : (
    <Button asChild variant="outline">
      <Link to="/dashboard">Continue</Link>
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
