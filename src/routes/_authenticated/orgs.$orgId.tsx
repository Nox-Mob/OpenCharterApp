import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { auditQuery, myOrgsQuery, myPermissionsQuery, TYPE_LABEL } from "@/lib/orgs";
import { hasPermission } from "@/lib/policy";
import { CreateOrgDialog } from "@/components/create-org-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/orgs/$orgId")({
  head: () => ({ meta: [{ title: "Organization — OpenCharterApp" }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(myOrgsQuery()),
      context.queryClient.ensureQueryData(myPermissionsQuery()),
    ]);
  },
  component: OrgPage,
  notFoundComponent: () => <p className="text-muted-foreground">Organization not found or not visible to you.</p>,
});

function OrgPage() {
  const { orgId } = Route.useParams();
  const { data: orgs } = useSuspenseQuery(myOrgsQuery());
  const { data: grants } = useSuspenseQuery(myPermissionsQuery());
  const org = orgs.find((o) => o.id === orgId);
  if (!org) throw notFound();
  const children = orgs.filter((o) => o.parent_id === org.id);
  const parent = orgs.find((o) => o.id === org.parent_id);
  const canAddChild = (org.type === "national" || org.type === "region") && hasPermission(grants, "org.create_child", org);
  const canAudit = hasPermission(grants, "audit.view", org);

  return (
    <div>
      <div className="rule-brass pt-6">
        {parent && (
          <Link to="/orgs/$orgId" params={{ orgId: parent.id }} className="text-sm text-muted-foreground hover:underline">
            ← {parent.name}
          </Link>
        )}
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-3xl font-semibold">{org.name}</h1>
          <Badge variant="secondary">{TYPE_LABEL[org.type]}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">/{org.slug}</p>
      </div>

      <Tabs defaultValue="overview" className="mt-8">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {(org.type === "national" || org.type === "region") && <TabsTrigger value="chapters">Chapters</TabsTrigger>}
          {canAudit && <TabsTrigger value="audit">Audit log</TabsTrigger>}
        </TabsList>
        <TabsContent value="overview" className="mt-6 text-muted-foreground">
          Membership setup, tiers and payments arrive in the next milestone.
        </TabsContent>
        <TabsContent value="chapters" className="mt-6">
          <div className="mb-4 flex justify-end">
            {canAddChild && (
              <CreateOrgDialog parentId={org.id} trigger={<Button>Add chapter</Button>} />
            )}
          </div>
          {children.length === 0 ? (
            <p className="text-muted-foreground">No chapters yet.</p>
          ) : (
            <ul className="divide-y rounded-md border bg-card">
              {children.map((c) => (
                <li key={c.id}>
                  <Link to="/orgs/$orgId" params={{ orgId: c.id }} className="flex justify-between px-5 py-3 hover:bg-muted">
                    <span>{c.name}</span>
                    <Badge variant="outline">{TYPE_LABEL[c.type]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
        {canAudit && (
          <TabsContent value="audit" className="mt-6">
            <AuditLog orgId={org.id} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function AuditLog({ orgId }: { orgId: string }) {
  const { data = [], isLoading } = useQuery(auditQuery(orgId));
  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>Record</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((e) => (
          <TableRow key={e.id}>
            <TableCell>{new Date(e.created_at).toLocaleString()}</TableCell>
            <TableCell className="capitalize">{e.action}</TableCell>
            <TableCell>{e.target_type.replace(/_/g, " ")}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
