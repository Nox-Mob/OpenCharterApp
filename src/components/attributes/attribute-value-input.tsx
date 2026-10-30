import type { DefWithOptions } from "@/modules/attributes/queries";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function AttributeValueInput({
  def,
  value,
  onChange,
  disabled = false,
}: {
  def: DefWithOptions;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}) {
  const active = def.options.filter((o) => o.active);
  switch (def.data_type) {
    case "boolean":
      return <Switch aria-label={def.label} checked={value === true} disabled={disabled} onCheckedChange={(c) => onChange(c)} />;
    case "number":
      return (
        <Input aria-label={def.label} type="number" disabled={disabled} value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />
      );
    case "date":
      return <Input aria-label={def.label} type="date" disabled={disabled} value={String(value ?? "")} onChange={(e) => onChange(e.target.value || null)} />;
    case "choice":
    case "ordered":
      return (
        <Select value={typeof value === "string" ? value : ""} disabled={disabled} onValueChange={(v) => onChange(v)}>
          <SelectTrigger aria-label={def.label}><SelectValue placeholder="Choose…" /></SelectTrigger>
          <SelectContent>
            {active.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    case "multi_choice": {
      const sel = new Set(Array.isArray(value) ? (value as string[]) : []);
      return (
        <div className="flex flex-wrap gap-3">
          {active.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={sel.has(o.value)}
                disabled={disabled}
                onCheckedChange={(c) => {
                  const next = new Set(sel);
                  if (c) next.add(o.value);
                  else next.delete(o.value);
                  onChange(active.map((x) => x.value).filter((v) => next.has(v)));
                }}
              />
              {o.label}
            </label>
          ))}
        </div>
      );
    }
    default:
      return <Input aria-label={def.label} disabled={disabled} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
  }
}
