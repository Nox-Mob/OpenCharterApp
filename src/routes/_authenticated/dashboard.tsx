import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { isDemoOrg, myOrgsQuery, TYPE_LABEL } from "@/lib/orgs";
import { DemoBadge } from "@/components/demo/demo-badge";
import { CreateOrgDialog } from "@/components/create-org-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Your organizations — OpenCharterApp" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(myOrgsQuery()),
  component: Dashboard,
});

function Dashboard() {
  const { data: orgs } = useSuspenseQuery(myOrgsQuery());
  const navigate = useNavigate();
  return (
    <div>
      <div className="flex items-end justify-between rule-brass pt-6">
        <div>
          <h1 className="text-3xl font-semibold">Your organizations</h1>
          <p className="mt-1 text-muted-foreground">
            Every organization you belong to or help run.
          </p>
        </div>
        <CreateOrgDialog
          trigger={<Button>Create organization</Button>}
          onCreated={(id) => navigate({ to: "/orgs/$orgId", params: { orgId: id } })}
        />
      </div>
      {orgs.length === 0 ? (
        <p className="mt-10 rounded-md border border-dashed p-10 text-center text-muted-foreground">
          You aren't part of any organization yet. Create one to get started.
        </p>
      ) : (
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
