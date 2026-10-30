import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Org = {
  id: string;
  name: string;
  slug: string;
  type: "platform" | "national" | "region" | "chapter" | "standalone";
  parent_id: string | null;
  ancestor_ids: string[];
};

export const myOrgsQuery = () =>
  queryOptions({
    queryKey: ["orgs", "mine"],
    queryFn: async (): Promise<Org[]> => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id,name,slug,type,parent_id,ancestor_ids")
        .order("name");
      if (error) throw error;
      return data as Org[];
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
        .select("org_id, roles(role_permissions(permission_key))")
        .eq("user_id", u.user.id);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        org_id: r.org_id,
        permissions:
          (r.roles as { role_permissions: { permission_key: string }[] } | null)?.role_permissions.map(
            (p) => p.permission_key,
          ) ?? [],
      }));
    },
  });

export const auditQuery = (orgId: string) =>
  queryOptions({
    queryKey: ["audit", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_events")
        .select("id,action,target_type,target_id,actor_id,created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

export const TYPE_LABEL: Record<Org["type"], string> = {
  platform: "Platform",
  national: "National",
  region: "Region",
  chapter: "Chapter",
  standalone: "Standalone",
};
