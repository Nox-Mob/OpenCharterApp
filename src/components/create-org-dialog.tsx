import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createOrgSchema, slugify, type OrgType } from "@/lib/policy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = createOrgSchema.safeParse({ name, slug: slug || slugify(name), type, parentId });
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
    setBusy(true);
    const { data, error } = await supabase.rpc("create_organization", {
      _name: parsed.data.name,
      _slug: parsed.data.slug,
      _type: parsed.data.type,
      ...(parsed.data.parentId ? { _parent: parsed.data.parentId } : {}),
    });
    setBusy(false);
    if (error) return toast.error(error.message.includes("duplicate") ? "That web address is taken" : error.message);
    toast.success(`${parsed.data.name} created`);
    await qc.invalidateQueries();
    setOpen(false);
    setName("");
    setSlug("");
    onCreated?.(data as string);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{parentId ? "Add a chapter or region" : "Create an organization"}</DialogTitle>
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
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Creating…" : "Create"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
