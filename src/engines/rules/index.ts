import { z } from "zod";

/**
 * Rules engine (E-19, D-064, D-147). A rule is a list of conditions on member attributes (all
 * must hold) and an outcome. Pricing is the first use: the first active matching rule of a
 * term sets its price (a fixed price or a percentage off). Eligibility and approver rules
 * reuse the conditions later. Evaluated here for previews and in SQL (public.term_price) for
 * what's actually charged; both run the same cases (src/engines/rules/rules.test.ts,
 * db/tests/9G_pricing_rules.sql).
 */
export const CONDITION_OPS = ["is", "in", "at_least", "at_most"] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

export type Condition = {
  attribute_id: string;
  op: ConditionOp;
  /** for is / at_least / at_most */
  value?: string | number | boolean | undefined;
  /** for in */
  values?: string[] | undefined;
};

export type PricingRule = {
  id: string;
  term_id: string;
  label: string;
  conditions: Condition[];
  /** exactly one of price_minor / discount_pct is set */
  price_minor: number | null;
  discount_pct: number | null;
  sort_order: number;
  active: boolean;
};

/** What the engine needs to know about an attribute. */
export type RuleAttribute = {
  id: string;
  label: string;
  data_type: string;
  options: readonly { value: string; label: string; sort_order: number }[];
};

export const OP_LABELS: Record<ConditionOp, string> = {
  is: "is",
  in: "is one of",
  at_least: "is at least",
  at_most: "is at most",
};

/** The operators that make sense for an attribute type. */
export function opsFor(dataType: string): ConditionOp[] {
  switch (dataType) {
    case "ordered":
      return ["is", "in", "at_least", "at_most"];
    case "number":
    case "date":
      return ["is", "at_least", "at_most"];
    case "choice":
    case "multi_choice":
      return ["is", "in"];
    default:
      return ["is"];
  }
}

function rank(attr: RuleAttribute, v: unknown): number | null {
  const o = attr.options.find((x) => x.value === v);
  return o ? o.sort_order : null;
}

function compare(attr: RuleAttribute, a: unknown, b: unknown): number | null {
  if (attr.data_type === "ordered") {
    const ra = rank(attr, a);
    const rb = rank(attr, b);
    return ra === null || rb === null ? null : ra - rb;
  }
  if (attr.data_type === "number") {
    const na = Number(a);
    const nb = Number(b);
    return Number.isFinite(na) && Number.isFinite(nb) ? na - nb : null;
  }
  if (attr.data_type === "date") {
    return typeof a === "string" && typeof b === "string" ? a.localeCompare(b) : null;
  }
  return null;
}

const isBlank = (v: unknown) =>
  v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

export function conditionMatches(
  c: Condition,
  attrs: ReadonlyMap<string, RuleAttribute>,
  values: Readonly<Record<string, unknown>>,
): boolean {
  const attr = attrs.get(c.attribute_id);
  const v = values[c.attribute_id];
  if (!attr || isBlank(v)) return false;
  const list = Array.isArray(v) ? v.map(String) : null;
  switch (c.op) {
    case "is":
      if (list) return list.includes(String(c.value));
      if (attr.data_type === "number") return Number(v) === Number(c.value);
      return String(v) === String(c.value);
    case "in": {
      const allowed = c.values ?? [];
      return list ? list.some((x) => allowed.includes(x)) : allowed.includes(String(v));
    }
    case "at_least":
    case "at_most": {
      const d = compare(attr, v, c.value);
      if (d === null) return false;
      return c.op === "at_least" ? d >= 0 : d <= 0;
    }
  }
}

export function ruleMatches(
  rule: Pick<PricingRule, "conditions">,
  attrs: ReadonlyMap<string, RuleAttribute>,
  values: Readonly<Record<string, unknown>>,
): boolean {
  return rule.conditions.every((c) => conditionMatches(c, attrs, values));
}

export function applyOutcome(
  base: number,
  rule: Pick<PricingRule, "price_minor" | "discount_pct">,
) {
  if (rule.price_minor !== null) return rule.price_minor;
  return Math.round((base * (100 - (rule.discount_pct ?? 0))) / 100);
}

/** The price for a member: the first active matching rule (by sort order), else the base. */
export function priceFor(
  base: number,
  rules: readonly PricingRule[],
  attrs: ReadonlyMap<string, RuleAttribute>,
  values: Readonly<Record<string, unknown>>,
): { price: number; rule: PricingRule | null } {
  const rule =
    [...rules]
      .filter((r) => r.active)
      .sort((a, b) => a.sort_order - b.sort_order)
      .find((r) => ruleMatches(r, attrs, values)) ?? null;
  return { price: rule ? applyOutcome(base, rule) : base, rule };
}

function valueLabel(attr: RuleAttribute | undefined, v: unknown): string {
  if (attr?.data_type === "boolean") return v === true || v === "true" ? "yes" : "no";
  return attr?.options.find((o) => o.value === v)?.label ?? String(v);
}

/** "Rank is at least E-5 and Veteran is yes". */
export function describeConditions(
  conditions: readonly Condition[],
  attrs: ReadonlyMap<string, RuleAttribute>,
): string {
  if (conditions.length === 0) return "Everyone";
  return conditions
    .map((c) => {
      const a = attrs.get(c.attribute_id);
      const what =
        c.op === "in"
          ? (c.values ?? []).map((v) => valueLabel(a, v)).join(", ")
          : valueLabel(a, c.value);
      return `${a?.label ?? "A field"} ${OP_LABELS[c.op]} ${what}`;
    })
    .join(" and ");
}

export const conditionSchema = z
  .object({
    attribute_id: z.string().uuid("Pick a field"),
    op: z.enum(CONDITION_OPS),
    value: z.union([z.string(), z.number(), z.boolean()]).optional(),
    values: z.array(z.string()).optional(),
  })
  .refine(
    (c) => (c.op === "in" ? (c.values?.length ?? 0) > 0 : c.value !== undefined && c.value !== ""),
    {
      message: "Pick a value for each condition",
    },
  );

export const pricingRuleInputSchema = z
  .object({
    label: z.string().trim().max(80),
    conditions: z.array(conditionSchema).max(10),
    price_minor: z.number().int().min(0).max(100000000).nullable(),
    discount_pct: z.number().int().min(1).max(100).nullable(),
    sort_order: z.number().int(),
  })
  .refine((r) => (r.price_minor === null) !== (r.discount_pct === null), {
    message: "Give either a price or a discount",
  });
export type PricingRuleInput = z.infer<typeof pricingRuleInputSchema>;
