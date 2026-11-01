import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Org } from "@/lib/orgs";
import { formatPrice } from "@/modules/membership/tiers";
import {
  decideMembership,
  membershipErrorMessage,
  membershipHistoryQuery,
  PAYMENT_METHOD_LABELS,
  type MemberRow,
  type PaymentMethod,
} from "@/modules/membership/memberships";
import { expirationLabel, standing, today } from "@/modules/membership/standing";
import { StandingBadge } from "./standing-badge";
import { RecordMembershipDialog } from "./record-membership-dialog";
import { Button } from "@/components/ui/button";

const KIND_LABELS = {
  joined: "Joined",
  renewed: "Renewed",
  approved: "Approved",
  declined: "Declined",
  cancelled: "Cancelled",
} as const;

/** A member's membership: standing, actions and history (E-13a). */
export function MembershipPanel({
  org,
  member,
  graceDays,
  canManage,
  canRecordPayments,
}: {
  org: Org;
  member: MemberRow;
  graceDays: number;
  canManage: boolean;
  canRecordPayments: boolean;
}) {
  const qc = useQueryClient();
  const m = member.membership;
  const history = useQuery({ ...membershipHistoryQuery(m?.id ?? ""), enabled: !!m });
  const [recording, setRecording] = useState(false);
  const on = today();
  const s = standing(m, graceDays, on);

  async function decide(action: "approve" | "decline" | "cancel") {
    if (!m) return;
    if (action === "cancel" && !window.confirm("Cancel this membership now?")) return;
    try {
      await decideMembership(m.id, action);
      toast.success(
        action === "approve" ? "Approved" : action === "decline" ? "Declined" : "Cancelled",
      );
      qc.invalidateQueries({ queryKey: ["members", org.id] });
      qc.invalidateQueries({ queryKey: ["membership-history", m.id] });
    } catch (e) {
      toast.error(membershipErrorMessage(String((e as Error).message)));
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">Membership</h3>
        <StandingBadge standing={s} />
      </div>
      {m ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Level</dt>
          <dd>
            {m.tier_name} · {m.term_label}
          </dd>
          {m.joined_on && (
            <>
              <dt className="text-muted-foreground">Member since</dt>
              <dd>{m.joined_on}</dd>
            </>
          )}
          {m.status === "active" && (
            <>
              <dt className="text-muted-foreground">Paid through</dt>
              <dd>
                {m.lifetime ? "Lifetime" : m.paid_through}{" "}
                {!m.lifetime && (
                  <span className="text-muted-foreground">({expirationLabel(m, on)})</span>
                )}
              </dd>
            </>
          )}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">No membership recorded yet.</p>
      )}

      {canManage && (
        <div className="flex flex-wrap gap-2">
          {m?.status === "pending" ? (
            <>
              <Button size="sm" onClick={() => decide("approve")}>
                Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => decide("decline")}>
                Decline
              </Button>
            </>
          ) : (
            !(m?.status === "active" && m.lifetime) && (
              <Button size="sm" onClick={() => setRecording(true)}>
                {m?.status === "active" ? "Record renewal" : "Record membership"}
              </Button>
            )
          )}
          {m?.status === "active" && (
            <Button size="sm" variant="ghost" onClick={() => decide("cancel")}>
              Cancel membership
            </Button>
          )}
        </div>
      )}

      {m && (history.data?.length ?? 0) > 0 && (
        <div>
          <p className="text-sm font-medium">History</p>
          <ul className="mt-1 divide-y rounded-md border text-sm">
            {history.data!.map((e) => (
              <li key={e.id} className="px-3 py-2">
                <span className="font-medium">{KIND_LABELS[e.kind]}</span>{" "}
                <span className="text-muted-foreground">
                  {new Date(e.created_at).toLocaleDateString()}
                </span>
                {e.period_start && (
                  <span className="block text-muted-foreground">
                    {e.tier_name} · {e.term_label}: {e.period_start}
                    {e.period_end ? ` through ${e.period_end}` : " (lifetime)"}
                  </span>
                )}
                {e.payment && (
                  <span className="block text-muted-foreground">
                    Paid {formatPrice(e.payment.amount_minor, e.payment.currency)}
                    {e.payment.method
                      ? ` by ${PAYMENT_METHOD_LABELS[e.payment.method as PaymentMethod].toLowerCase()}`
                      : ""}
                  </span>
                )}
                {e.note && <span className="block">{e.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {recording && (
        <RecordMembershipDialog
          org={org}
          member={member}
          graceDays={graceDays}
          canRecordPayments={canRecordPayments}
          open={recording}
          onClose={() => setRecording(false)}
        />
      )}
    </section>
  );
}
