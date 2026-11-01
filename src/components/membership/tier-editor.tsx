import { useState } from "react";
import { X } from "lucide-react";
import {
  newTerm,
  parsePrice,
  priceInput,
  TAX_TREATMENT_LABELS,
  TAX_TREATMENTS,
  TERM_LENGTH_CHOICES,
  tierKey,
  withLength,
  type TaxTreatment,
  type Term,
  type TermLengthChoice,
  type Tier,
} from "@/modules/membership/tiers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Controlled editor for one membership level and its terms (E-11). The key is fixed once saved. */
export function TierEditor({
  value,
  onChange,
  keyLocked = false,
}: {
  value: Tier;
  onChange: (v: Tier) => void;
  keyLocked?: boolean;
}) {
  const set = (patch: Partial<Tier>) => onChange({ ...value, ...patch });
  const setTerm = (i: number, t: Term) =>
    set({ terms: value.terms.map((x, j) => (j === i ? t : x)) });
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="tier-name">Level name</Label>
        <Input
          id="tier-name"
          value={value.name}
          placeholder="e.g. Regular"
          onChange={(e) =>
            set(
              keyLocked
                ? { name: e.target.value }
                : { name: e.target.value, key: tierKey(e.target.value) },
            )
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tier-description">Description</Label>
        <Textarea
          id="tier-description"
          rows={2}
          value={value.description}
          onChange={(e) => set({ description: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label>Tax treatment</Label>
        <Select
          value={value.tax_treatment}
          onValueChange={(v) => set({ tax_treatment: v as TaxTreatment })}
        >
          <SelectTrigger aria-label="Tax treatment">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TAX_TREATMENTS.map((t) => (
              <SelectItem key={t} value={t}>
                {TAX_TREATMENT_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Terms and prices</legend>
        <p className="text-sm text-muted-foreground">
          How long each membership lasts and what it costs. Add as many as you offer.
        </p>
        <ul className="space-y-2">
          {value.terms.map((t, i) => (
            <TermRow
              key={t.id ?? `${i}-${t.key}`}
              index={i}
              term={t}
              onChange={(next) => setTerm(i, next)}
              onRemove={
                value.terms.length > 1
                  ? () => set({ terms: value.terms.filter((_, j) => j !== i) })
                  : undefined
              }
            />
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => set({ terms: [...value.terms, newTerm()] })}
        >
          Add term
        </Button>
      </fieldset>
    </div>
  );
}

function TermRow({
  index,
  term,
  onChange,
  onRemove,
}: {
  index: number;
  term: Term;
  onChange: (t: Term) => void;
  onRemove?: (() => void) | undefined;
}) {
  const [price, setPrice] = useState(
    Number.isFinite(term.price_minor) ? priceInput(term.price_minor) : "",
  );
  const lifetime = term.length_unit === null;
  const n = index + 1;
  const choice: TermLengthChoice = term.length_unit ?? "lifetime";
  return (
    <li className="flex flex-wrap items-end gap-2 rounded-md border p-2">
      {!lifetime && (
        <div className="w-20 space-y-1">
          <Label htmlFor={`term-${n}-count`} className="text-xs">
            Length
          </Label>
          <Input
            id={`term-${n}-count`}
            type="number"
            min={1}
            max={1000}
            aria-label={`Term ${n} length`}
            value={term.length_count ?? ""}
            onChange={(e) => {
              const count = Math.max(1, Math.min(1000, Math.trunc(Number(e.target.value) || 1)));
              onChange(withLength(term, { count, unit: term.length_unit! }));
            }}
          />
        </div>
      )}
      <div className="w-32 space-y-1">
        <Label className="text-xs">{lifetime ? "Length" : "Unit"}</Label>
        <Select
          value={choice}
          onValueChange={(v) =>
            onChange(
              withLength(
                term,
                v === "lifetime"
                  ? null
                  : {
                      count: term.length_count ?? 1,
                      unit: v as Exclude<TermLengthChoice, "lifetime">,
                    },
              ),
            )
          }
        >
          <SelectTrigger aria-label={`Term ${n} unit`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TERM_LENGTH_CHOICES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="w-32 space-y-1">
        <Label htmlFor={`term-${n}-price`} className="text-xs">
          Price ($)
        </Label>
        <Input
          id={`term-${n}-price`}
          inputMode="decimal"
          aria-label={`Term ${n} price`}
          aria-invalid={parsePrice(price) === null}
          value={price}
          onChange={(e) => {
            setPrice(e.target.value);
            onChange({ ...term, price_minor: parsePrice(e.target.value) ?? Number.NaN });
          }}
        />
      </div>
      {onRemove && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={`Remove term ${n}`}
          onClick={onRemove}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
      {parsePrice(price) === null && (
        <p className="w-full text-xs text-destructive">Enter a price like 25.00</p>
      )}
    </li>
  );
}

/** Add/edit dialog for a level, with a pinned header and button and a scrolling body. */
export function TierDialog({
  open,
  title,
  value,
  keyLocked = false,
  onChange,
  onClose,
  primaryLabel,
  onPrimary,
  busy = false,
}: {
  open: boolean;
  title: string;
  value: Tier | null;
  keyLocked?: boolean;
  onChange: (v: Tier) => void;
  onClose: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  busy?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="border-b px-6 pb-4 pt-6">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div data-testid="tier-scroll" className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {value && <TierEditor value={value} onChange={onChange} keyLocked={keyLocked} />}
        </div>
        <DialogFooter className="border-t px-6 py-4">
          <Button onClick={onPrimary} disabled={busy}>
            {primaryLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
