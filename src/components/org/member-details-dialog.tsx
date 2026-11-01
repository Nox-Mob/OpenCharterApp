import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Org } from "@/lib/orgs";
import { attributeDefsQuery, memberValuesQuery } from "@/modules/attributes/queries";
import { firstValueError, saveAttributeValues } from "@/modules/attributes/values";
import { inviteUrl } from "@/modules/invitations";
import {
  memberRecordSchema,
  membershipErrorMessage,
  updateMemberRecord,
  type MemberRow,
} from "@/modules/membership/memberships";
import { AttributeValueInput } from "@/components/attributes/attribute-value-input";
import { MembershipPanel } from "@/components/membership/membership-panel";
import { RequiresDatabase } from "@/components/db/requires-database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function MemberDetailsDialog({
  org,
  member,
  canEdit,
  canRecordPayments,
  canInvite,
  graceDays,
  isSelf,
  onClose,
}: {
  org: Org;
  member: MemberRow | null;
  canEdit: boolean;
  canRecordPayments: boolean;
  canInvite: boolean;
  graceDays: number;
  isSelf: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const defs = useQuery(attributeDefsQuery(org.id, org.ancestor_ids));
  const values = useQuery({ ...memberValuesQuery(member?.id ?? ""), enabled: !!member });
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(values.data ?? {}), [values.data]);

  const memberDefs = (defs.data ?? []).filter((d) => d.applies_to === "member" && d.active);
  const editable = (d: (typeof memberDefs)[number]) => canEdit || (isSelf && d.member_editable);

  async function save() {
    if (!member) return;
    const err = firstValueError(memberDefs.filter(editable), draft);
    if (err) return void toast.error(err);
    setBusy(true);
    try {
      await saveAttributeValues(memberDefs.filter(editable), member.id, draft, values.data);
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["attribute-values", member.id] });
    } catch {
      toast.error("Couldn't save these details");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!member} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-lg flex-col gap-0 p-0">
        <DialogHeader className="border-b px-6 pb-4 pt-6">
          <DialogTitle>{member?.display_name || member?.email}</DialogTitle>
        </DialogHeader>
        {member && (
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-4">
            <RequiresDatabase feature="memberships">
              <MembershipPanel
                org={org}
                member={member}
                graceDays={graceDays}
                canManage={canEdit}
                canRecordPayments={canRecordPayments}
              />
            </RequiresDatabase>
            {member.user_id === null && (
              <RecordContact member={member} canEdit={canEdit} canInvite={canInvite} org={org} />
            )}
            <section className="space-y-4">
              <h3 className="font-semibold">Member fields</h3>
              {memberDefs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This organization doesn't track any member fields yet.
                </p>
              ) : (
                <>
                  {memberDefs.map((d) => (
                    <div key={d.id} className="space-y-1">
                      <Label>
                        {d.label}
                        {d.required ? " *" : ""}
                      </Label>
                      <AttributeValueInput
                        def={d}
                        value={draft[d.id]}
                        disabled={!editable(d)}
                        onChange={(v) => setDraft({ ...draft, [d.id]: v })}
                      />
                    </div>
                  ))}
                  {memberDefs.some(editable) && (
                    <Button onClick={save} disabled={busy}>
                      {busy ? "Saving…" : "Save member fields"}
                    </Button>
                  )}
                </>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Name and email of a record without a login, and an invitation to claim it (D-116). */
function RecordContact({
  org,
  member,
  canEdit,
  canInvite,
}: {
  org: Org;
  member: MemberRow;
  canEdit: boolean;
  canInvite: boolean;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(member.display_name);
  const [email, setEmail] = useState(member.email);
  const [link, setLink] = useState<string | null>(null);

  async function saveContact() {
    const parsed = memberRecordSchema.safeParse({ display_name: name, email });
    if (!parsed.success)
      return void toast.error(parsed.error.issues[0]?.message ?? "Check the form");
    try {
      await updateMemberRecord(member.id, parsed.data);
      toast.success("Contact details saved");
      qc.invalidateQueries({ queryKey: ["members", org.id] });
    } catch (e) {
      toast.error(membershipErrorMessage(String((e as Error).message)));
    }
  }

  async function invite() {
    const { data, error } = await supabase.rpc("create_invitation", {
      _org: org.id,
      _email: member.email,
      _role_key: "member",
    });
    if (error) return void toast.error("Couldn't create the invitation");
    setLink(inviteUrl(window.location.origin, data as string));
    qc.invalidateQueries({ queryKey: ["invites", org.id] });
  }

  return (
    <section className="space-y-3 rounded-md border p-4">
      <h3 className="font-semibold">Contact (no login yet)</h3>
      <p className="text-sm text-muted-foreground">
        This member was added by an admin and can't sign in. Once they have an email, send an
        invitation: accepting it links this record to their login.
      </p>
      {canEdit && (
        <div className="space-y-2">
          <Label htmlFor="record-name">Name</Label>
          <Input id="record-name" value={name} onChange={(e) => setName(e.target.value)} />
          <Label htmlFor="record-email">Email</Label>
          <Input
            id="record-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button size="sm" variant="outline" onClick={saveContact}>
            Save contact details
          </Button>
        </div>
      )}
      {canInvite && member.email && (
        <div className="space-y-2">
          <Button size="sm" onClick={invite}>
            Create login invitation
          </Button>
          {link && (
            <div className="flex gap-2">
              <Input readOnly value={link} aria-label="Invitation link" />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  navigator.clipboard.writeText(link);
                  toast.success("Copied");
                }}
              >
                Copy
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Send the link yourself for now. It works once, for {member.email} only, and expires in
            14 days.
          </p>
        </div>
      )}
    </section>
  );
}
