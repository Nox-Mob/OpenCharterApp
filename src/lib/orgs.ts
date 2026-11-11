import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Org = {
  id: string;
  name: string;
  slug: string;
  type: "platform" | "national" | "region" | "chapter" | "standalone";
  parent_id: string | null;
  ancestor_ids: string[];
  timezone: string;
  logo_path: string | null;
  /** The OpenAppHub organization (the customer) this unit belongs to: the top unit's id. */
  org_id?: string;
  /** Test data (D-148): deletable, never emails. Undefined before migration 0022. */
  is_demo?: boolean;
};

const ORG_COLUMNS = "id,name,slug,type,parent_id,ancestor_ids,timezone,logo_path,org_id";
const LEGACY_DEMO_PREFIX = "d1000000-";

/** A demo org (D-148). Before migration 0022, the original demo orgs are known by their ID prefix. */
export function isDemoOrg(org: Pick<Org, "id" | "ancestor_ids" | "is_demo">): boolean {
  if (org.is_demo !== undefined) return org.is_demo;
  return [org.id, ...org.ancestor_ids].some((id) => id.startsWith(LEGACY_DEMO_PREFIX));
}

/** Demo orgs never send email (D-148). The email system (E-08) must check this before sending. */
export const emailsAllowed = (org: Pick<Org, "id" | "ancestor_ids" | "is_demo">) => !isDemoOrg(org);

export const myOrgsQuery = () =>
  queryOptions({
    queryKey: ["orgs", "mine"],
    queryFn: async (): Promise<Org[]> => {
      // Untyped: is_demo isn't in the generated types until 0022 is applied.
      const orgs = supabase as unknown as SupabaseClient;
      const withDemo = await orgs.from("units").select(`${ORG_COLUMNS},is_demo`).order("name");
      // 42703 = the column doesn't exist yet (migration 0022 not applied): read without it
      if (withDemo.error?.code === "42703") {
        const { data, error } = await orgs.from("units").select(ORG_COLUMNS).order("name");
        if (error) throw error;
        return data as Org[];
      }
      if (withDemo.error) throw withDemo.error;
      return withDemo.data as Org[];
    },
  });

export const myPermissionsQuery = () =>
  queryOptions({
    queryKey: ["grants", "mine"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const { data, error } = await supabase
        .from("role_assignments")
        .select("unit_id, roles(role_permissions(permission_key))")
        .eq("user_id", u.user.id);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        unit_id: r.unit_id,
        permissions:
          (
            r.roles as { role_permissions: { permission_key: string }[] } | null
          )?.role_permissions.map((p) => p.permission_key) ?? [],
      }));
    },
  });

export const TYPE_LABEL: Record<Org["type"], string> = {
  platform: "Platform",
  national: "National",
  region: "Region",
  chapter: "Chapter",
  standalone: "Standalone",
};
