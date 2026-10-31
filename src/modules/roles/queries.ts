import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Role } from "./index";

/** Every role this person can see (platform roles plus roles in their visible org tree). */
export const rolesQuery = () =>
  queryOptions({
    queryKey: ["roles"],
    queryFn: async (): Promise<Role[]> => {
      const { data, error } = await supabase
        .from("roles")
        .select("id,org_id,key,name,description,active,role_permissions(permission_key)")
        .order("name");
      if (error) throw error;
      return (data ?? []).map(({ role_permissions, ...r }) => ({
        ...r,
        permissions: (role_permissions ?? []).map((p) => p.permission_key).sort(),
      }));
    },
  });
