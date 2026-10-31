import { useEffect, useRef } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import {
  ATTRIBUTE_TYPES,
  hasOptions,
  moveOption,
  toKey,
  TYPE_LABELS,
  VISIBILITIES,
  visibilityLabels,
  type AttributeInput,
  type AttributeSubject,
  type AttributeType,
  type Visibility,
} from "@/engines/attributes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const EMPTY_ATTRIBUTE: AttributeInput = {
  label: "",
  key: "",
  data_type: "text",
  required: false,
  visibility: "admins",
  member_editable: false,
  show_in_directory: false,
  options: [],
};

/** Controlled editor for one attribute definition. Key and type are locked once saved. */
export function AttributeForm({
  value,
  onChange,
  locked = false,
  subject = "member",
}: {
  value: AttributeInput;
  onChange: (v: AttributeInput) => void;
  locked?: boolean;
  subject?: AttributeSubject;
}) {
  const labels = visibilityLabels(subject);
  const set = (patch: Partial<AttributeInput>) => onChange({ ...value, ...patch });
  // After "Add choice", focus the new row and scroll it into view so long lists stay usable.
  const lastChoice = useRef<HTMLInputElement>(null);
  const focusNewChoice = useRef(false);
  useEffect(() => {
    if (!focusNewChoice.current) return;
    focusNewChoice.current = false;
    lastChoice.current?.focus();
    lastChoice.current?.scrollIntoView?.({ block: "nearest" });
  }, [value.options.length]);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="attr-label">Field name</Label>
          <Input
            id="attr-label"
            value={value.label}
            onChange={(e) =>
              set(
                locked
                  ? { label: e.target.value }
                  : { label: e.target.value, key: toKey(e.target.value) },
              )
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Type</Label>
          <Select
            value={value.data_type}
            disabled={locked}
            onValueChange={(t) => set({ data_type: t as AttributeType })}
          >
            <SelectTrigger aria-label="Field type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ATTRIBUTE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {hasOptions(value.data_type) && (
        <div className="space-y-2">
          <Label>{value.data_type === "ordered" ? "Choices, lowest to highest" : "Choices"}</Label>
          <ol className="space-y-2">
            {value.options.map((o, i) => (
              <li key={i} className="flex items-center gap-2">
                <Input
                  ref={i === value.options.length - 1 ? lastChoice : undefined}
                  aria-label={`Choice ${i + 1}`}
                  value={o.label}
                  onChange={(e) => {
                    const options = [...value.options];
                    options[i] = {
                      label: e.target.value,
                      value: o.value && locked ? o.value : e.target.value.trim(),
                    };
                    set({ options });
                  }}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Move up"
                  onClick={() => set({ options: moveOption(value.options, i, -1) })}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Move down"
                  onClick={() => set({ options: moveOption(value.options, i, 1) })}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Remove choice"
                  onClick={() => set({ options: value.options.filter((_, j) => j !== i) })}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ol>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              focusNewChoice.current = true;
              set({ options: [...value.options, { value: "", label: "" }] });
            }}
          >
            Add choice
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <Label>Who can see it</Label>
        <Select
          value={value.visibility}
          onValueChange={(v) => set({ visibility: v as Visibility })}
        >
          <SelectTrigger aria-label="Who can see it">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VISIBILITIES.map((v) => (
              <SelectItem key={v} value={v}>
                {labels[v]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {(subject === "chapter"
          ? ([["required", "Required for every chapter"]] as const)
          : ([
              ["required", "Required"],
              ["member_editable", "Members can edit their own"],
              ["show_in_directory", "Show in directory"],
            ] as const)
        ).map(([k, l]) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <Switch checked={value[k]} onCheckedChange={(c) => set({ [k]: c })} aria-label={l} />
            {l}
          </label>
        ))}
      </div>
    </div>
  );
}
