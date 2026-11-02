import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { Org } from "@/lib/orgs";
import { useFeatureReady } from "@/lib/db/readiness";
import { hasNewOptions, setupStateQuery } from "@/modules/setup/drafts";
import { SETUP_FLOWS, type SetupFlowEntry } from "@/modules/setup/flows";
import { connectionQuery } from "@/modules/payments/queries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const STATUS: Record<string, string> = {
  in_progress: "In progress",
  applied: "Done",
  needs_review: "Needs review",
};

/** The overview's setup hub: one card per guided flow, plus connecting payments. */
export function SetupCards({ org, canManagePayments }: { org: Org; canManagePayments: boolean }) {
  return (
    <div className="grid max-w-4xl gap-4 md:grid-cols-2">
      {SETUP_FLOWS.map((f) => (
        <FlowCard key={f.id} org={org} entry={f} />
      ))}
      {canManagePayments && <PaymentsCard org={org} />}
    </div>
  );
}

function FlowCard({ org, entry }: { org: Org; entry: SetupFlowEntry }) {
  const ready = useFeatureReady(entry.feature ?? "memberships");
  const { flow } = entry;
  const { data } = useQuery({ ...setupStateQuery(org.id, flow.id), enabled: ready === true });
  // A flow whose migration isn't applied yet doesn't show (readiness guard, D-135).
  if (entry.feature && ready !== true) return null;
  const fresh = hasNewOptions(data, flow.version);
  return (
    <section className="rule-brass bg-card p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-semibold">{flow.title}</h2>
        <Badge variant={data?.status === "applied" ? "secondary" : "default"}>
          {data ? STATUS[data.status] : "Not started"}
        </Badge>
        {fresh && <Badge>New setup options</Badge>}
      </div>
      {fresh && (
        <p className="mt-2 text-sm">
          New questions were added since you finished setup. Your current answers are kept.
        </p>
      )}
      <p className="mt-2 text-muted-foreground">{flow.description}</p>
      <Button asChild className="mt-4">
        <Link
          to="/orgs/$orgId/setup"
          params={{ orgId: org.id }}
          search={entry.id === "membership" ? {} : { flow: entry.id }}
        >
          {!data
            ? "Start setup"
            : data.status === "applied"
              ? fresh
                ? "See what's new"
                : "Review or change"
              : "Continue setup"}
        </Link>
      </Button>
    </section>
  );
}

/** Keys must be sealed on the server, so payments are connected on the Payments tab, not here. */
function PaymentsCard({ org }: { org: Org }) {
  const ready = useFeatureReady("payments");
  const { data } = useQuery({ ...connectionQuery(org.id), enabled: ready === true });
  if (ready !== true) return null;
  const connected = data?.status === "verified";
  return (
    <section className="rule-brass bg-card p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-semibold">Connect payments</h2>
        <Badge variant={connected ? "secondary" : "default"}>
          {connected ? "Done" : "Not started"}
        </Badge>
      </div>
      <p className="mt-2 text-muted-foreground">
        {connected
          ? `Collecting into ${data!.account_label}${data!.livemode ? "" : " (test mode)"}.`
          : "Connect your own Stripe account so people can join and renew online."}
      </p>
      <Button asChild className="mt-4" variant={connected ? "outline" : "default"}>
        <Link to="/orgs/$orgId" params={{ orgId: org.id }} search={{ tab: "payments" }}>
          {connected ? "Payment settings" : "Connect payments"}
        </Link>
      </Button>
    </section>
  );
}
