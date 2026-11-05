import { useState } from "react";
import { toast } from "sonner";
import { formatPrice, termLabel, lengthOf, type Term } from "@/modules/membership/tiers";
import {
  adoptSuggestedLevel,
  LINK_CHOICES,
  linkedPrice,
  linkErrorMessage,
  RULE_LABELS,
  setLinkedLevelPrice,
  type LinkMode,
  type PriceRule,
} from "@/modules/membership/suggested-levels";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Range = { min: number | null; max: number | null };
type Level = { id: string; name: string; terms: Term[] };

/** The price rule fields (same / amount off / percentage off) with a preview of each term. */
function PriceRuleFields({
  level,
  rule,
  value,
  onRule,
  onValue,
  range,
}: {
  level: Level;
  rule: PriceRule;
  value: string;
  onRule: (r: PriceRule) => void;
  onValue: (v: string) => void;
  range: Range;
}) {
  const n = toValue(rule, value);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label>Your price</Label>
          <Select value={rule} onValueChange={(v) => onRule(v as PriceRule)}>
            <SelectTrigger className="w-64" aria-label="Your price">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(RULE_LABELS) as PriceRule[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {RULE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {rule !== "same" && (
          <div className="space-y-1">
            <Label htmlFor="rule-value">
              {rule === "minus_amount" ? "Amount less ($)" : "Percent less"}
            </Label>
            <Input
              id="rule-value"
              type="number"
              min={0}
              max={rule === "minus_percent" ? 100 : undefined}
              step={rule === "minus_amount" ? "0.01" : "1"}
              className="w-32"
              value={value}
              onChange={(e) => onValue(e.target.value)}
            />
          </div>
        )}
      </div>
      <ul className="space-y-1 text-sm" aria-label="Your prices">
        {level.terms
          .filter((t) => t.active !== false)
          .map((t) => (
            <li key={t.id ?? t.key}>
              {termLabel(lengthOf(t))}: {formatPrice(t.price_minor, t.currency)} →{" "}
              <span className="font-medium">
                {formatPrice(linkedPrice(t.price_minor, rule, n, range), t.currency)}
              </span>
            </li>
          ))}
      </ul>
      {(range.min || range.max) && (
        <p className="text-xs text-muted-foreground">
          Prices stay within your national&apos;s range for chapter dues.
        </p>
      )}
    </div>
  );
}

/** Minor units for an amount, or a whole percentage. */
function toValue(rule: PriceRule, value: string): number {
  const v = Number(value);
  if (!Number.isFinite(v) || v < 0) return 0;
  return rule === "minus_amount" ? Math.round(v * 100) : Math.round(v);
}

/** "Start from a suggested level" (A4, D-165): Copy or Linked, explained side by side. */
export function AdoptLevelDialog({
  orgId,
  level,
  sourceName,
  range,
  onClose,
  onDone,
}: {
  orgId: string;
  level: Level;
  sourceName: string;
  range: Range;
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<LinkMode | null>(null);
  const [rule, setRule] = useState<PriceRule>("same");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!mode) return void toast.error("Choose Copy or Link");
    if (mode === "linked" && rule === "minus_percent" && toValue(rule, value) > 100)
      return void toast.error("A percentage up to 100");
    setBusy(true);
    try {
      await adoptSuggestedLevel(
        orgId,
        level.id,
        mode,
        rule,
        mode === "linked" ? toValue(rule, value) : 0,
      );
      toast.success(mode === "copy" ? "Level copied" : "Level linked");
      onDone();
    } catch (e) {
      toast.error(linkErrorMessage(String((e as Error).message)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Start from {sourceName}&apos;s “{level.name}”
          </DialogTitle>
        </DialogHeader>
        <RadioGroup
          value={mode ?? ""}
          onValueChange={(v) => setMode(v as LinkMode)}
          className="grid gap-3 md:grid-cols-2"
          aria-label="Copy or link"
        >
          {LINK_CHOICES.map((c) => (
            <label
              key={c.value}
              className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm ${mode === c.value ? "border-primary bg-primary/5" : ""}`}
            >
              <RadioGroupItem value={c.value} aria-label={c.label} className="mt-0.5" />
              <span>
                <span className="font-medium">{c.label}</span>
                <span className="block text-muted-foreground">{c.explanation}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
        {mode === "linked" && (
          <PriceRuleFields
            level={level}
            rule={rule}
            value={value}
            onRule={setRule}
            onValue={setValue}
            range={range}
          />
        )}
        {mode === "copy" && (
          <p className="text-sm text-muted-foreground">
            You get {level.name} with the same terms and prices
            {range.min || range.max ? " (kept within your national's range)" : ""}; change them
            afterwards with Edit.
          </p>
        )}
        <DialogFooter>
          <Button onClick={save} disabled={busy || !mode}>
            {busy ? "Saving…" : mode === "linked" ? "Link this level" : "Copy this level"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Change a linked level's price rule. */
export function LinkedPriceDialog({
  tierId,
  level,
  current,
  range,
  onClose,
  onDone,
}: {
  /** the chapter's linked level */
  tierId: string;
  /** the national's level it follows (its prices are the base) */
  level: Level;
  current: { rule: PriceRule; value: number };
  range: Range;
  onClose: () => void;
  onDone: () => void;
}) {
  const [rule, setRule] = useState<PriceRule>(current.rule);
  const [value, setValue] = useState(
    current.rule === "minus_amount"
      ? (current.value / 100).toFixed(2)
      : String(current.value || ""),
  );
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await setLinkedLevelPrice(tierId, rule, toValue(rule, value));
      toast.success("Price saved");
      onDone();
    } catch (e) {
      toast.error(linkErrorMessage(String((e as Error).message)));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Your price for {level.name}</DialogTitle>
        </DialogHeader>
        <PriceRuleFields
          level={level}
          rule={rule}
          value={value}
          onRule={setRule}
          onValue={setValue}
          range={range}
        />
        <DialogFooter>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save price"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
