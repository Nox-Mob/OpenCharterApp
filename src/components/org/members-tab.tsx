import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  graceDaysQuery,
  membersQuery,
  membershipErrorMessage,
} from "@/modules/membership/memberships";
import { expirationLabel, standing, today } from "@/modules/membership/standing";
import { StandingBadge } from "@/components/membership/standing-badge";
import { AddMemberDialog } from "@/components/membership/add-member-dialog";
import { MemberDetailsDialog } from "./member-details-dialog";
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

export function MembersTab({
  org,
  canInvite,
  canAssignAdmin,
  canManageMembers,
  grants,
}: {
  org: Org;
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
  const members = useQuery(membersQuery(orgId));
  const grace = useQuery(graceDaysQuery(orgId));
  const graceDays = grace.data ?? 30;
  const on = today();
  const details = (members.data ?? []).find((m) => m.id === detailsId) ?? null;
  const applications = (members.data ?? []).filter((m) => m.membership?.status === "pending");
  async function decide(membershipId: string, action: "approve" | "decline") {
    try {
      await decideMembership(membershipId, action);
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

      {canManageMembers && applications.length > 0 && (
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
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Members</h2>
          {canManageMembers && <Button onClick={() => setAdding(true)}>Add member</Button>}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Standing</TableHead>
              <TableHead>Level</TableHead>
              <TableHead>Expires</TableHead>
              {canAssignAdmin && <TableHead>Roles</TableHead>}
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(members.data ?? []).map((m) => (
              <TableRow key={m.id}>
                <TableCell>{m.display_name || "—"}</TableCell>
                <TableCell>
                  {m.email || "—"}
                  {!m.user_id && (
                    <Badge variant="outline" className="ml-2">
                      No login
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <StandingBadge standing={standing(m.membership, graceDays, on)} />
                </TableCell>
                <TableCell className="text-sm">
                  {m.membership ? `${m.membership.tier_name} · ${m.membership.term_label}` : "—"}
                </TableCell>
                <TableCell className="text-sm">
                  {m.membership?.status === "active" && m.membership.paid_through && (
                    <span className="block">{m.membership.paid_through}</span>
                  )}
                  <span className="text-muted-foreground">{expirationLabel(m.membership, on)}</span>
                </TableCell>
                {canAssignAdmin && (
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
                  <Button size="sm" variant="ghost" onClick={() => setDetailsId(m.id)}>
                    Details
                  </Button>
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
