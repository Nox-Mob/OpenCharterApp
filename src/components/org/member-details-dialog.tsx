import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Org } from "@/lib/orgs";
import { attributeDefsQuery, memberValuesQuery } from "@/modules/attributes/queries";
import { firstValueError, saveAttributeValues } from "@/modules/attributes/values";
import { AttributeValueInput } from "@/components/attributes/attribute-value-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function MemberDetailsDialog({
  org,
  profile,
  canEdit,
  isSelf,
  onClose,
}: {
  org: Org;
  profile: { id: string; display_name: string; email: string } | null;
  canEdit: boolean;
  isSelf: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const defs = useQuery(attributeDefsQuery(org.id, org.ancestor_ids));
  const values = useQuery({ ...memberValuesQuery(profile?.id ?? ""), enabled: !!profile });
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(values.data ?? {}), [values.data]);

  const memberDefs = (defs.data ?? []).filter((d) => d.applies_to === "member" && d.active);
  const editable = (d: (typeof memberDefs)[number]) => canEdit || (isSelf && d.member_editable);

  async function save() {
    if (!profile) return;
    const err = firstValueError(memberDefs.filter(editable), draft);
    if (err) return void toast.error(err);
    setBusy(true);
    try {
      await saveAttributeValues(memberDefs.filter(editable), profile.id, draft, values.data);
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["attribute-values", profile.id] });
      onClose();
    } catch {
      toast.error("Couldn't save these details");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!profile} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{profile?.display_name || profile?.email}</DialogTitle>
        </DialogHeader>
        {memberDefs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This organization doesn't track any member fields yet.
          </p>
        ) : (
          <div className="space-y-4">
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
            <Button onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save details"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
