import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useFeatureReady } from "@/lib/db/readiness";
import {
  removedMembersQuery,
  restoreToRoster,
  rosterErrorMessage,
} from "@/modules/members/roster-removal";
import { Button } from "@/components/ui/button";

/** Records taken off the roster (U2, D-190), with Restore. Shown to member managers. */
export function RemovedMembers({ orgId }: { orgId: string }) {
  const ready = useFeatureReady("roster_removal") === true;
  const qc = useQueryClient();
  const removed = useQuery({ ...removedMembersQuery(orgId), enabled: ready });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const list = removed.data ?? [];
  if (!ready || list.length === 0) return null;

  async function restore(id: string, name: string) {
    setBusy(id);
    try {
      await restoreToRoster(id);
      toast.success(`${name} is back on the roster`);
      for (const k of ["members", "members-tree", "removed-members", "overview-stats"])
        qc.invalidateQueries({ queryKey: [k] });
    } catch (e) {
      toast.error(rosterErrorMessage(String((e as Error).message)));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-2">
      <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "Hide" : "Show"} {list.length} removed from the roster
      </Button>
      {open && (
        <ul className="divide-y rounded-md border bg-card">
          {list.map((m) => {
            const name = m.display_name || m.email || "Unnamed record";
            return (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span>
                  <span className="font-medium">{name}</span>{" "}
                  <span className="text-muted-foreground">
                    removed {new Date(m.left_at).toLocaleDateString()}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === m.id}
                  onClick={() => void restore(m.id, name)}
                >
                  Restore
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
