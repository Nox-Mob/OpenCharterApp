import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createOrgSchema, slugify, type OrgType } from "@/lib/policy";
import { myOrgsQuery } from "@/lib/orgs";
import { attributeDefsQuery } from "@/modules/attributes/queries";
import { firstValueError, saveAttributeValues } from "@/modules/attributes/values";
import { AttributeValueInput } from "@/components/attributes/attribute-value-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CreateOrgDialog({
  parentId = null,
  trigger,
  onCreated,
}: {
  parentId?: string | null;
  trigger: React.ReactNode;
  onCreated?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const types: OrgType[] = parentId ? ["chapter", "region"] : ["standalone", "national"];
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [type, setType] = useState<OrgType>(types[0]!);
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState<Record<string, unknown>>({});
  // Chapter fields defined by the parent or its ancestors are asked for at creation (D-061).
  const orgs = useQuery({ ...myOrgsQuery(), enabled: !!parentId });
  const parent = orgs.data?.find((o) => o.id === parentId);
  const defs = useQuery({
    ...attributeDefsQuery(parentId ?? "", parent?.ancestor_ids ?? []),
    enabled: !!parent,
  });
  const chapterFields =
    type === "chapter"
      ? (defs.data ?? []).filter((d) => d.applies_to === "chapter" && d.active)
      : [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = createOrgSchema.safeParse({ name, slug: slug || slugify(name), type, parentId });
    if (!parsed.success)
      return void toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
    const detailsError = firstValueError(chapterFields, details);
    if (detailsError) return void toast.error(detailsError);
    setBusy(true);
    const { data, error } = await supabase.rpc("create_organization", {
      _name: parsed.data.name,
      _slug: parsed.data.slug,
      _type: parsed.data.type,
      ...(parsed.data.parentId ? { _parent: parsed.data.parentId } : {}),
    });
    if (error) {
      setBusy(false);
      return void toast.error(
        error.message.includes("duplicate") ? "That web address is taken" : error.message,
      );
    }
    try {
      await saveAttributeValues(chapterFields, data as string, details);
      toast.success(`${parsed.data.name} created`);
    } catch {
      toast.warning(
        `${parsed.data.name} was created, but some chapter details weren't saved. Add them on the chapter's overview.`,
      );
    }
    setBusy(false);
    await qc.invalidateQueries();
    setOpen(false);
    setName("");
    setSlug("");
    setDetails({});
    onCreated?.(data as string);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {parentId ? "Add a chapter or region" : "Create an organization"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">Name</Label>
            <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-slug">Web address</Label>
            <Input
              id="org-slug"
              value={slug}
              placeholder={slugify(name) || "my-association"}
              onChange={(e) => setSlug(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as OrgType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {chapterFields.length > 0 && (
            <fieldset className="space-y-3 rounded-md border p-3">
              <legend className="px-1 text-sm font-medium">Chapter details</legend>
              {chapterFields.map((d) => (
                <div key={d.id} className="space-y-1">
                  <Label>
                    {d.label}
                    {d.required ? " *" : ""}
                  </Label>
                  <AttributeValueInput
                    def={d}
                    value={details[d.id]}
                    onChange={(v) => setDetails({ ...details, [d.id]: v })}
                  />
                </div>
              ))}
            </fieldset>
          )}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Creating…" : "Create"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
