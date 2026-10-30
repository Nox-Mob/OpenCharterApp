import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Org } from "@/lib/orgs";
import { resolveSetting, SETTINGS, type SettingMode, type SettingRow } from "@/engines/settings";
import { logoUrl, resolveLogo, uploadLogo, validateLogo } from "@/modules/branding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function useLineage(org: Org) {
  return useQuery({
    queryKey: ["lineage", org.id],
    queryFn: async () => {
      const [{ data: anc, error: e1 }, { data: settings, error: e2 }] = await Promise.all([
        supabase.rpc("org_lineage", { _org: org.id }),
        supabase.rpc("lineage_settings", { _org: org.id }),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const ancestors = [...(anc ?? [])].sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0));
      const chain = [...ancestors.map((a) => ({ id: a.id, name: a.name, logo_path: a.logo_path })), { id: org.id, name: org.name, logo_path: (org as Org & { logo_path?: string | null }).logo_path ?? null }];
      return { chain, settings: (settings ?? []) as SettingRow[] };
    },
  });
}

export function SettingsTab({ org }: { org: Org & { timezone?: string; logo_path?: string | null } }) {
  const qc = useQueryClient();
  const lineage = useLineage(org);
  const refresh = () => qc.invalidateQueries();
  if (!lineage.data) return <p className="text-muted-foreground">Loading…</p>;
  const { chain, settings } = lineage.data;
  const ids = chain.map((c) => c.id);
  const nameOf = (id: string | null) => chain.find((c) => c.id === id)?.name ?? "default";

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <GeneralCard org={org} onSaved={refresh} />
      <LogoCard org={org} chain={chain} allowed={resolveSetting(ids, settings, "branding.chapter_logo_allowed", true).value !== false} onSaved={refresh} />
      <TaxCard orgId={org.id} />
      <section className="rounded-md border bg-card p-5">
        <h2 className="text-lg font-semibold">Rules for this organization</h2>
        <div className="mt-4 space-y-6">
          {SETTINGS.map((def) => (
            <SettingRowEditor
              key={def.key}
              orgId={org.id}
              hasChildren={org.type === "national" || org.type === "region"}
              def={def}
              own={settings.find((s) => s.org_id === org.id && s.key === def.key)}
              resolved={resolveSetting(ids, settings, def.key, def.default)}
              nameOf={nameOf}
              onSaved={refresh}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function GeneralCard({ org, onSaved }: { org: Org & { timezone?: string }; onSaved: () => void }) {
  const [name, setName] = useState(org.name);
  const [tz, setTz] = useState(org.timezone ?? "America/Chicago");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return void toast.error("Name is too short");
    const { error } = await supabase.from("organizations").update({ name: name.trim(), timezone: tz }).eq("id", org.id);
    if (error) return void toast.error("Couldn't save");
    toast.success("Saved");
    onSaved();
  }
  return (
    <form onSubmit={save} className="space-y-4 rounded-md border bg-card p-5">
      <h2 className="text-lg font-semibold">General</h2>
      <div className="space-y-2"><Label htmlFor="g-name">Name</Label><Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="g-tz">Time zone</Label><Input id="g-tz" value={tz} onChange={(e) => setTz(e.target.value)} /></div>
      <Button type="submit">Save</Button>
    </form>
  );
}

function LogoCard({ org, chain, allowed, onSaved }: { org: Org; chain: { id: string; name: string; logo_path: string | null }[]; allowed: boolean; onSaved: () => void }) {
  const effective = resolveLogo(chain, allowed);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    if (effective) logoUrl(effective.path).then((u) => live && setUrl(u));
    else setUrl(null);
    return () => { live = false; };
  }, [effective?.path]);
  const isChild = chain.length > 1;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateLogo(file);
    if (err) return void toast.error(err);
    setBusy(true);
    try { await uploadLogo(org.id, file); toast.success("Logo updated"); onSaved(); }
    catch { toast.error("Upload failed"); }
    finally { setBusy(false); e.target.value = ""; }
  }

  return (
    <section className="space-y-4 rounded-md border bg-card p-5">
      <h2 className="text-lg font-semibold">Logo</h2>
      <div className="flex h-28 items-center justify-center rounded-md bg-muted">
        {url ? <img src={url} alt={`${org.name} logo`} className="max-h-24 max-w-full object-contain" /> : <span className="text-sm text-muted-foreground">No logo yet</span>}
      </div>
      {effective && effective.orgId !== org.id && (
        <p className="text-sm text-muted-foreground">Showing the logo from {chain.find((c) => c.id === effective.orgId)?.name}.</p>
      )}
      {isChild && !allowed ? (
        <p className="text-sm text-muted-foreground">Your parent organization requires its logo on all chapters.</p>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="logo">Upload a logo (PNG, JPG, SVG or WebP, up to 2 MB)</Label>
          <Input id="logo" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" disabled={busy} onChange={onFile} />
        </div>
      )}
    </section>
  );
}

