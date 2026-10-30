import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { inviteSchema, inviteStatus, inviteUrl } from "@/modules/invitations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function MembersTab({ orgId, canInvite, canAssignAdmin }: { orgId: string; canInvite: boolean; canAssignAdmin: boolean }) {
  const qc = useQueryClient();
  const members = useQuery({
    queryKey: ["members", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_member_profiles")
        .select("id,display_name,email,created_at")
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
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Joined</TableHead></TableRow></TableHeader>
          <TableBody>
            {(members.data ?? []).map((m) => (
              <TableRow key={m.id}>
                <TableCell>{m.display_name || "—"}</TableCell>
                <TableCell>{m.email}</TableCell>
                <TableCell>{new Date(m.created_at).toLocaleDateString()}</TableCell>
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
    </div>
  );
}
