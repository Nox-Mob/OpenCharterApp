import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { isDemoOrg, myOrgsQuery, myPermissionsQuery, TYPE_LABEL } from "@/lib/orgs";
import { grantsForView, hasAdminAccess, hasPermission, type Grant } from "@/lib/policy";
import { MemberOverview } from "@/components/members/member-overview";
import { CreateOrgDialog } from "@/components/create-org-dialog";
import { MembersTab } from "@/components/org/members-tab";
import { SettingsTab } from "@/components/org/settings-tab";
import { AttributesTab } from "@/components/attributes/attributes-tab";
import { ChapterFieldsCard } from "@/components/attributes/chapter-fields-card";
import { RolesTab } from "@/components/org/roles-tab";
import { LevelsTab } from "@/components/membership/levels-tab";
import { PaymentsTab } from "@/components/payments/payments-tab";
import { MembersDirectory } from "@/components/members/members-directory";
import { BoardTab } from "@/components/governance/board-tab";
import { AuditLogTab } from "@/components/org/audit-log";
import { ShareJoinPage } from "@/components/org/share-join-page";
import { BoardSettingsTab } from "@/components/governance/board-settings-tab";
import { membershipModelQuery } from "@/modules/membership/home-chapter";
import { ReportsTab } from "@/components/reports/reports-tab";
import { OrgOverview } from "@/components/reports/org-overview";
import { OrgNavigation } from "@/components/org/org-nav";
import { buildOrgNav, isSettingsSection, resolveSection } from "@/components/org/org-nav-items";
import { DirectoryPreference } from "@/components/members/directory-preference";
import { MyMembershipCard } from "@/components/membership/my-membership-card";
import { RequiresDatabase } from "@/components/db/requires-database";
import { SetupCards } from "@/components/setup/setup-card";
import { DeleteDemoOrg } from "@/components/demo/delete-demo-org";
import { DemoBadge } from "@/components/demo/demo-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/orgs/$orgId")({
  head: () => ({ meta: [{ title: "Organization — OpenCharterApp" }] }),
  // ?tab=payments opens a section directly (e.g. from the setup cards). Sections: org-nav.tsx.
  // ?as=member previews the page as a plain member sees it (D-155).
  validateSearch: (s: Record<string, unknown>): { tab?: string; as?: "member" } => ({
    ...(typeof s["tab"] === "string" && s["tab"] !== "overview" ? { tab: s["tab"] } : {}),
    ...(s["as"] === "member" ? { as: "member" as const } : {}),
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(myOrgsQuery()),
      context.queryClient.ensureQueryData(myPermissionsQuery()),
    ]);
  },
  component: OrgPage,
  notFoundComponent: () => (
    <p className="text-muted-foreground">Organization not found or not visible to you.</p>
  ),
});

