import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { hubUrl, isHosted } from "@shared/supabase/hosted";
import { isDemoOrg, myOrgsQuery, TYPE_LABEL } from "@/lib/orgs";
import { DemoBadge } from "@/components/demo/demo-badge";
import { CreateOrgDialog } from "@/components/create-org-dialog";
import { Button } from "@/components/ui/button";
import { SetUpChoice } from "@/components/org/set-up-from-hub";
import { useHubOrgs } from "@/lib/hub-orgs";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/orgs/")({
  head: () => ({ meta: [{ title: "Your organizations — OpenCharterApp" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(myOrgsQuery()),
  component: Organizations,
});

/** Every organization you belong to or help run, and Create organization (D-206). */
function Organizations() {
  const { data: orgs } = useSuspenseQuery(myOrgsQuery());
  const navigate = useNavigate();
  const hubOrgs = useHubOrgs();
  const hasPending =
    isHosted() && (hubOrgs.data ?? []).some((o) => !orgs.some((u) => u.id === o.id));
  return (
    <div>
      <div className="flex items-end justify-between rule-brass pt-6">
        <div>
          <h1 className="text-3xl font-semibold">Your organizations</h1>
          <p className="mt-1 text-muted-foreground">
            Every organization you belong to or help run. Choose which one opens when you sign in on
            your{" "}
            <Link to="/account" className="underline">
              account page
            </Link>
            .
          </p>
        </div>
        {isHosted() ? (
          // Hosted: organizations are created in OpenAppHub, for every app at once.
          <Button asChild>
            <a href={hubUrl("/orgs/new")}>Create organization</a>
          </Button>
        ) : (
          <CreateOrgDialog
            trigger={<Button>Create organization</Button>}
            onCreated={(id) => navigate({ to: "/orgs/$orgId", params: { orgId: id } })}
          />
        )}
      </div>
      {isHosted() && <NotSetUpYet known={orgs.map((o) => o.id)} />}
      {orgs.length === 0 && !hasPending ? (
        <p className="mt-10 rounded-md border border-dashed p-10 text-center text-muted-foreground">
          You aren't part of any organization yet. Create one to get started.
        </p>
      ) : orgs.length === 0 ? null : (
        <ul className="mt-8 divide-y rounded-md border bg-card">
          {orgs.map((o) => (
            <li key={o.id}>
              <Link
                to="/orgs/$orgId"
                params={{ orgId: o.id }}
                className="flex items-center justify-between px-5 py-4 hover:bg-muted"
              >
                <span className="font-medium">{o.name}</span>
                <span className="flex items-center gap-2">
                  {isDemoOrg(o) && <DemoBadge />}
                  <Badge variant="secondary">{TYPE_LABEL[o.type]}</Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Hosted: organizations you belong to in OpenAppHub that don't use OpenCharterApp yet. Setting
 * one up makes it the top of its tree here (charter.ensure_top_unit), with you as its admin.
 */
function NotSetUpYet({ known }: { known: string[] }) {
  const hubOrgs = useHubOrgs();
  const pending = (hubOrgs.data ?? []).filter((o) => !known.includes(o.id));
  if (pending.length === 0) return null;
  return (
    <section className="mt-8 rounded-md border bg-card p-5">
      <h2 className="text-lg font-semibold">Not set up in OpenCharterApp yet</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        These organizations are in OpenAppHub. Set one up to manage its members and dues here.
      </p>
      <ul className="mt-4 divide-y">
        {pending.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span className="font-medium">{o.name}</span>
            <SetUpChoice org={o} />
          </li>
        ))}
      </ul>
    </section>
  );
}
