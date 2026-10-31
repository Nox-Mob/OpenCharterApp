import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Org } from "@/lib/orgs";
import { attributeDefsQuery, memberValuesQuery } from "@/modules/attributes/queries";
import { firstValueError, saveAttributeValues } from "@/modules/attributes/values";
import { AttributeValueInput } from "./attribute-value-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/** A chapter's values for the chapter fields its national or region defined (E-09, D-061). */
export function ChapterFieldsCard({ org, canEdit }: { org: Org; canEdit: boolean }) {
  const qc = useQueryClient();
  const defs = useQuery(attributeDefsQuery(org.id, org.ancestor_ids));
  const values = useQuery(memberValuesQuery(org.id));
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(values.data ?? {}), [values.data]);

  const fields = (defs.data ?? []).filter(
    (d) =>
      d.applies_to === "chapter" &&
      d.active &&
      org.ancestor_ids.includes(d.org_id) &&
      // Admin-only values are hidden from members by RLS, so don't show an empty box.
      (canEdit || d.visibility !== "admins"),
  );
  if (defs.isLoading || values.isLoading || fields.length === 0) return null;
  const missing = fields.filter((d) => d.required && (values.data?.[d.id] ?? null) === null);

  async function save() {
    const err = firstValueError(fields, draft);
    if (err) return void toast.error(err);
    setBusy(true);
    try {
      await saveAttributeValues(fields, org.id, draft, values.data);
      toast.success("Chapter details saved");
      qc.invalidateQueries({ queryKey: ["attribute-values", org.id] });
    } catch {
      toast.error("Couldn't save the chapter details");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-md border bg-card p-5">
      <h2 className="text-lg font-semibold">Chapter details</h2>
      {canEdit && missing.length > 0 && (
        <p className="mt-1 text-sm text-destructive">
          Still needed: {missing.map((d) => d.label).join(", ")}
        </p>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {fields.map((d) => (
          <div key={d.id} className="space-y-1">
            <Label>
              {d.label}
              {d.required ? " *" : ""}
            </Label>
            <AttributeValueInput
              def={d}
              value={draft[d.id]}
              disabled={!canEdit}
              onChange={(v) => setDraft({ ...draft, [d.id]: v })}
            />
          </div>
        ))}
      </div>
      {canEdit && (
        <Button className="mt-4" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save chapter details"}
        </Button>
      )}
    </section>
  );
}
