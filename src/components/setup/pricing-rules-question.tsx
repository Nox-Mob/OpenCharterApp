import { useState } from "react";
import { toast } from "sonner";
import { describeConditions, type Condition, type RuleAttribute } from "@/engines/rules";
import { formatPrice, lengthOf, termLabel, type Tier } from "@/modules/membership/tiers";
import type { PricingRuleAnswer } from "@/modules/membership/setup-flow";
import { ConditionRow } from "@/components/membership/pricing-rules-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Draft = {
  label: string;
  conditions: Condition[];
  kind: "price" | "discount";
  amount: string;
};
const EMPTY: Draft = { label: "", conditions: [], kind: "discount", amount: "" };

/**
 * Membership setup's pricing step (A6, D-177): rules per term of the levels in this setup, by
 * member fields that already exist. Applied with the rest of setup; a rule is matched by its
 * label, so applying again updates it instead of adding another.
 */
export function PricingRulesQuestion({
  value,
  onChange,
  tiers,
  attrs,
}: {
  value: PricingRuleAnswer[];
  onChange: (v: PricingRuleAnswer[]) => void;
  tiers: Tier[];
  attrs: ReadonlyMap<string, RuleAttribute>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const terms = tiers.flatMap((t) =>
    t.terms
      .filter((x) => x.active !== false)
      .map((x) => ({ tier: t, term: x, key: `${t.key}/${x.key}` })),
  );
  if (terms.length === 0)
    return (
      <p className="text-sm text-muted-foreground">Add a membership level first (previous step).</p>
    );
  if (attrs.size === 0)
    return (
      <p className="text-sm text-muted-foreground">
        Pricing rules use member fields such as Rank. Apply setup with your member fields first,
        then come back to this step (or add rules later on Settings → Membership levels).
      </p>
    );

  function add(tierKey: string, termKey: string) {
    const label = draft.label.trim();
    if (!label) return void toast.error("Give the rule a name, e.g. Veterans");
    const n = Number(draft.amount);
    if (!Number.isFinite(n) || n < 0 || (draft.kind === "discount" && (n < 1 || n > 100)))
      return void toast.error(
        draft.kind === "discount" ? "A discount from 1 to 100%" : "Enter a price",
      );
    if (value.some((r) => r.tier_key === tierKey && r.term_key === termKey && r.label === label))
      return void toast.error("This term already has a rule with that name");
    onChange([
      ...value,
      {
        tier_key: tierKey,
        term_key: termKey,
        label,
        conditions: draft.conditions,
        price_minor: draft.kind === "price" ? Math.round(n * 100) : null,
        discount_pct: draft.kind === "discount" ? Math.round(n) : null,
      },
    ]);
    setDraft(EMPTY);
    setOpen(null);
  }

  const firstAttr = [...attrs.values()][0]!;
  return (
    <div className="space-y-4">
      {terms.map(({ tier, term, key }) => {
        const rules = value.filter((r) => `${r.tier_key}/${r.term_key}` === key);
        return (
          <section
            key={key}
            className="rounded-md border p-3"
            aria-label={`${tier.name}, ${term.label}`}
          >
            <p className="font-medium">
              {tier.name} · {termLabel(lengthOf(term))} ·{" "}
              {formatPrice(term.price_minor, term.currency)}
            </p>
            {rules.length > 0 && (
              <ol className="mt-2 space-y-1 text-sm">
                {rules.map((r) => (
                  <li key={r.label} className="flex items-center justify-between gap-2">
                    <span>
                      <span className="font-medium">{r.label}:</span>{" "}
                      {describeConditions(r.conditions, attrs)} →{" "}
                      {r.price_minor !== null
                        ? formatPrice(r.price_minor, term.currency)
                        : `${r.discount_pct}% off`}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onChange(value.filter((x) => x !== r))}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ol>
            )}
            {open === key ? (
              <div className="mt-3 space-y-3 rounded-md bg-muted/40 p-3">
                <div className="space-y-1">
                  <Label htmlFor={`rule-label-${key}`}>Rule name</Label>
                  <Input
                    id={`rule-label-${key}`}
                    placeholder="Veterans"
                    value={draft.label}
                    onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Applies when (all of these)</p>
                  {draft.conditions.map((c, i) => (
                    <ConditionRow
                      key={i}
                      c={c}
                      attrs={attrs}
                      onChange={(nc) =>
                        setDraft({
                          ...draft,
                          conditions: draft.conditions.map((x, j) => (j === i ? nc : x)),
                        })
                      }
                      onRemove={() =>
                        setDraft({
                          ...draft,
                          conditions: draft.conditions.filter((_, j) => j !== i),
                        })
                      }
                    />
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        conditions: [...draft.conditions, { attribute_id: firstAttr.id, op: "is" }],
                      })
                    }
                  >
                    Add a condition
                  </Button>
                  {draft.conditions.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No conditions: applies to everyone.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex items-center gap-1 text-sm">
                    <input
                      type="radio"
                      checked={draft.kind === "discount"}
                      onChange={() => setDraft({ ...draft, kind: "discount" })}
                    />
                    A discount (%)
                  </label>
                  <label className="flex items-center gap-1 text-sm">
                    <input
                      type="radio"
                      checked={draft.kind === "price"}
                      onChange={() => setDraft({ ...draft, kind: "price" })}
                    />
                    A price ($)
                  </label>
                  <Input
                    aria-label={draft.kind === "discount" ? "Discount percent" : "Price in dollars"}
                    type="number"
                    min={0}
                    className="w-28"
                    value={draft.amount}
                    onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => add(tier.key, term.key)}>
                    Add rule
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => {
                  setDraft(EMPTY);
                  setOpen(key);
                }}
              >
                Add a pricing rule
              </Button>
            )}
          </section>
        );
      })}
    </div>
  );
}
