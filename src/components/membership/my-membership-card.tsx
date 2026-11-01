import { useQuery } from "@tanstack/react-query";
import type { Org } from "@/lib/orgs";
import { graceDaysQuery, myMembershipQuery } from "@/modules/membership/memberships";
import { addDays, expirationLabel, standing, today } from "@/modules/membership/standing";
import { StandingBadge } from "./standing-badge";

/** "Your membership" on an org's overview (E-13a). Online renewal arrives with E-13b. */
export function MyMembershipCard({ org }: { org: Org }) {
  const mine = useQuery(myMembershipQuery(org.id));
  const grace = useQuery(graceDaysQuery(org.id));
  if (mine.isLoading || grace.isLoading || !mine.data) return null;
  const m = mine.data;
  const graceDays = grace.data ?? 30;
  const on = today();
  const s = standing(m, graceDays, on);
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
          {addDays(m.paid_through, graceDays)}. Contact the organization to renew.
        </p>
      )}
      {s === "lapsed" && (
        <p className="mt-2 text-sm">
          Your membership has lapsed. Contact the organization to renew.
        </p>
      )}
      {s === "pending" && <p className="mt-2 text-sm">An admin will review your application.</p>}
    </section>
  );
}
