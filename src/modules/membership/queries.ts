import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveFromAncestors, type SettingRow } from "@/engines/settings";
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
      return (
        resolveFromAncestors(
          [...lineage, orgId],
          (data ?? []) as SettingRow[],
          "membership.child_levels_allowed",
          true,
        ) !== false
      );
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
  return "Couldn't save the level";
}
