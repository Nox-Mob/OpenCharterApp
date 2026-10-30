import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Org } from "@/lib/orgs";
import {
  attributeInputSchema,
  hasOptions,
  TYPE_LABELS,
  VISIBILITY_LABELS,
  type AttributeInput,
} from "@/engines/attributes";
import { attributeDefsQuery, type DefWithOptions } from "@/modules/attributes/queries";
import { AttributeForm, EMPTY_ATTRIBUTE } from "./attribute-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
) {
  const parsed = attributeInputSchema.parse(input);
  let defId = existing?.id;
  if (!existing) {
    const { data, error } = await supabase
      .from("attribute_definitions")
      .insert({
        org_id: orgId,
        key: parsed.key,
        label: parsed.label,
        data_type: parsed.data_type,
        required: parsed.required,
        visibility: parsed.visibility,
        member_editable: parsed.member_editable,
        show_in_directory: parsed.show_in_directory,
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
      const { error } = await supabase
        .from("attribute_options")
        .insert({
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

export function AttributesTab({ org, canManage }: { org: Org; canManage: boolean }) {
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
      await saveAttribute(org.id, parsed.data, editing.def);
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
  const memberDefs = defs.filter((d) => d.applies_to === "member");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">
          What your organization tracks about each member. Fields from a parent organization apply
          here too.
        </p>
        {canManage && <Button onClick={() => edit(null)}>Add field</Button>}
      </div>
      {memberDefs.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-muted-foreground">
          No member fields yet.
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
                  <TableCell>{VISIBILITY_LABELS[d.visibility]}</TableCell>
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

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing?.def ? `Edit ${editing.def.label}` : "Add a member field"}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <AttributeForm
              value={editing.input}
              locked={!!editing.def}
              onChange={(input) => setEditing({ ...editing, input })}
            />
          )}
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save field"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