type Tax = { legal_name: string; ein: string; tax_status: string; address_line1: string; address_line2: string; city: string; region: string; postal_code: string; country: string };
const EMPTY_TAX: Tax = { legal_name: "", ein: "", tax_status: "", address_line1: "", address_line2: "", city: "", region: "", postal_code: "", country: "US" };
const TAX_FIELDS: [keyof Tax, string][] = [
  ["legal_name", "Legal name"], ["ein", "EIN (12-3456789)"], ["tax_status", "Tax status (e.g. 501(c)(3))"],
  ["address_line1", "Address"], ["address_line2", "Address line 2"], ["city", "City"], ["region", "State"], ["postal_code", "ZIP"], ["country", "Country"],
];

function TaxCard({ orgId }: { orgId: string }) {
  const q = useQuery({
    queryKey: ["tax", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from("tax_profiles").select("*").eq("org_id", orgId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [form, setForm] = useState<Tax>(EMPTY_TAX);
  useEffect(() => { if (q.data) setForm({ ...EMPTY_TAX, ...q.data }); }, [q.data]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (form.ein && !/^\d{2}-\d{7}$/.test(form.ein)) return void toast.error("EIN must look like 12-3456789");
    const { error } = await supabase.from("tax_profiles").upsert({ org_id: orgId, ...form, updated_at: new Date().toISOString() });
    if (error) return void toast.error("Couldn't save tax profile");
    toast.success("Tax profile saved");
    q.refetch();
  }
  return (
    <form onSubmit={save} className="space-y-3 rounded-md border bg-card p-5">
      <h2 className="text-lg font-semibold">Tax profile</h2>
      <p className="text-sm text-muted-foreground">Printed on this organization's receipts. Each organization keeps its own.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {TAX_FIELDS.map(([k, label]) => (
          <div key={k} className="space-y-1">
            <Label htmlFor={`tax-${k}`}>{label}</Label>
            <Input id={`tax-${k}`} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
          </div>
        ))}
      </div>
      <Button type="submit">Save tax profile</Button>
    </form>
  );
}

function SettingRowEditor({ orgId, hasChildren, def, own, resolved, nameOf, onSaved }: {
  orgId: string; hasChildren: boolean; def: (typeof SETTINGS)[number]; own: SettingRow | undefined;
  resolved: ReturnType<typeof resolveSetting>; nameOf: (id: string | null) => string; onSaved: () => void;
}) {
  const locked = resolved.lockedBy !== null;
  const [value, setValue] = useState<unknown>(own?.value ?? resolved.value);
  const [mode, setMode] = useState<SettingMode>(own?.mode ?? "override");

  async function save() {
    const { error } = await supabase.from("org_settings").upsert({ org_id: orgId, key: def.key, value: value as never, mode });
    if (error) return void toast.error(error.message.includes("locked") ? "Locked by a parent organization" : "Couldn't save");
    toast.success("Saved");
    onSaved();
  }

  return (
    <div className="space-y-2 border-b pb-5 last:border-0">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium">{def.label}</p>
          <p className="text-sm text-muted-foreground">{def.description}</p>
        </div>
        {def.kind === "boolean" ? (
          <Switch aria-label={def.label} checked={value !== false} disabled={locked} onCheckedChange={(c) => setValue(c)} />
        ) : null}
      </div>
      {def.kind === "text" && (
        <Input aria-label={def.label} value={String(value ?? "")} disabled={locked} onChange={(e) => setValue(e.target.value)} />
      )}
      {def.kind === "number" && (
        <Input
          aria-label={def.label}
          type="number"
          min={0}
          className="w-32"
          value={value === null || value === undefined ? "" : String(value)}
          disabled={locked}
          onChange={(e) => setValue(e.target.value === "" ? null : Number(e.target.value))}
        />
      )}
      <p className="text-xs text-muted-foreground">
        {locked ? `Locked by ${nameOf(resolved.lockedBy)}.` : `Currently from ${resolved.sourceOrgId === orgId ? "this organization" : nameOf(resolved.sourceOrgId)}.`}
      </p>
      {!locked && (
        <div className="flex items-center gap-2">
          {hasChildren && (
            <Select value={mode} onValueChange={(v) => setMode(v as SettingMode)}>
              <SelectTrigger className="w-56" aria-label="Chapter rule"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="override">Chapters may change it</SelectItem>
                <SelectItem value="locked">Lock for all chapters</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button size="sm" variant="secondary" onClick={save}>Save</Button>
        </div>
      )}
    </div>
  );
}
