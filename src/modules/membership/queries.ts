import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ancestorValue, resolveFromAncestors, type SettingRow } from "@/engines/settings";
import { tierInputSchema, type Term, type Tier, type TierInput } from "./tiers";

/** Levels of an org and its ancestors (ancestors' levels are shown read-only). */
export const tiersQuery = (orgId: string, lineage: readonly string[]) =>
  queryOptions({
    queryKey: ["tiers", orgId],
    queryFn: async (): Promise<(Tier & { id: string; org_id: string; active: boolean })[]> => {
      const { data, error } = await supabase
        .from("membership_tiers")
        .select(
          "id,org_id,key,name,description,tax_treatment,active,sort_order,tier_terms(id,key,label,length_count,length_unit,price_minor,currency,active,sort_order)",
        )
        .in("org_id", [...lineage, orgId])
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map(({ tier_terms, sort_order: _s, ...t }) => ({
        ...t,
        terms: [...(tier_terms ?? [])]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(({ sort_order: _o, ...x }) => x as Term),
      }));
    },
  });

/** Whether this org may define its own levels (parent's membership.child_levels_allowed, D-123). */
export const childLevelsAllowedQuery = (orgId: string, lineage: readonly string[]) =>
  queryOptions({
    queryKey: ["child-levels-allowed", orgId],
    queryFn: async (): Promise<boolean> => {
      if (lineage.length === 0) return true;
      const { data, error } = await supabase.rpc("lineage_settings", { _org: orgId });
      if (error) throw error;
      const rows = (data ?? []) as SettingRow[];
      const chain = [...lineage, orgId];
      return (
        resolveFromAncestors(chain, rows, "membership.child_levels_allowed", true) !== false &&
        // "No chapter dues" also means chapters use the parent's levels (D-146).
        resolveFromAncestors(chain, rows, "membership.chapter_dues", "optional") !== "none"
      );
    },
  });

export type ChapterDuesRule = {
  mode: "none" | "optional" | "required";
  /** cents; null = no limit */
  min: number | null;
  max: number | null;
};

/** The national's rules for this chapter's own dues (D-055, D-146). */
export const chapterDuesRuleQuery = (orgId: string, lineage: readonly string[]) =>
  queryOptions({
    queryKey: ["chapter-dues-rule", orgId],
    queryFn: async (): Promise<ChapterDuesRule> => {
      if (lineage.length === 0) return { mode: "optional", min: null, max: null };
      const { data, error } = await supabase.rpc("lineage_settings", { _org: orgId });
      if (error) throw error;
      const rows = (data ?? []) as SettingRow[];
      const chain = [...lineage, orgId];
      const limit = (key: string) => {
        const v = Number(resolveFromAncestors(chain, rows, key, 0));
        return Number.isFinite(v) && v > 0 ? v : null;
      };
      const mode = resolveFromAncestors(chain, rows, "membership.chapter_dues", "optional");
      return {
        mode: mode === "none" || mode === "required" ? mode : "optional",
        min: limit("membership.chapter_dues_min_minor"),
        max: limit("membership.chapter_dues_max_minor"),
      };
    },
  });

/** How a parent org has decided this org's new members are accepted, if it has (D-130). */
export const parentApprovalQuery = (orgId: string, lineage: readonly string[]) =>
  queryOptions({
    queryKey: ["parent-approval", orgId],
    queryFn: async (): Promise<"auto" | "review" | null> => {
      if (lineage.length === 0) return null;
      const { data, error } = await supabase.rpc("lineage_settings", { _org: orgId });
      if (error) throw error;
      const v = ancestorValue(
        [...lineage, orgId],
        (data ?? []) as SettingRow[],
        "membership.child_approval",
        "chapter",
      ).value;
      return v === "auto" || v === "review" ? v : null;
    },
  });

/** Create or update a level and its terms. Terms removed in the editor are retired, not deleted. */
export async function saveTier(
  orgId: string,
  input: TierInput,
  existing: (Tier & { id: string }) | null,
) {
  const t = tierInputSchema.parse(input);
  let tierId = existing?.id;
  if (!existing) {
    const { data, error } = await supabase
      .from("membership_tiers")
      .insert({
        org_id: orgId,
        key: t.key,
        name: t.name,
        description: t.description,
        tax_treatment: t.tax_treatment,
      })
      .select("id")
      .single();
    if (error) throw error;
    tierId = data.id;
  } else {
    const { error } = await supabase
      .from("membership_tiers")
      .update({ name: t.name, description: t.description, tax_treatment: t.tax_treatment })
      .eq("id", existing.id);
    if (error) throw error;
  }
  const prior = new Map((existing?.terms ?? []).map((x) => [x.key, x]));
  for (const [i, term] of t.terms.entries()) {
    const fields = {
      label: term.label,
      length_count: term.length_count,
      length_unit: term.length_unit,
      price_minor: term.price_minor,
      currency: term.currency,
      sort_order: (i + 1) * 10,
      active: true,
    };
    const p = prior.get(term.key);
    if (p?.id) {
      const { error } = await supabase.from("tier_terms").update(fields).eq("id", p.id);
      if (error) throw error;
      prior.delete(term.key);
    } else {
      const { error } = await supabase
        .from("tier_terms")
        .insert({ ...fields, tier_id: tierId!, org_id: orgId, key: term.key });
      if (error) throw error;
    }
  }
  for (const p of prior.values()) {
    if (p.id && p.active !== false) {
      const { error } = await supabase.from("tier_terms").update({ active: false }).eq("id", p.id);
      if (error) throw error;
    }
  }
}

export async function setTierActive(id: string, active: boolean) {
  const { error } = await supabase.from("membership_tiers").update({ active }).eq("id", id);
  if (error) throw error;
}

export function tierErrorMessage(message: string): string {
  if (message.includes("parent organization manages"))
    return "Your parent organization manages membership levels";
  if (message.includes("duplicate")) return "A level with that name already exists";
  // e.g. "chapter dues must be between 10.00 and 30.00 (set by your national)" (D-146)
  const range = /chapter dues must be between ([\d.]+) and ([\w .]+?) \(/.exec(message);
  if (range)
    return range[2] === "any amount"
      ? `Your national requires chapter prices of at least $${range[1]}`
      : `Your national requires chapter prices between $${range[1]} and $${range[2]}`;
  return "Couldn't save the level";
}