function OrgPage() {
  const { orgId } = Route.useParams();
  const { tab = "overview", as } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: orgs } = useSuspenseQuery(myOrgsQuery());
  const { data: realGrants } = useSuspenseQuery(myPermissionsQuery());
  const org = orgs.find((o) => o.id === orgId);
  if (!org) throw notFound();
  const canPreview = hasAdminAccess(realGrants, org);
  const asMember = canPreview && as === "member";
  const grants = grantsForView(realGrants, asMember) as Grant[];
  const children = orgs.filter((o) => o.parent_id === org.id);
  const parent = orgs.find((o) => o.id === org.parent_id);
  const canAddChild =
    (org.type === "national" || org.type === "region") &&
    hasPermission(grants, "org.create_child", org);
  const canManage = hasPermission(grants, "org.manage", org);
  const canInvite = hasPermission(grants, "members.invite", org);
  const canSeeMembers = hasPermission(grants, "members.view", org);
  const canManageRoles = hasPermission(grants, "roles.manage", org);
  const canManageFields = hasPermission(grants, "attributes.manage", org);
  const canSeeRevenue = hasPermission(grants, "payments.view", org);
  const canSeeBoards = hasPermission(grants, "org.view", org);
  const hasChapters = org.type === "national" || org.type === "region";
  // Reports (E-23): a national or region sees its whole tree, a chapter admin only their chapter
  // (the roll-ups cover the org asked for and what's below it). Each section has its own
  // permission (D-145).
  const canSeeReports = canSeeMembers || canSeeRevenue || canSeeBoards;
  const canSeePayments = canSeeRevenue || hasPermission(grants, "payments.manage", org);
  const canManageBoard = hasPermission(grants, "governance.manage", org);
  const canDefineSeats = hasPermission(grants, "governance.define", org);
  // Home-chapter model (D-184): a chapter's members belong to the national, so it has no levels
  const model = useQuery({ ...membershipModelQuery(org.id), enabled: org.type === "chapter" });
  const homeChapter = org.type === "chapter" && model.data === "home_chapter";
  const nav = buildOrgNav({
    canSeeMembers,
    canSeeReports,
    hasChapters,
    isChapter: org.type === "chapter",
    canManage,
    canRunSetup: hasPermission(grants, "setup.run", org),
    canManageLevels: (canManage || hasPermission(grants, "tiers.manage", org)) && !homeChapter,
    canManageFields: canManage || canManageFields,
    canManageRoles,
    canConfigureBoard: canManageBoard || canDefineSeats || canManage,
    canSeePayments,
    canAudit: hasPermission(grants, "audit.view", org),
  });
  const section = resolveSection(nav, tab);
  const go = (t: string) =>
    navigate({
      search: { ...(t === "overview" ? {} : { tab: t }), ...(asMember ? { as: "member" } : {}) },
      replace: true,
    });
  const setPreview = (on: boolean) =>
    navigate({
      search: {
        ...(section === "overview" ? {} : { tab: section }),
        ...(on ? { as: "member" } : {}),
      },
      replace: true,
    });

  return (
    <div>
      <div className="rule-brass pt-6">
        {parent && (
          <Link
            to="/orgs/$orgId"
            params={{ orgId: parent.id }}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← {parent.name}
          </Link>
        )}
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-3xl font-semibold">{org.name}</h1>
          <Badge variant="secondary">{TYPE_LABEL[org.type]}</Badge>
          {isDemoOrg(org) && <DemoBadge />}
          {canPreview && !asMember && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => setPreview(true)}
            >
              View as member
            </Button>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">/{org.slug}</p>
        {asMember && (
          <div
            role="status"
            className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-primary/40 bg-primary/5 px-4 py-3 text-sm"
          >
            <span className="flex-1">
              You&apos;re viewing {org.name} as a member would. Admin pages and actions are hidden;
              your own membership and profile are shown as yours.
            </span>
            <Button size="sm" onClick={() => setPreview(false)}>
              Exit member view
            </Button>
          </div>
        )}
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-[12rem_minmax(0,1fr)]">
        <OrgNavigation nav={nav} value={section} onChange={go} />
        <div className="min-w-0 space-y-6">
          {section === "overview" && (
            <>
              {canSeeMembers && (
                <RequiresDatabase feature="overview" fallback={null}>
                  <OrgOverview
                    org={org}
                    canSeeRevenue={canSeeRevenue}
                    canSeeBoards={canSeeBoards}
                  />
                </RequiresDatabase>
              )}
              {(canManage || canInvite) && (
                <ShareJoinPage
                  org={org}
                  {...(isSettingsSection(nav, "payments")
                    ? { onOpenPayments: () => go("payments") }
                    : {})}
                />
              )}
              <MemberOverview org={org} orgs={orgs} />
              <RequiresDatabase feature="memberships" fallback={null}>
                <MyMembershipCard org={org} />
              </RequiresDatabase>
              <RequiresDatabase feature="directory" fallback={null}>
                <DirectoryPreference org={org} />
              </RequiresDatabase>
              {!canSeeMembers && <p className="text-muted-foreground">Welcome to {org.name}.</p>}
            </>
          )}
          {section === "members" && (
            <MembersTab
              key={org.id}
              org={org}
              orgs={orgs}
              canInvite={canInvite}
              canAssignAdmin={canManageRoles}
              canManageMembers={hasPermission(grants, "members.manage", org)}
              grants={grants}
            />
          )}
          {section === "directory" && (
            <RequiresDatabase feature="directory">
              <MembersDirectory orgId={org.id} />
            </RequiresDatabase>
          )}
          {section === "board" && (
            <RequiresDatabase feature="board">
              <BoardTab
                org={org}
                canManage={canManageBoard}
                {...(isSettingsSection(nav, "board-settings")
                  ? { onOpenSettings: () => go("board-settings") }
                  : {})}
              />
            </RequiresDatabase>
          )}
          {section === "board-settings" && (
            <RequiresDatabase feature="board">
              <BoardSettingsTab
                org={org}
                grants={grants}
                canManage={canManageBoard}
                canDefine={canDefineSeats}
                canManageRules={canManage}
              />
            </RequiresDatabase>
          )}
          {section === "reports" && (
            <RequiresDatabase feature="reports">
              <ReportsTab
                org={org}
                canSeeMembers={canSeeMembers}
                canSeeRevenue={canSeeRevenue}
                canSeeBoards={canSeeBoards}
              />
            </RequiresDatabase>
          )}
          {section === "chapters" && (
            <>
              <div className="flex justify-end">
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
                      <Link
                        to="/orgs/$orgId"
                        params={{ orgId: c.id }}
                        className="flex justify-between px-5 py-3 hover:bg-muted"
                      >
                        <span>{c.name}</span>
                        <Badge variant="outline">{TYPE_LABEL[c.type]}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {section === "settings" && (
            <>
              <SettingsTab key={org.id} org={org} />
              <DeleteDemoOrg org={org} orgs={orgs} />
            </>
          )}
          {section === "setup" && (
            <SetupCards
              org={org}
              canManagePayments={hasPermission(grants, "payments.manage", org)}
            />
          )}
          {section === "levels" && (
            <LevelsTab
              org={org}
              orgs={orgs}
              canManage={hasPermission(grants, "tiers.manage", org)}
            />
          )}
          {section === "fields" && <AttributesTab org={org} canManage={canManageFields} />}
          {section === "chapter-fields" &&
            (hasChapters ? (
              <AttributesTab org={org} canManage={canManageFields} subject="chapter" />
            ) : (
              <ChapterFieldsCard
                org={org}
                orgs={orgs}
                grants={grants}
                empty={
                  <p className="text-muted-foreground">
                    {parent?.name ?? "Your parent organization"} hasn't defined any chapter fields.
                  </p>
                }
              />
            ))}
          {section === "roles" && <RolesTab org={org} orgs={orgs} grants={grants} />}
          {section === "payments" && (
            <RequiresDatabase feature="payments">
              <PaymentsTab org={org} canManage={hasPermission(grants, "payments.manage", org)} />
            </RequiresDatabase>
          )}
          {section === "audit" && <AuditLogTab orgId={org.id} orgName={org.name} />}
        </div>
      </div>
    </div>
  );
}
