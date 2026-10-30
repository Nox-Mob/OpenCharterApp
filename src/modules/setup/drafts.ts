import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Answers } from "@/engines/setup";

export const setupStateQuery = (orgId: string, flowId: string) =>
  queryOptions({
    queryKey: ["setup-state", orgId, flowId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("setup_states")
        .select("answers,status,applied_at,updated_at")
        .eq("org_id", orgId)
        .eq("flow_id", flowId)
        .maybeSingle();
      if (error) throw error;
      return data as { answers: Answers; status: "in_progress" | "applied" | "needs_review"; applied_at: string | null; updated_at: string } | null;
    },
  });

/** Save draft answers. Update first (status untouched), insert a new in-progress draft if none exists. */
export async function saveDraft(orgId: string, flowId: string, answers: Answers) {
  const { data: u } = await supabase.auth.getUser();
  const patch = { answers: answers as never, updated_by: u.user?.id ?? null, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from("setup_states").update(patch).eq("org_id", orgId).eq("flow_id", flowId).select("org_id");
  if (error) throw error;
  if (data && data.length > 0) return;
  const { error: e2 } = await supabase.from("setup_states").insert({ org_id: orgId, flow_id: flowId, ...patch });
  if (e2) throw e2;
}

export async function applyFlow(orgId: string, flowId: string, answers: Answers, plan: unknown) {
  const { error } = await supabase.rpc("apply_setup", { _org: orgId, _flow: flowId, _answers: answers as never, _plan: plan as never });
  if (error) throw error;
}
