import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useFeatureReady } from "@/lib/db/readiness";
import { beginRenewal, joinErrorMessage, joinInfoQuery } from "@/modules/membership/joining";
import { formatPrice, lengthOf, termLabel } from "@/modules/membership/tiers";
import { startCheckout } from "@/modules/payments/payments.functions";
import { Button } from "@/components/ui/button";
import type { Org } from "@/lib/orgs";
import { graceDaysQuery, myMembershipQuery } from "@/modules/membership/memberships";
import { addDays, expirationLabel, standing, today } from "@/modules/membership/standing";
import { StandingBadge } from "./standing-badge";

/** "Your membership" on an org's overview (E-13a), with online renewal (E-13b). */
export function MyMembershipCard({ org }: { org: Org }) {
  const mine = useQuery(myMembershipQuery(org.id));
  const grace = useQuery(graceDaysQuery(org.id));
  const joiningReady = useFeatureReady("joining") === true;
  const join = useQuery({ ...joinInfoQuery(org.slug), enabled: joiningReady });
  const [termId, setTermId] = useState("");
  const [busy, setBusy] = useState(false);
  if (mine.isLoading || grace.isLoading || !mine.data) return null;
  const m = mine.data;
  const graceDays = grace.data ?? 30;
  const on = today();
  const s = standing(m, graceDays, on);
  const terms = (join.data?.payments_enabled ? join.data.levels : []).flatMap((l) =>
    l.terms.map((t) => ({ level: l, term: t })),
  );
  const canRenew = m.status === "active" && !m.lifetime && terms.length > 0;
  const chosen = terms.find((x) => x.term.id === (termId || m.term_id)) ?? terms[0];

  async function renew() {
    if (!chosen) return;
    setBusy(true);
    try {
      const paymentId = await beginRenewal(m.id, chosen.term.id);
      const { url } = await startCheckout({ data: { paymentId } });
      window.location.assign(url);
    } catch (e) {
      toast.error(joinErrorMessage(String((e as Error).message)));
      setBusy(false);
    }
  }
  return (
    <section className="max-w-xl rounded-md border bg-card p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Your membership</h2>
        <StandingBadge standing={s} />
      </div>
      <p className="mt-2 text-sm">
        {m.tier_name} · {m.term_label}
      </p>
      {m.status === "active" && (
        <p className="text-sm text-muted-foreground">
          {m.lifetime ? "Lifetime membership" : `Paid through ${m.paid_through}`}
          {!m.lifetime && ` · ${expirationLabel(m, on)}`}
        </p>
      )}
      {s === "grace" && m.paid_through && (
        <p className="mt-2 text-sm">
          Your membership has expired, but you keep your standing until{" "}
          {addDays(m.paid_through, graceDays)}.{" "}
          {canRenew ? "Renew below to keep it." : "Contact the organization to renew."}
        </p>
      )}
      {s === "lapsed" && (
        <p className="mt-2 text-sm">
          Your membership has lapsed.{" "}
          {canRenew ? "Renew below to restart it." : "Contact the organization to renew."}
        </p>
      )}
      {s === "pending" && <p className="mt-2 text-sm">An admin will review your application.</p>}
      {canRenew && chosen && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {terms.length > 1 && (
            <select
              aria-label="Renewal term"
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={chosen.term.id}
              onChange={(e) => setTermId(e.target.value)}
            >
              {terms.map((x) => (
                <option key={x.term.id} value={x.term.id}>
                  {x.level.name}: {termLabel(lengthOf(x.term))} ·{" "}
                  {formatPrice(x.term.price_minor, x.term.currency)}
                </option>
              ))}
            </select>
          )}
          <Button onClick={renew} disabled={busy}>
            {busy
              ? "Opening payment…"
              : `Renew online (${formatPrice(chosen.term.price_minor, chosen.term.currency)})`}
          </Button>
        </div>
      )}
    </section>
  );
}
