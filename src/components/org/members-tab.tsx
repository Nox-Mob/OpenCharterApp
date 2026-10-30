import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { inviteSchema, inviteStatus, inviteUrl } from "@/modules/invitations";
import { availableRoles, canRemove, type Assignment } from "@/modules/roles";
import type { Org } from "@/lib/orgs";
import { MemberDetailsDialog } from "./member-details-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function MembersTab({
  org,
  canInvite,
  canAssignAdmin,
  canManageMembers,
}: {
  org: Org;
  canInvite: boolean;
  canAssignAdmin: boolean;
  canManageMembers: boolean;
}) {
  const orgId = org.id;
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null });
  const [details, setDetails] = useState<{ id: string; display_name: string; email: string; user_id: string } | null>(null);
  const roles = useQuery({
    queryKey: ["role-assignments", orgId],
    enabled: canAssignAdmin,
    queryFn: async (): Promise<(Assignment & { role_name: string })[]> => {
      const { data, error } = await supabase.from("role_assignments").select("id,user_id,org_id,roles(key,name)").eq("org_id", orgId);
      if (error) throw error;
      return (data ?? []).map((r) => {
        const role = r.roles as { key: string; name: string } | null;
        return { id: r.id, user_id: r.user_id, org_id: r.org_id, role_key: role?.key ?? "", role_name: role?.name ?? "" };
      });
    },
  });
  async function assign(userId: string, roleKey: string) {
    const { error } = await supabase.rpc("assign_role", { _org: orgId, _user: userId, _role_key: roleKey });
    if (error) return void toast.error("Couldn't assign that role");
    toast.success("Role assigned");
    qc.invalidateQueries();
  }
  async function unassign(id: string) {
    const { error } = await supabase.rpc("remove_role", { _assignment: id });
    if (error) return void toast.error(error.message.includes("at least one admin") ? "An organization must keep at least one admin" : "Couldn't remove that role");
    toast.success("Role removed");
    qc.invalidateQueries();
  }
  const members = useQuery({
    queryKey: ["members", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_member_profiles")
        .select("id,user_id,display_name,email,created_at")
        .eq("org_id", orgId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
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
  const [role, setRole] = useState<"member" | "org_admin">("member");
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
            <Input aria-label="Email" type="email" placeholder="name@example.org" value={email} onChange={(e) => setEmail(e.target.value)} className="max-w-xs" required />
            <Select value={role} onValueChange={(v) => setRole(v as "member" | "org_admin")}>
              <SelectTrigger className="w-44" aria-label="Role"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                {canAssignAdmin && <SelectItem value="org_admin">Organization admin</SelectItem>}
              </SelectContent>
            </Select>
            <Button type="submit">Create invite link</Button>
          </form>
          {link && (
            <div className="mt-4 rounded-md bg-muted p-3 text-sm">
              <p className="text-muted-foreground">Send this link to the person. It works once, for that email only, and expires in 14 days.</p>
              <div className="mt-2 flex gap-2">
                <Input readOnly value={link} aria-label="Invite link" />
                <Button type="button" variant="secondary" onClick={() => { navigator.clipboard.writeText(link); toast.success("Copied"); }}>Copy</Button>
              </div>
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-2 text-lg font-semibold">Members</h2>
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead>{canAssignAdmin && <TableHead>Roles</TableHead>}<TableHead>Joined</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {(members.data ?? []).map((m) => (
              <TableRow key={m.id}>
                <TableCell>{m.display_name || "—"}</TableCell>
                <TableCell>{m.email}</TableCell>
                {canAssignAdmin && (
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      {(roles.data ?? []).filter((r) => r.user_id === m.user_id).map((r) => (
                        <Badge key={r.id} variant="secondary" className="gap-1">
                          {r.role_name}
                          {canRemove(r, roles.data ?? [], org.parent_id !== null) && (
                            <button aria-label={`Remove ${r.role_name} from ${m.email}`} onClick={() => unassign(r.id)}><X className="h-3 w-3" /></button>
                          )}
                        </Badge>
                      ))}
                      {availableRoles(m.user_id, orgId, roles.data ?? []).length > 0 && (
                        <Select value="" onValueChange={(k) => assign(m.user_id, k)}>
                          <SelectTrigger className="h-7 w-28 text-xs" aria-label={`Add role for ${m.email}`}><SelectValue placeholder="Add role" /></SelectTrigger>
                          <SelectContent>
                            {availableRoles(m.user_id, orgId, roles.data ?? []).map((r) => <SelectItem key={r.key} value={r.key}>{r.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </TableCell>
                )}
                <TableCell>{new Date(m.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setDetails(m)}>Details</Button>
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
            <TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {invites.data!.map((i) => {
                const s = inviteStatus(i);
                return (
                  <TableRow key={i.id}>
                    <TableCell>{i.email}</TableCell>
                    <TableCell>{(i.roles as { name: string } | null)?.name}</TableCell>
                    <TableCell><Badge variant={s === "pending" ? "default" : "secondary"} className="capitalize">{s}</Badge></TableCell>
                    <TableCell className="text-right">
                      {s === "pending" && <Button size="sm" variant="ghost" onClick={() => revoke(i.id)}>Revoke</Button>}
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
        profile={details}
        canEdit={canManageMembers}
        isSelf={!!details && details.user_id === me.data}
        onClose={() => setDetails(null)}
      />
    </div>
  );
}
