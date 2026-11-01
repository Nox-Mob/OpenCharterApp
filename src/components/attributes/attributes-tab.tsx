import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Org } from "@/lib/orgs";
import {
  attributeInputSchema,
  forSubject,
  hasOptions,
  TYPE_LABELS,
  visibilityLabels,
  type AttributeInput,
  type AttributeSubject,
} from "@/engines/attributes";
import { attributeDefsQuery, type DefWithOptions } from "@/modules/attributes/queries";
import { EMPTY_ATTRIBUTE } from "./attribute-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AttributeFieldDialog } from "./attribute-field-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export async function saveAttribute(
  orgId: string,
  input: AttributeInput,
  existing: DefWithOptions | null,
  subject: AttributeSubject = "member",
) {
  const parsed = forSubject(attributeInputSchema.parse(input), subject);
  let defId = existing?.id;
  if (!existing) {
    const { data, error } = await supabase
      .from("attribute_definitions")
      .insert({
        org_id: orgId,
        applies_to: subject,
        key: parsed.key,
        label: parsed.label,
        data_type: parsed.data_type,
        required: parsed.required,
        visibility: parsed.visibility,
        member_editable: parsed.member_editable,
        show_in_directory: parsed.show_in_directory,
        locked: parsed.locked ?? false,
      })
      .select("id")
      .single();
    if (error) throw error;
    defId = data.id;
  } else {
    const { error } = await supabase
      .from("attribute_definitions")
      .update({
        label: parsed.label,
        required: parsed.required,
        visibility: parsed.visibility,
        member_editable: parsed.member_editable,
        show_in_directory: parsed.show_in_directory,
        locked: parsed.locked ?? false,
      })
      .eq("id", existing.id);
    if (error) throw error;
  }
  if (!hasOptions(parsed.data_type)) return;
  const prior = new Map((existing?.options ?? []).map((o) => [o.value, o]));
  for (const [i, o] of parsed.options.entries()) {
    const p = prior.get(o.value);
    if (p?.id) {
      const { error } = await supabase
        .from("attribute_options")
        .update({ label: o.label, sort_order: (i + 1) * 10, active: true })
        .eq("id", p.id);
      if (error) throw error;
      prior.delete(o.value);
    } else {
      const { error } = await supabase.from("attribute_options").insert({
        definition_id: defId!,
        org_id: orgId,
        value: o.value,
        label: o.label,
        sort_order: (i + 1) * 10,
      });
      if (error) throw error;
    }
  }
  // Removed choices are retired, never deleted, so existing member values keep their meaning.
  for (const p of prior.values()) {
    if (p.id && p.active)
      await supabase.from("attribute_options").update({ active: false }).eq("id", p.id);
  }
}

const COPY: Record<AttributeSubject, { intro: string; empty: string; add: string }> = {
  member: {
    intro:
      "What your organization tracks about each member. Fields from a parent organization apply here too.",
    empty: "No member fields yet.",
    add: "Add a member field",
  },
  chapter: {
    intro:
      "What you track about each chapter, such as its charter date. Chapter admins fill these in on their chapter's overview.",
    empty: "No chapter fields yet.",
    add: "Add a chapter field",
  },
};

export function AttributesTab({
  org,
  canManage,
  subject = "member",
}: {
  org: Org;
  canManage: boolean;
  subject?: AttributeSubject;
}) {
  const copy = COPY[subject];
  const labels = visibilityLabels(subject);
  const qc = useQueryClient();
  const { data: defs = [], isLoading } = useQuery(attributeDefsQuery(org.id, org.ancestor_ids));
  const [editing, setEditing] = useState<{
    def: DefWithOptions | null;
    input: AttributeInput;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  function edit(def: DefWithOptions | null) {
    setEditing({
      def,
      input: def
        ? {
            ...def,
            options: def.options
              .filter((o) => o.active)
              .map((o) => ({ value: o.value, label: o.label })),
          }
        : EMPTY_ATTRIBUTE,
    });
  }

  async function save() {
    if (!editing) return;
    const parsed = attributeInputSchema.safeParse(editing.input);
    if (!parsed.success)
      return void toast.error(parsed.error.issues[0]?.message ?? "Check the form");
    setBusy(true);
    try {
      await saveAttribute(org.id, parsed.data, editing.def, subject);
      toast.success("Field saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["attribute-defs"] });
    } catch (e) {
      toast.error(
        String((e as Error).message).includes("duplicate")
          ? "A field with that name already exists"
          : "Couldn't save the field",
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(def: DefWithOptions) {
    const { error } = await supabase
      .from("attribute_definitions")
      .update({ active: !def.active })
      .eq("id", def.id);
    if (error) return void toast.error("Couldn't update");
    qc.invalidateQueries({ queryKey: ["attribute-defs"] });
  }

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  const memberDefs = defs.filter((d) => d.applies_to === subject);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">{copy.intro}</p>
        {canManage && <Button onClick={() => edit(null)}>Add field</Button>}
      </div>
      {memberDefs.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-muted-foreground">
          {copy.empty}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Field</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Visible to</TableHead>
              <TableHead>Source</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {memberDefs.map((d) => {
              const own = d.org_id === org.id;
              return (
                <TableRow key={d.id} className={d.active ? "" : "opacity-60"}>
                  <TableCell className="font-medium">
                    {d.label}{" "}
                    {d.required && (
                      <Badge variant="outline" className="ml-1">
                        Required
                      </Badge>
                    )}
                    {d.locked && (
                      <Badge variant="outline" className="ml-1">
                        Locked
                      </Badge>
                    )}
                    {!d.active && (
                      <Badge variant="secondary" className="ml-1">
                        Retired
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {TYPE_LABELS[d.data_type]}
                    {hasOptions(d.data_type)
                      ? ` · ${d.options.filter((o) => o.active).length} choices`
                      : ""}
                  </TableCell>
                  <TableCell>{labels[d.visibility]}</TableCell>
                  <TableCell>
                    {own ? "This organization" : <Badge variant="secondary">Inherited</Badge>}
                  </TableCell>
                  <TableCell className="space-x-1 text-right">
                    {own && canManage && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => edit(d)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => toggleActive(d)}>
                          {d.active ? "Retire" : "Restore"}
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <AttributeFieldDialog
        open={!!editing}
        title={editing?.def ? `Edit ${editing.def.label}` : copy.add}
        value={editing?.input ?? null}
        locked={!!editing?.def}
        onChange={(input) => editing && setEditing({ ...editing, input })}
        onClose={() => setEditing(null)}
        primaryLabel={busy ? "Saving…" : "Save field"}
        onPrimary={save}
        busy={busy}
        subject={subject}
      />
    </div>
  );
}
