import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Org } from "@/lib/orgs";
import {
  describeConditions,
  opsFor,
  OP_LABELS,
  pricingRuleInputSchema,
  type Condition,
  type ConditionOp,
  type PricingRule,
  type PricingRuleInput,
  type RuleAttribute,
} from "@/engines/rules";
import { attributeDefsQuery } from "@/modules/attributes/queries";
import {
  pricingErrorMessage,
  pricingRulesQuery,
  ruleAttributes,
  savePricingRule,
  setPricingRuleActive,
} from "@/modules/membership/pricing";
import {
  formatPrice,
  lengthOf,
  parsePrice,
  priceInput,
  termLabel,
  type Term,
} from "@/modules/membership/tiers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type Draft = {
  id: string | null;
  input: PricingRuleInput;
  kind: "price" | "discount";
  amount: string;
};

const outcome = (r: Pick<PricingRule, "price_minor" | "discount_pct">, currency: string) =>
  r.price_minor !== null ? formatPrice(r.price_minor, currency) : `${r.discount_pct}% off`;

/** Pricing rules for one term (E-19): conditions on member fields → a price or a discount. */
export function PricingRulesDialog({
  org,
  term,
  levelName,
  onClose,
}: {
  org: Org;
  term: Term & { id: string };
  levelName: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const rules = useQuery(pricingRulesQuery(org.id));
  const defs = useQuery(attributeDefsQuery(org.id, org.ancestor_ids));
  const attrs = ruleAttributes(defs.data ?? []);
  const mine = (rules.data ?? []).filter((r) => r.term_id === term.id);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["pricing-rules", org.id] });

  function edit(r: PricingRule | null) {
    setDraft(
      r
        ? {
            id: r.id,
            input: {
              label: r.label,
              conditions: r.conditions,
              price_minor: r.price_minor,
              discount_pct: r.discount_pct,
              sort_order: r.sort_order,
            },
            kind: r.price_minor !== null ? "price" : "discount",
            amount:
              r.price_minor !== null ? priceInput(r.price_minor) : String(r.discount_pct ?? ""),
          }
        : {
            id: null,
            input: {
              label: "",
              conditions: [],
              price_minor: null,
              discount_pct: null,
              sort_order: (mine.length + 1) * 10,
            },
            kind: "price",
            amount: "",
          },
    );
  }

  async function save() {
    if (!draft) return;
    const amount =
      draft.kind === "price" ? parsePrice(draft.amount) : Number.parseInt(draft.amount, 10);
    const input: PricingRuleInput = {
      ...draft.input,
      price_minor: draft.kind === "price" ? amount : null,
      discount_pct: draft.kind === "discount" ? (Number.isFinite(amount) ? amount : null) : null,
    };
    const parsed = pricingRuleInputSchema.safeParse(input);
    if (!parsed.success)
      return void toast.error(parsed.error.issues[0]?.message ?? "Check the rule");
    setBusy(true);
    try {
      await savePricingRule(term.id, draft.id, parsed.data);
      toast.success("Rule saved");
      setDraft(null);
      refresh();
    } catch (e) {
      toast.error(pricingErrorMessage(String((e as Error).message)));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(r: PricingRule) {
    try {
      await setPricingRuleActive(r.id, !r.active);
      refresh();
    } catch (e) {
      toast.error(pricingErrorMessage(String((e as Error).message)));
    }
  }

  const setConditions = (conditions: Condition[]) =>
    draft && setDraft({ ...draft, input: { ...draft.input, conditions } });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Pricing rules: {levelName}, {termLabel(lengthOf(term))}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <p className="text-sm text-muted-foreground">
            The usual price is {formatPrice(term.price_minor, term.currency)}. The first rule that
            fits a member, from the top, sets what they pay. Members answer these fields when they
            join.
          </p>
          {!draft ? (
            <>
              {mine.length === 0 ? (
                <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No rules: everyone pays the usual price.
                </p>
              ) : (
                <ol className="divide-y rounded-md border">
                  {mine.map((r) => (
                    <li
                      key={r.id}
                      className={`flex items-center justify-between gap-2 px-3 py-2 text-sm ${r.active ? "" : "opacity-60"}`}
                    >
                      <span>
                        {r.label && <strong>{r.label}: </strong>}
                        {describeConditions(r.conditions, attrs)} →{" "}
                        <strong>{outcome(r, term.currency)}</strong>
                        {!r.active && (
                          <Badge variant="outline" className="ml-2">
                            Retired
                          </Badge>
                        )}
                      </span>
                      <span className="space-x-1 whitespace-nowrap">
                        {r.active && (
                          <Button size="sm" variant="ghost" onClick={() => edit(r)}>
                            Edit
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => toggle(r)}>
                          {r.active ? "Retire" : "Restore"}
                        </Button>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              {attrs.size === 0 && (
                <p className="text-sm text-muted-foreground">
                  Add a member field with choices (for example Rank) to price by it.
                </p>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="rule-label">Name (optional)</Label>
                <Input
                  id="rule-label"
                  placeholder="e.g. Senior ranks"
                  value={draft.input.label}
                  onChange={(e) =>
                    setDraft({ ...draft, input: { ...draft.input, label: e.target.value } })
                  }
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">When a member's fields match all of these</p>
                {draft.input.conditions.map((c, i) => (
                  <ConditionRow
                    key={i}
                    c={c}
                    attrs={attrs}
                    onChange={(next) =>
                      setConditions(draft.input.conditions.map((x, j) => (j === i ? next : x)))
                    }
                    onRemove={() => setConditions(draft.input.conditions.filter((_, j) => j !== i))}
                  />
                ))}
                {draft.input.conditions.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No conditions: applies to everyone.
                  </p>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={attrs.size === 0}
                  onClick={() => {
                    const first = [...attrs.values()][0]!;
                    setConditions([
                      ...draft.input.conditions,
                      { attribute_id: first.id, op: opsFor(first.data_type)[0]! },
                    ]);
                  }}
                >
                  Add condition
                </Button>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label>Then</Label>
                  <Select
                    value={draft.kind}
                    onValueChange={(v) =>
                      setDraft({ ...draft, kind: v as Draft["kind"], amount: "" })
                    }
                  >
                    <SelectTrigger className="w-44" aria-label="Outcome">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="price">they pay</SelectItem>
                      <SelectItem value="discount">they get a discount of</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rule-amount">
                    {draft.kind === "price" ? "Price ($)" : "Percent off"}
                  </Label>
                  <Input
                    id="rule-amount"
                    className="w-28"
                    inputMode="decimal"
                    value={draft.amount}
                    onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rule-order">Order</Label>
                  <Input
                    id="rule-order"
                    type="number"
                    className="w-20"
                    value={draft.input.sort_order}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        input: { ...draft.input, sort_order: Number(e.target.value) },
                      })
                    }
                  />
                </div>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          {draft ? (
            <>
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button onClick={save} disabled={busy}>
                {busy ? "Saving…" : "Save rule"}
              </Button>
            </>
          ) : (
            <Button onClick={() => edit(null)}>Add a rule</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConditionRow({
  c,
  attrs,
  onChange,
  onRemove,
}: {
  c: Condition;
  attrs: ReadonlyMap<string, RuleAttribute>;
  onChange: (c: Condition) => void;
  onRemove: () => void;
}) {
  const attr = attrs.get(c.attribute_id);
  const ops = attr ? opsFor(attr.data_type) : (["is"] as ConditionOp[]);
  const options = attr?.options ?? [];
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border p-2">
      <Select
        value={c.attribute_id}
        onValueChange={(id) =>
          onChange({ attribute_id: id, op: opsFor(attrs.get(id)?.data_type ?? "")[0] ?? "is" })
        }
      >
        <SelectTrigger className="w-40" aria-label="Field">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {[...attrs.values()].map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={c.op}
        onValueChange={(op) => onChange({ attribute_id: c.attribute_id, op: op as ConditionOp })}
      >
        <SelectTrigger className="w-36" aria-label="Comparison">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ops.map((op) => (
            <SelectItem key={op} value={op}>
              {OP_LABELS[op]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {attr?.data_type === "boolean" ? (
        <Select
          value={c.value === undefined ? "" : String(c.value)}
          onValueChange={(v) => onChange({ ...c, value: v === "true" })}
        >
          <SelectTrigger className="w-24" aria-label="Value">
            <SelectValue placeholder="Pick" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Yes</SelectItem>
            <SelectItem value="false">No</SelectItem>
          </SelectContent>
        </Select>
      ) : c.op === "in" ? (
        <div className="flex flex-wrap gap-2 text-sm">
          {options.map((o) => (
            <label key={o.value} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={(c.values ?? []).includes(o.value)}
                onChange={(e) =>
                  onChange({
                    ...c,
                    values: e.target.checked
                      ? [...(c.values ?? []), o.value]
                      : (c.values ?? []).filter((v) => v !== o.value),
                  })
                }
              />
              {o.label}
            </label>
          ))}
        </div>
      ) : options.length > 0 ? (
        <Select
          value={c.value === undefined ? "" : String(c.value)}
          onValueChange={(v) => onChange({ ...c, value: v })}
        >
          <SelectTrigger className="w-36" aria-label="Value">
            <SelectValue placeholder="Pick" />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          aria-label="Value"
          className="w-36"
          type={
            attr?.data_type === "date" ? "date" : attr?.data_type === "number" ? "number" : "text"
          }
          value={c.value === undefined ? "" : String(c.value)}
          onChange={(e) =>
            onChange({
              ...c,
              value:
                attr?.data_type === "number" && e.target.value !== ""
                  ? Number(e.target.value)
                  : e.target.value,
            })
          }
        />
      )}
      <Button size="sm" variant="ghost" onClick={onRemove}>
        Remove
      </Button>
    </div>
  );
}
