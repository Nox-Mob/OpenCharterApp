import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Org } from "@/lib/orgs";
import {
  myDirectoryChoiceQuery,
  privacyRulesQuery,
  setMyDirectoryListing,
} from "@/modules/members/privacy";
import { Switch } from "@/components/ui/switch";

/** A member's own choice to appear in the member directory (E-14, D-139). */
export function DirectoryPreference({ org }: { org: Org }) {
  const qc = useQueryClient();
  const choice = useQuery(myDirectoryChoiceQuery(org.id));
  const rules = useQuery(privacyRulesQuery(org.id, org.ancestor_ids));
  if (choice.isLoading || rules.isLoading || choice.data === undefined) return null;
  const listedByDefault = rules.data?.listedByDefault ?? true;
  const listed = choice.data ?? listedByDefault;

  async function change(next: boolean) {
    try {
      // Matching the org's default stores "no choice", so a later default change applies.
      await setMyDirectoryListing(org.id, next === listedByDefault ? null : next);
      toast.success(next ? "You're listed in the directory" : "You're no longer listed");
      qc.invalidateQueries({ queryKey: ["my-directory-choice", org.id] });
      qc.invalidateQueries({ queryKey: ["member-directory", org.id] });
    } catch {
      toast.error("Couldn't save your choice");
    }
  }

  return (
    <label className="flex max-w-xl items-center justify-between gap-4 rounded-md border bg-card p-4 text-sm">
      <span>
        <span className="font-medium">Show me in the member directory</span>
        <span className="block text-muted-foreground">
          Other members see your name and the fields {org.name} shows in its directory, never your
          email. {choice.data === null ? "(Following the organization's default.)" : ""}
        </span>
      </span>
      <Switch
        aria-label="Show me in the member directory"
        checked={listed}
        onCheckedChange={(c) => void change(c)}
      />
    </label>
  );
}
