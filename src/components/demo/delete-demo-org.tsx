import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { isDemoOrg, type Org } from "@/lib/orgs";
import { useFeatureReady } from "@/lib/db/readiness";
import { deleteDemoOrganization, demoErrorMessage, demoTree } from "@/modules/demo";
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

/** "Delete this demo organization" (D-148): only for a demo org's top, behind typing its name. */
export function DeleteDemoOrg({ org, orgs }: { org: Org; orgs: readonly Org[] }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const ready = useFeatureReady("demo_orgs") === true;
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  if (!ready || !isDemoOrg(org) || org.parent_id) return null;
  const tree = demoTree(org, orgs);
  const chapters = tree.length - 1;

  async function remove() {
    setBusy(true);
    try {
      await deleteDemoOrganization(org, confirm.trim(), tree);
      toast.success(`${org.name} was deleted`);
      setOpen(false);
      await navigate({ to: "/dashboard" });
      await qc.invalidateQueries();
    } catch (e) {
      toast.error(demoErrorMessage(String((e as Error).message)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10 space-y-3 rounded-md border border-destructive/40 p-5">
      <h2 className="text-lg font-semibold">Delete this demo organization</h2>
      <p className="text-sm text-muted-foreground">
        {org.name} is a demo organization. Deleting it removes it
        {chapters > 0 ? ` and its ${chapters} chapter${chapters === 1 ? "" : "s"}` : ""} with all
        their members, memberships, payments, receipts, boards, levels, fields and settings.
        People's accounts stay. This can't be undone.
      </p>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Delete demo organization
      </Button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {org.name}?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">
              Everything in {org.name}
              {chapters > 0 ? ` and its ${chapters} chapter${chapters === 1 ? "" : "s"}` : ""} will
              be deleted for good. One entry stays in the audit log.
            </p>
            <div className="space-y-1">
              <Label htmlFor="confirm-name">Type {org.name} to confirm</Label>
              <Input
                id="confirm-name"
                autoComplete="off"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={remove}
              disabled={busy || confirm.trim() !== org.name}
            >
              {busy ? "Deleting…" : "Delete for good"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
