import { useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { inviteSchema, inviteStatus, inviteUrl } from "@/modules/invitations";
import {
  availableRoles,
  canGrantRole,
  canRemove,
  rolesForOrg,
  type Assignment,
} from "@/modules/roles";
import { rolesQuery } from "@/modules/roles/queries";
import type { Org } from "@/lib/orgs";
import { hasPermission, type Grant } from "@/lib/policy";
import {
  decideMembership,
  graceDaysByOrgQuery,
  graceDaysQuery,
  membersQuery,
  treeMembersQuery,
  membershipErrorMessage,
} from "@/modules/membership/memberships";
import { expirationLabel, STANDING_LABELS, standing, today } from "@/modules/membership/standing";
import { StandingBadge } from "@/components/membership/standing-badge";
import { AddMemberDialog } from "@/components/membership/add-member-dialog";
import { useFeatureReady } from "@/lib/db/readiness";
import { homeChapterInfoQuery } from "@/modules/membership/home-chapter";
import { chapterNationalStandingQuery } from "@/modules/membership/national-standing";
import { joinRequirementsQuery } from "@/modules/membership/joining";
import { declineApplication } from "@/modules/payments/payments.functions";
import { MemberDetailsDialog } from "./member-details-dialog";
import { RosterToolbar } from "@/components/members/roster-toolbar";
import {
  attributeDefsQuery,
  orgMemberValuesQuery,
  treeMemberValuesQuery,
} from "@/modules/attributes/queries";
import { privacyRulesQuery } from "@/modules/members/privacy";
import {
  EMPTY_FILTER,
  exportableRows,
  exportableTreeRows,
  fieldText,
  isListed,
  exportColumns,
  filterRoster,
  logExport,
  sortRoster,
  toCsv,
  toRosterRows,
  type RosterField,
  type RosterFilter,
  type RosterSort,
} from "@/modules/members/roster";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * The Members page. A national or region admin sees everyone in their org and every org below it
 * by default (D-154: members.view inherits downward, so a chapter admin only ever gets their
 * chapter); "only <org>" narrows it to the org's own records, where roles, details and exports
 * work. Admins see every member regardless of directory choices (D-139); that only affects the
 * directory and exports.
 */
export function MembersTab({
  org,
  orgs = [],
  canInvite,
  canAssignAdmin,
  canManageMembers,
  grants,
}: {
  org: Org;
  /** Orgs the viewer can see; the ones below `org` join the "everyone" list. */
  orgs?: readonly Org[];
  canInvite: boolean;
  canAssignAdmin: boolean;
  canManageMembers: boolean;
  grants: Grant[];
}) {
  const orgId = org.id;
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
  });
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const canRecordPayments = hasPermission(grants, "payments.manage", org);
  const allRoles = useQuery(rolesQuery());
  const usable = rolesForOrg(allRoles.data ?? [], org);
  const invitable = usable.filter(
    (r) => r.key === "member" || (canAssignAdmin && canGrantRole(r, grants, org)),
  );
  const roles = useQuery({
    queryKey: ["role-assignments", orgId],
    enabled: canAssignAdmin,
    queryFn: async (): Promise<(Assignment & { role_name: string })[]> => {
      const { data, error } = await supabase
        .from("role_assignments")
        .select("id,user_id,org_id,roles(key,name)")
        .eq("org_id", orgId);
      if (error) throw error;
      return (data ?? []).map((r) => {
        const role = r.roles as { key: string; name: string } | null;
        return {
          id: r.id,
          user_id: r.user_id,
          org_id: r.org_id,
          role_key: role?.key ?? "",
          role_name: role?.name ?? "",
        };
      });
    },
  });
  async function assign(userId: string, roleKey: string) {
    const { error } = await supabase.rpc("assign_role", {
      _org: orgId,
      _user: userId,
      _role_key: roleKey,
    });
    if (error)
      return void toast.error(
        error.message.includes("permissions you hold")
          ? "You can only grant permissions you hold"
          : "Couldn't assign that role",
      );
    toast.success("Role assigned");
    qc.invalidateQueries();
  }
  async function unassign(id: string) {
    const { error } = await supabase.rpc("remove_role", { _assignment: id });
    if (error)
      return void toast.error(
        error.message.includes("at least one admin")
          ? "An organization must keep at least one admin"
          : "Couldn't remove that role",
      );
    toast.success("Role removed");
    qc.invalidateQueries();
  }
  // Membership features wait for migration 0008 (readiness guard, D-135).
  const ready = useFeatureReady("memberships") === true;
  const directoryReady = useFeatureReady("directory") === true;
  // Home-chapter model (A8, D-166): chapters list the members who chose them; the national's own
  // list already holds everyone, with each member's chapter.
  const homeReady = useFeatureReady("home_chapter") === true;
  const homeInfo = useQuery({ ...homeChapterInfoQuery(org.slug), enabled: homeReady });
  const homeModel = homeInfo.data?.model === "home_chapter";
  const members = useQuery(membersQuery(orgId, ready, directoryReady, homeReady));
  const subtree = [org, ...orgs.filter((o) => o.id !== org.id && o.ancestor_ids.includes(org.id))];
  const subtreeIds = subtree.map((o) => o.id);
  const hasBelow = subtree.length > 1 && !homeModel;
  const showChapter = homeModel && org.type === "national";
  // A5 (D-178): a chapter whose national requires its own membership sees each member's national
  // standing (separate model only; in the home-chapter model standing is already national's).
  const standingReady = useFeatureReady("national_standing") === true;
  const req = useQuery({
    ...joinRequirementsQuery(org.id),
    enabled: !!org.parent_id && !homeModel,
  });
  const showNational =
    standingReady && !!org.parent_id && !homeModel && !!req.data?.national_required;
  const nationalStanding = useQuery({
    ...chapterNationalStandingQuery(org.id),
    enabled: showNational,
  });
  const chapterName = new Map((homeInfo.data?.chapters ?? []).map((c) => [c.id, c.name]));
  const [scope, setScope] = useState<"tree" | "org">(hasBelow ? "tree" : "org");
  const isTree = hasBelow && scope === "tree";
  const tree = useQuery({ ...treeMembersQuery(subtreeIds), enabled: isTree && ready });
  const treeValues = useQuery({ ...treeMemberValuesQuery(subtreeIds), enabled: isTree });
  const treeGrace = useQuery({ ...graceDaysByOrgQuery(subtreeIds), enabled: isTree && ready });
  const orgName = new Map(subtree.map((o) => [o.id, o.name]));
  const privacy = useQuery({
    ...privacyRulesQuery(orgId, org.ancestor_ids),
    enabled: directoryReady,
  });
  const [includeOptedOut, setIncludeOptedOut] = useState(false);
  const grace = useQuery({ ...graceDaysQuery(orgId), enabled: ready });
  const graceDays = grace.data ?? 30;
  const on = today();
  const details = (members.data ?? []).find((m) => m.id === detailsId) ?? null;
  // Member list tools (E-14): search, filters, sort, saved views and audited export.
  const exportsReady = useFeatureReady("exports") === true;
  const defs = useQuery(attributeDefsQuery(org.id, org.ancestor_ids));
  const ownValues = useQuery(orgMemberValuesQuery(orgId));
  const listData = isTree ? (tree.data ?? []) : (members.data ?? []);
  const valueData = isTree ? (treeValues.data ?? {}) : (ownValues.data ?? {});
  const [filter, setFilter] = useState<RosterFilter>(EMPTY_FILTER);
  const [sort, setSort] = useState<RosterSort>("name");
  const rosterFields: RosterField[] = (defs.data ?? [])
    .filter((d) => d.applies_to === "member" && d.active)
    .map((d) => ({
      id: d.id,
      label: d.label,
      data_type: d.data_type,
      visibility: d.visibility,
      options: d.options,
    }));
  const rows = toRosterRows(
    listData,
    valueData,
    isTree ? (m) => treeGrace.data?.[m.org_id ?? orgId] ?? graceDays : graceDays,
    on,
  );
  const isOwn = (m: { org_id?: string }) => !m.org_id || m.org_id === orgId;
  const visible = sortRoster(filterRoster(rows, filter, rosterFields), sort);
  const levels = [
    ...new Map(
      rows
        .filter((r) => r.membership)
        .map((r) => [
          r.membership!.tier_id,
          { id: r.membership!.tier_id, name: r.membership!.tier_name },
        ]),
    ).values(),
  ];
  const canExport = exportsReady && hasPermission(grants, "members.export", org);
  // Members who opted out of the directory stay out of exports unless included (D-139). Across
  // the tree each row follows its own org's directory default and export rule (A7, D-179).
  const listedByDefault = privacy.data?.listedByDefault ?? true;
  const overrideAllowed = privacy.data?.adminOverrideAllowed ?? true;
  const treePrivacy = useQueries({
    queries: subtree.map((o) => ({
      ...privacyRulesQuery(o.id, o.ancestor_ids),
      enabled: isTree && directoryReady,
    })),
  });
  const rulesFor = (id: string | undefined) => {
    const i = subtree.findIndex((o) => o.id === (id ?? orgId));
    return treePrivacy[i]?.data ?? { listedByDefault: true, adminOverrideAllowed: true };
  };
  const listedHere = (m: { directory_listed?: boolean | null; org_id?: string }) =>
    isTree ? isListed(m, rulesFor(m.org_id).listedByDefault) : isListed(m, listedByDefault);
  const optedOut = directoryReady ? visible.filter((r) => !listedHere(r)).length : 0;
  const toExport = !directoryReady
    ? visible
    : isTree
      ? exportableTreeRows(visible, rulesFor, includeOptedOut)
      : exportableRows(visible, { orgDefault: listedByDefault, includeOptedOut, overrideAllowed });
  // Member fields shown as extra columns (A7), remembered per viewer in this browser.
  const [extraCols, setExtraCols] = useStoredColumns(orgId);
  const shownFields = rosterFields.filter((f) => extraCols.includes(f.id));

  async function exportCsv() {
    const columns = exportColumns(
      rosterFields,
      hasPermission(grants, "members.view", org),
      (s) => STANDING_LABELS[s],
    ).filter(
      (c) =>
        ready || !["standing", "level", "term", "member_since", "paid_through"].includes(c.key),
    );
    if (isTree)
      columns.splice(2, 0, {
        key: "organization",
        label: "Organization",
        value: (r) => orgName.get(r.org_id ?? orgId) ?? "",
      });
    try {
      // Audited first (D-138); no log, no file.
      await logExport(
        orgId,
        toExport.length,
        columns.map((c) => c.label),
        {
          ...filter,
          include_opted_out: includeOptedOut && (isTree || overrideAllowed),
          ...(isTree ? { scope: "tree" } : {}),
        },
      );
    } catch {
      return void toast.error("Couldn't export: you may not have permission to export members");
    }
    const blob = new Blob(["\uFEFF" + toCsv(toExport, columns)], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${org.slug}-members-${on}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`Exported ${toExport.length} member${toExport.length === 1 ? "" : "s"}`);
  }
  const applications = (members.data ?? []).filter((m) => m.membership?.status === "pending");
  const joiningReady = useFeatureReady("joining") === true;
  async function decide(membershipId: string, action: "approve" | "decline") {
    try {
      if (action === "decline" && joiningReady) {
        // Online applicants paid first: declining refunds them (E-13b).
        const r = await declineApplication({ data: { membershipId, note: "" } });
        if (r.refund === "failed")
          toast.warning("Declined, but the refund didn't go through. Refund it in Stripe.");
      } else await decideMembership(membershipId, action);
      toast.success(action === "approve" ? "Application approved" : "Application declined");
      qc.invalidateQueries({ queryKey: ["members", orgId] });
    } catch (e) {
      toast.error(membershipErrorMessage(String((e as Error).message)));
    }
  }
  const invites = useQuery({
    queryKey: ["invites", orgId],
    enabled: canInvite,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invitations")
        .select("id,email,expires_at,accepted_at,revoked_at,roles(name)")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [link, setLink] = useState<string | null>(null);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const parsed = inviteSchema.safeParse({ email, role });
    if (!parsed.success) return void toast.error(parsed.error.issues[0]?.message);
    const { data, error } = await supabase.rpc("create_invitation", {
      _org: orgId,
      _email: parsed.data.email,
      _role_key: parsed.data.role,
    });
    if (error) return void toast.error("Couldn't create the invitation");
    setLink(inviteUrl(window.location.origin, data as string));
    setEmail("");
    qc.invalidateQueries({ queryKey: ["invites", orgId] });
  }

  async function revoke(id: string) {
    const { error } = await supabase.rpc("revoke_invitation", { _id: id });
    if (error) return void toast.error("Couldn't revoke");
    qc.invalidateQueries({ queryKey: ["invites", orgId] });
  }

  return (
    <div className="space-y-8">
      {canInvite && (
        <section className="rounded-md border bg-card p-5">
          <h2 className="text-lg font-semibold">Invite someone</h2>
          <form onSubmit={invite} className="mt-3 flex flex-wrap gap-2">
            <Input
              aria-label="Email"
              type="email"
              placeholder="name@example.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="max-w-xs"
              required
            />
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-44" aria-label="Role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {invitable.map((r) => (
                  <SelectItem key={r.key} value={r.key}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit">Create invite link</Button>
          </form>
          {link && (
            <div className="mt-4 rounded-md bg-muted p-3 text-sm">
              <p className="text-muted-foreground">
                Send this link to the person. It works once, for that email only, and expires in 14
                days.
              </p>
              <div className="mt-2 flex gap-2">
                <Input readOnly value={link} aria-label="Invite link" />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(link);
                    toast.success("Copied");
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {ready && canManageMembers && applications.length > 0 && (
        <section className="rounded-md border bg-card p-5">
          <h2 className="text-lg font-semibold">Applications ({applications.length})</h2>
          <ul className="mt-3 divide-y">
            {applications.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {a.display_name || a.email}{" "}
                  <span className="text-sm text-muted-foreground">
                    · {a.membership!.tier_name}, {a.membership!.term_label}
                  </span>
                </span>
                <span className="space-x-1">
                  <Button size="sm" onClick={() => decide(a.membership!.id, "approve")}>
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => decide(a.membership!.id, "decline")}
                  >
                    Decline
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">Members</h2>
            {hasBelow && (
              <Select value={scope} onValueChange={(v) => setScope(v as "tree" | "org")}>
                <SelectTrigger className="w-72" aria-label="Whose members">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tree">
                    Everyone in {org.name} and below ({subtree.length} organizations)
                  </SelectItem>
                  <SelectItem value="org">Only {org.name}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          {ready && canManageMembers && <Button onClick={() => setAdding(true)}>Add member</Button>}
        </div>
        <div className="mb-3">
          <RosterToolbar
            orgId={orgId}
            filter={filter}
            onFilter={setFilter}
            sort={sort}
            onSort={setSort}
            fields={rosterFields}
            levels={levels}
            showMembership={ready}
            canSaveViews={exportsReady && canManageMembers}
            canUseViews={exportsReady}
            canExport={canExport}
            onExport={exportCsv}
            optedOut={canExport ? optedOut : 0}
            includeOptedOut={includeOptedOut}
            onIncludeOptedOut={setIncludeOptedOut}
            overrideAllowed={overrideAllowed}
            shown={visible.length}
            total={rows.length}
          />
          {isTree && (
            <p className="mt-2 text-xs text-muted-foreground">
              Showing every organization below {org.name}. Open a member&apos;s organization to
              manage them, or switch to &ldquo;Only {org.name}&rdquo; to change roles. Exports
              follow each organization&apos;s directory rules.
            </p>
          )}
          {rosterFields.length > 0 && (
            <ColumnPicker fields={rosterFields} chosen={extraCols} onChange={setExtraCols} />
          )}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              {isTree && <TableHead>Organization</TableHead>}
              {showChapter && <TableHead>Chapter</TableHead>}
              {shownFields.map((f) => (
                <TableHead key={f.id}>{f.label}</TableHead>
              ))}
              {ready && (
                <>
                  <TableHead>Standing</TableHead>
                  {showNational && <TableHead>{req.data!.national.name}</TableHead>}
                  <TableHead>Level</TableHead>
                  <TableHead>Expires</TableHead>
                </>
              )}
              {canAssignAdmin && !isTree && <TableHead>Roles</TableHead>}
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((m) => (
              <TableRow key={m.id}>
                <TableCell>{m.display_name || "—"}</TableCell>
                <TableCell>
                  {m.email || "—"}
                  {!m.user_id && (
                    <Badge variant="outline" className="ml-2">
                      No login
                    </Badge>
                  )}
                  {directoryReady && !listedHere(m) && (
                    <Badge variant="outline" className="ml-2">
                      Not in directory
                    </Badge>
                  )}
                </TableCell>
                {isTree && (
                  <TableCell className="text-sm">{orgName.get(m.org_id ?? orgId) ?? "—"}</TableCell>
                )}
                {showChapter && (
                  <TableCell className="text-sm">
                    {(m.membership?.home_org_id && chapterName.get(m.membership.home_org_id)) ||
                      "—"}
                  </TableCell>
                )}
                {shownFields.map((f) => (
                  <TableCell key={f.id} className="text-sm">
                    {fieldText(f, m.values[f.id]) || "—"}
                  </TableCell>
                ))}
                {ready && (
                  <>
                    <TableCell>
                      <StandingBadge standing={m.standing} />
                    </TableCell>
                    {showNational && (
                      <TableCell>
                        <StandingBadge standing={nationalStanding.data?.get(m.id) ?? "none"} />
                      </TableCell>
                    )}
                    <TableCell className="text-sm">
                      {m.membership
                        ? `${m.membership.tier_name} · ${m.membership.term_label}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {m.membership?.status === "active" && m.membership.paid_through && (
                        <span className="block">{m.membership.paid_through}</span>
                      )}
                      <span className="text-muted-foreground">
                        {expirationLabel(m.membership, on)}
                      </span>
                    </TableCell>
                  </>
                )}
                {canAssignAdmin && !isTree && (
                  <TableCell>
                    {m.user_id === null ? (
                      <span className="text-sm text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1">
                        {(roles.data ?? [])
                          .filter((r) => r.user_id === m.user_id)
                          .map((r) => (
                            <Badge key={r.id} variant="secondary" className="gap-1">
                              {r.role_name}
                              {canRemove(r, roles.data ?? [], org.parent_id !== null) && (
                                <button
                                  aria-label={`Remove ${r.role_name} from ${m.email}`}
                                  onClick={() => unassign(r.id)}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </Badge>
                          ))}
                        {(() => {
                          const options = availableRoles(
                            m.user_id!,
                            orgId,
                            roles.data ?? [],
                            usable,
                            grants,
                            org,
                          );
                          if (options.length === 0) return null;
                          return (
                            <Select value="" onValueChange={(k) => assign(m.user_id!, k)}>
                              <SelectTrigger
                                className="h-7 w-28 text-xs"
                                aria-label={`Add role for ${m.email}`}
                              >
                                <SelectValue placeholder="Add role" />
                              </SelectTrigger>
                              <SelectContent>
                                {options.map((r) => (
                                  <SelectItem key={r.key} value={r.key}>
                                    {r.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          );
                        })()}
                      </div>
                    )}
                  </TableCell>
                )}
                <TableCell className="text-right">
                  {isOwn(m) ? (
                    <Button size="sm" variant="ghost" onClick={() => setDetailsId(m.id)}>
                      Details
                    </Button>
                  ) : (
                    <Button asChild size="sm" variant="ghost">
                      <Link
                        to="/orgs/$orgId"
                        params={{ orgId: m.org_id! }}
                        search={{ tab: "members" }}
                      >
                        Open
                      </Link>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {canInvite && (invites.data?.length ?? 0) > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Invitations</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.data!.map((i) => {
                const s = inviteStatus(i);
                return (
                  <TableRow key={i.id}>
                    <TableCell>{i.email}</TableCell>
                    <TableCell>{(i.roles as { name: string } | null)?.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant={s === "pending" ? "default" : "secondary"}
                        className="capitalize"
                      >
                        {s}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {s === "pending" && (
                        <Button size="sm" variant="ghost" onClick={() => revoke(i.id)}>
                          Revoke
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>
      )}
      <MemberDetailsDialog
        org={org}
        member={details}
        canEdit={canManageMembers}
        canRecordPayments={canRecordPayments}
        canInvite={canInvite}
        graceDays={graceDays}
        isSelf={!!details && details.user_id === me.data}
        onClose={() => setDetailsId(null)}
      />
      <AddMemberDialog
        orgId={orgId}
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(id) => {
          setAdding(false);
          setDetailsId(id);
        }}
      />
    </div>
  );
}

/** Extra member-field columns, remembered per viewer and org in this browser (A7). */
function useStoredColumns(orgId: string): [string[], (v: string[]) => void] {
  const key = `opencharter.member-columns.${orgId}`;
  const [cols, setCols] = useState<string[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown;
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  });
  const save = (v: string[]) => {
    setCols(v);
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      // private mode: the choice lasts until the page closes
    }
  };
  return [cols, save];
}

function ColumnPicker({
  fields,
  chosen,
  onChange,
}: {
  fields: readonly RosterField[];
  chosen: readonly string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <Button size="sm" variant="outline" onClick={() => setOpen(!open)} aria-expanded={open}>
        Columns{chosen.length ? ` (${chosen.length})` : ""}
      </Button>
      {open && (
        <fieldset className="mt-2 flex flex-wrap gap-3 rounded-md border p-3 text-sm">
          <legend className="sr-only">Member fields to show as columns</legend>
          {fields.map((f) => (
            <label key={f.id} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={chosen.includes(f.id)}
                onChange={(e) =>
                  onChange(e.target.checked ? [...chosen, f.id] : chosen.filter((x) => x !== f.id))
                }
              />
              {f.label}
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
