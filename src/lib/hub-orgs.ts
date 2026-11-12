// Your OpenAppHub organizations (core tables), for setting them up in OpenCharterApp.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type HubOrg = { id: string; name: string; role: string };

/** Your OpenAppHub organizations (any role), from the core tables. */
export function useHubOrgs() {
  return useQuery({
    queryKey: ["hub-orgs"],
    queryFn: async (): Promise<HubOrg[]> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const { data, error } = await supabase
        .schema("public")
        .from("memberships")
        .select("role, organizations(id, name)")
        .eq("user_id", u.user.id);
      if (error) throw error;
      return (data ?? []).flatMap((m) =>
        m.organizations
          ? [{ id: m.organizations.id, name: m.organizations.name, role: m.role }]
          : [],
      );
    },
  });
}

export const canSetUp = (o: HubOrg) => o.role === "owner" || o.role === "admin";
