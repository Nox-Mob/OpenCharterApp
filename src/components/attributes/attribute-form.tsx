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
import { HelpTip } from "@/components/help-tip";
import { docsUrl } from "@shared/docs";
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
  sensitive: false,
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
          value={value.sensitive ? "admins" : value.visibility}
          disabled={value.sensitive === true}
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
        <p className="text-xs text-muted-foreground">
          {value.sensitive
            ? "Sensitive fields are for admins only (and each member sees their own)."
            : "Admins always see it. Choose whether members, or anyone, can see it too."}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {(subject === "chapter"
          ? ([
              ["required", "Required for every chapter"],
              ["locked", "Locked: only your admins can set it"],
            ] as const)
          : ([
              ["required", "Required"],
              ["member_editable", "Members can edit their own"],
              ["show_in_directory", "Show in directory"],
            ] as const)
        ).map(([k, l]) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <Switch
              checked={k === "show_in_directory" && value.sensitive ? false : value[k] === true}
              disabled={k === "show_in_directory" && value.sensitive === true}
              onCheckedChange={(c) => set({ [k]: c })}
              aria-label={l}
            />
            {l}
          </label>
        ))}
      </div>
      {subject === "member" && (
        <div className="flex items-start gap-2 rounded-md border p-3 text-sm">
          <Switch
            id="attr-sensitive"
            checked={value.sensitive === true}
            onCheckedChange={(c) =>
              set(
                c
                  ? { sensitive: true, visibility: "admins", show_in_directory: false }
                  : { sensitive: false },
              )
            }
          />
          <div className="grow">
            <label htmlFor="attr-sensitive" className="font-medium">
              Sensitive
            </label>
            <p className="text-muted-foreground">
              Stored encrypted. Only member admins and the member can see it.
            </p>
          </div>
          <HelpTip label="What does Sensitive mean?">
            <p>
              Use <strong>Sensitive</strong> for private details, like a date of birth, a medical
              note or an ID number.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Each answer is <strong>encrypted</strong> (scrambled with AES-256) before it's
                saved, so a copy of the database shows only scrambled text.
              </li>
              <li>Only people who manage members, and the member themself, can see it.</li>
              <li>It's never shown in the member directory.</li>
              <li>It can't be used in pricing rules, and the history log hides it.</li>
            </ul>
            <a
              className="mt-2 inline-block font-medium underline"
              href={docsUrl("charter/members/roster/#sensitive-fields")}
              target="_blank"
              rel="noreferrer"
            >
              Learn more
            </a>
          </HelpTip>
        </div>
      )}
      {subject === "chapter" && value.locked && (
        <p className="text-sm text-muted-foreground">
          Chapter admins will see this value but can't change it. Your admins set it on each
          chapter's Settings → Chapter fields.
        </p>
      )}
    </div>
  );
}
