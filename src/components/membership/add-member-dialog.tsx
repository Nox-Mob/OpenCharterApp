import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createMemberRecord,
  memberRecordSchema,
  membershipErrorMessage,
} from "@/modules/membership/memberships";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Add a member record by hand, e.g. a historical member (D-116). Email is optional. */
export function AddMemberDialog({
  orgId,
  open,
  onClose,
  onCreated,
}: {
  orgId: string;
  open: boolean;
  onClose: () => void;
  onCreated: (profileId: string) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    const parsed = memberRecordSchema.safeParse({ display_name: name, email });
    if (!parsed.success)
      return void toast.error(parsed.error.issues[0]?.message ?? "Check the form");
    setBusy(true);
    try {
      const id = await createMemberRecord(orgId, parsed.data);
      toast.success("Member added");
      qc.invalidateQueries({ queryKey: ["members", orgId] });
      setName("");
      setEmail("");
      onCreated(id);
    } catch (e) {
      toast.error(membershipErrorMessage(String((e as Error).message)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a member</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="member-name">Name</Label>
            <Input id="member-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="member-email">Email (optional)</Label>
            <Input
              id="member-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              {email.trim()
                ? "They can't sign in yet. Send them an invitation from their details to give them a login."
                : "Without an email this person can't sign in. You can add one later."}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={busy}>
            {busy ? "Adding…" : "Add member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
