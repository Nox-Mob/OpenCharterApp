import { queryOptions } from "@tanstack/react-query";
import { db } from "@/lib/db/pending-schema";
import { formatPrice } from "./tiers";

/**
 * Suggested levels (A4, D-165, D-177, migration 0032). A national (or region) marks a level as
 * suggested; a chapter starts from it as a Copy (its own level) or Linked (follows the national's
 * level; price the same or a set reduction, kept within the national's range). Only the database
 * functions set or change a link; triggers keep linked levels in step.
 */
export type LinkMode = "copy" | "linked";
export type PriceRule = "same" | "minus_amount" | "minus_percent";

export type LevelLink = {
  id: string;
  suggested: boolean;
  source_tier_id: string | null;
  link_mode: LinkMode | null;
  price_rule: PriceRule | null;
  price_value: number | null;
};

export const LINK_CHOICES: readonly { value: LinkMode; label: string; explanation: string }[] = [
  {
    value: "copy",
    label: "Copy it",
    explanation:
      "Your own level, starting from theirs. Rename it, change its terms and set your own prices. Later changes at the national don't affect it.",
  },
  {
    value: "linked",
    label: "Link to it",
    explanation:
      "Keeps the national's name and terms, and changes when theirs does. You choose your price: the same as theirs, or a set amount or percentage less. You can make it your own later.",
  },
];

export const RULE_LABELS: Record<PriceRule, string> = {
  same: "The same price as theirs",
  minus_amount: "A set amount less",
  minus_percent: "A percentage less",
};

/** Link details of the levels of an org and its ancestors (by level id). */
export const levelLinksQuery = (orgId: string, lineage: readonly string[]) =>
  queryOptions({
    queryKey: ["level-links", orgId],
    queryFn: async (): Promise<Map<string, LevelLink>> => {
      const { data, error } = await db
        .from("membership_tiers")
        .select("id,suggested,source_tier_id,link_mode,price_rule,price_value")
        .in("org_id", [...lineage, orgId]);
      if (error) throw error;
      return new Map((data ?? []).map((r) => [r.id, r as LevelLink]));
    },
  });

/** "20% less than Demo National's", "$5.00 less …", "Same price as …". */
export function describePriceRule(rule: PriceRule | null, value: number | null, source: string) {
  if (rule === "minus_amount") return `${formatPrice(value ?? 0)} less than ${source}'s`;
  if (rule === "minus_percent") return `${value ?? 0}% less than ${source}'s`;
  return `Same price as ${source}'s`;
}

/**
 * Mirror of public.linked_price: the chapter's price for a national price, never below zero and
 * kept within the national's chapter price range (null = no limit).
 */
export function linkedPrice(
  price: number,
  rule: PriceRule,
  value: number,
  range: { min: number | null; max: number | null } = { min: null, max: null },
): number {
  let p =
    rule === "minus_amount"
      ? Math.max(price - value, 0)
      : rule === "minus_percent"
        ? Math.max(Math.round((price * (100 - Math.min(value, 100))) / 100), 0)
        : price;
  if (range.min && p < range.min) p = range.min;
  if (range.max && p > range.max) p = range.max;
  return p;
}

export async function setLevelSuggested(tierId: string, suggested: boolean) {
  const { error } = await db.from("membership_tiers").update({ suggested }).eq("id", tierId);
  if (error) throw error;
}

export async function adoptSuggestedLevel(
  orgId: string,
  sourceId: string,
  mode: LinkMode,
  rule: PriceRule = "same",
  value = 0,
) {
  const { data, error } = await db.rpc("adopt_suggested_level", {
    _org: orgId,
    _source: sourceId,
    _mode: mode,
    _rule: rule,
    _value: value,
  });
  if (error) throw error;
  return data as string;
}

export async function setLinkedLevelPrice(tierId: string, rule: PriceRule, value = 0) {
  const { error } = await db.rpc("set_linked_level_price", {
    _tier: tierId,
    _rule: rule,
    _value: value,
  });
  if (error) throw error;
}

export async function makeLevelOwn(tierId: string) {
  const { error } = await db.rpc("make_level_own", { _tier: tierId });
  if (error) throw error;
}

export function linkErrorMessage(message: string): string {
  const known: [string, string][] = [
    ["isn't suggested to you", "That level isn't suggested to this organization"],
    ["parent organization manages", "Your parent organization manages membership levels"],
    ["make it your own", "This level follows your national's. Make it your own to change it"],
    ["percentage off", "Choose the same price, an amount off, or a percentage up to 100"],
    ["chapter dues must be between", "That price is outside your national's range"],
  ];
  return known.find(([k]) => message.includes(k))?.[1] ?? "Couldn't save the change";
}
