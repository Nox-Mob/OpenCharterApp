import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import type { Org } from "@/lib/orgs";
import { hasPermission, type Grant } from "@/lib/policy";
import { attributeDefsQuery, memberValuesQuery } from "@/modules/attributes/queries";
import { canSetChapterField } from "@/modules/attributes/chapter-fields";
import { firstValueError, saveAttributeValues } from "@/modules/attributes/values";
import { AttributeValueInput } from "./attribute-value-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/** A chapter's values for the chapter fields its national or region defined (E-09, D-061, D-121). */
export function ChapterFieldsCard({
  org,
  orgs,
  grants,
}: {
  org: Org;
  orgs: readonly Org[];
  grants: readonly Grant[];
}) {
  const qc = useQueryClient();
  const defs = useQuery(attributeDefsQuery(org.id, org.ancestor_ids));
  const values = useQuery(memberValuesQuery(org.id));
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(values.data ?? {}), [values.data]);

  const all = (defs.data ?? []).filter(
    (d) => d.applies_to === "chapter" && d.active && org.ancestor_ids.includes(d.org_id),
  );
  const editable = all.filter((d) => canSetChapterField(d, org, grants));
  const canEditAny = editable.length > 0;
  // Admin-only values are hidden from members by RLS, so don't show an empty box.
  const canManageChapter = hasPermission(grants, "org.manage", org);
  const fields = all.filter((d) => canManageChapter || d.visibility !== "admins");
  if (defs.isLoading || values.isLoading || fields.length === 0) return null;
  const missing = editable.filter((d) => d.required && (values.data?.[d.id] ?? null) === null);
  const ownerName = (id: string) => orgs.find((o) => o.id === id)?.name ?? "your national";

  async function save() {
    const err = firstValueError(editable, draft);
    if (err) return void toast.error(err);
    setBusy(true);
    try {
      await saveAttributeValues(editable, org.id, draft, values.data);
      toast.success("Chapter details saved");
      qc.invalidateQueries({ queryKey: ["attribute-values", org.id] });
    } catch (e) {
      toast.error(
        String((e as Error).message).includes("locked")
          ? "A locked field can only be set by your national organization"
          : "Couldn't save the chapter details",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-md border bg-card p-5">
      <h2 className="text-lg font-semibold">Chapter details</h2>
      {missing.length > 0 && (
        <p className="mt-1 text-sm text-destructive">
          Still needed: {missing.map((d) => d.label).join(", ")}
        </p>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {fields.map((d) => {
          const canSet = editable.includes(d);
          return (
            <div key={d.id} className="space-y-1">
              <Label className="flex items-center gap-1">
                {d.label}
                {d.required ? " *" : ""}
                {d.locked && <Lock className="h-3 w-3" aria-label="Locked" />}
              </Label>
              <AttributeValueInput
                def={d}
                value={draft[d.id]}
                disabled={!canSet}
                onChange={(v) => setDraft({ ...draft, [d.id]: v })}
              />
              {d.locked && !canSet && (
                <p className="text-xs text-muted-foreground">Set by {ownerName(d.org_id)}</p>
              )}
            </div>
          );
        })}
      </div>
      {canEditAny && (
        <Button className="mt-4" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save chapter details"}
        </Button>
      )}
    </section>
  );
}
