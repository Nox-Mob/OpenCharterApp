// The hub's billing for an organization (core get_org_billing): the shell's banner and, from it,
// whether Charter is read-only (S-05). null when billing is off (self-hosted). One cached query
// per organization: the shell and the pages share it.
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrgBilling, isReadOnly } from "@shared/supabase/billing";
import { supabase } from "@/integrations/supabase/client";

/** `suiteOrgId`: the OpenAppHub organization (a unit's `org_id`, else its own id). */
export function useBilling(suiteOrgId: string | null | undefined) {
  return useQuery({
    queryKey: ["billing", suiteOrgId],
    enabled: !!suiteOrgId,
    queryFn: () =>
      getOrgBilling(supabase.schema("public") as unknown as SupabaseClient, suiteOrgId ?? ""),
  });
}

/** True while the organization's plan makes Charter read-only. */
export function useReadOnly(suiteOrgId: string | null | undefined): boolean {
  return isReadOnly(useBilling(suiteOrgId).data, "charter");
}
