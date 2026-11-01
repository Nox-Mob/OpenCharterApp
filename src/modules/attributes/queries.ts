import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AttributeDef, AttributeOption } from "@/engines/attributes";

export type DefWithOptions = AttributeDef & {
  applies_to: "member" | "chapter";
  options: AttributeOption[];
};

/** Member attribute definitions that apply to an org: its own plus those inherited from ancestors. */
export const attributeDefsQuery = (orgId: string, lineage: readonly string[]) =>
  queryOptions({
    queryKey: ["attribute-defs", orgId],
    queryFn: async (): Promise<DefWithOptions[]> => {
      const { data, error } = await supabase
        .from("attribute_definitions")
        .select("*, attribute_options(id,value,label,sort_order,active)")
        .in("org_id", [...lineage, orgId])
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map((d) => ({
        ...(d as unknown as AttributeDef & { applies_to: "member" | "chapter" }),
        options: [
          ...((d as { attribute_options: AttributeOption[] }).attribute_options ?? []),
        ].sort((x, y) => x.sort_order - y.sort_order),
      }));
    },
  });

/** Every member's field values in an org, keyed by profile id then field id (E-14 lists). */
export const orgMemberValuesQuery = (orgId: string) =>
  queryOptions({
    queryKey: ["attribute-values", "org", orgId],
    queryFn: async (): Promise<Record<string, Record<string, unknown>>> => {
      const { data, error } = await supabase
        .from("attribute_values")
        .select("entity_id,definition_id,value")
        .eq("org_id", orgId);
      if (error) throw error;
      const out: Record<string, Record<string, unknown>> = {};
      for (const v of data ?? []) (out[v.entity_id] ??= {})[v.definition_id] = v.value as unknown;
      return out;
    },
  });

/** Attribute values of one entity: a member profile, or a chapter (by org id). */
export const memberValuesQuery = (profileId: string) =>
  queryOptions({
    queryKey: ["attribute-values", profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attribute_values")
        .select("definition_id,value")
        .eq("entity_id", profileId);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((v) => [v.definition_id, v.value as unknown]));
    },
  });
