import { queryOptions } from "@tanstack/react-query";
import type { Json } from "@/integrations/supabase/types";
import { db } from "@/lib/db/pending-schema";
import {
  pricingRuleInputSchema,
  type Condition,
  type PricingRule,
  type PricingRuleInput,
  type RuleAttribute,
} from "@/engines/rules";
import type { DefWithOptions } from "@/modules/attributes/queries";

/**
 * Pricing rules (E-19, D-147): a term's price can depend on member fields. Writes go through
 * save_pricing_rule / set_pricing_rule_active; what's charged comes from public.term_price.
 */
export const pricingRulesQuery = (orgId: string) =>
  queryOptions({
    queryKey: ["pricing-rules", orgId],
    queryFn: async (): Promise<PricingRule[]> => {
      const { data, error } = await db
        .from("pricing_rules")
        .select("id,term_id,label,conditions,price_minor,discount_pct,sort_order,active")
        .eq("org_id", orgId)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        conditions: r.conditions as unknown as Condition[],
      }));
    },
  });

/** The signed-in person's price for a term, given their answers so far (null = base price). */
export const quotePriceQuery = (termId: string, answers: Record<string, unknown> = {}) =>
  queryOptions({
    queryKey: ["quote-price", termId, answers],
    queryFn: async (): Promise<number> => {
      const { data, error } = await db.rpc("quote_price", {
        _term: termId,
        _answers: answers as Json,
      });
      if (error) throw error;
      return data as number;
    },
  });

/** Member fields usable in conditions (active member fields, here or inherited). */
export function ruleAttributes(defs: readonly DefWithOptions[]): Map<string, RuleAttribute> {
  return new Map(
    defs
      .filter((d) => d.applies_to === "member" && d.active && d.data_type !== "text")
      .map((d) => [
        d.id,
        {
          id: d.id,
          label: d.label,
          data_type: d.data_type,
          options: d.options
            .filter((o) => o.active)
            .map((o) => ({ value: o.value, label: o.label, sort_order: o.sort_order })),
        },
      ]),
  );
}

/** SQL null for arguments the generated types mark required (see seats.ts sqlNull). */
const sqlNull = <T>(v: T | null): T => v as T;

export async function savePricingRule(
  termId: string,
  ruleId: string | null,
  input: PricingRuleInput,
) {
  const v = pricingRuleInputSchema.parse(input);
  const { data, error } = await db.rpc("save_pricing_rule", {
    _term: termId,
    _rule: sqlNull(ruleId),
    _label: v.label,
    _conditions: v.conditions as unknown as Json,
    _price_minor: sqlNull(v.price_minor),
    _discount_pct: sqlNull(v.discount_pct),
    _sort_order: v.sort_order,
  });
  if (error) throw error;
  return data as string;
}

export async function setPricingRuleActive(ruleId: string, active: boolean) {
  const { error } = await db.rpc("set_pricing_rule_active", { _rule: ruleId, _active: active });
  if (error) throw error;
}

export function pricingErrorMessage(message: string): string {
  const known: [string, string][] = [
    ["either a price or a discount", "Give either a price or a discount"],
    ["can't be compared", "That comparison doesn't fit the field"],
    ["no such choice", "One of the choices no longer exists"],
    ["needs a number", "Enter a number"],
    ["needs a date", "Pick a date"],
    ["pick a value", "Pick a value for each condition"],
    ["unknown field", "One of the fields no longer exists"],
    ["chapter dues must be between", "The price is outside your national's range for chapter dues"],
  ];
  return known.find(([k]) => message.includes(k))?.[1] ?? "Couldn't save the rule";
}
