import { infiniteQueryOptions } from "@tanstack/react-query";
import { db } from "@/lib/db/pending-schema";
import { supabase } from "@/integrations/supabase/client";
import { toAuditEvent, type AuditEvent } from "./describe";

export const AUDIT_PAGE = 200;

/** Setup drafts are left out (D-191); the database does the same once 0037 is applied. */
export function isSetupDraft(e: Pick<AuditEvent, "target_type" | "before" | "after">) {
  if (e.target_type !== "setup_states") return false;
  const applied = e.after?.["status"] === "applied";
  const newlyApplied = !e.before || e.before["applied_at"] !== e.after?.["applied_at"];
  return !(applied && newlyApplied);
}

/**
 * One organization's audit log, newest first, in pages (D-191). Each org sees only its own
 * events: a national's log doesn't include its chapters, nor a chapter's its national's.
 * Before migration 0037 the events are read directly (no names for the people).
 */
export const auditLogQuery = (orgId: string, readable: boolean) =>
  infiniteQueryOptions({
    queryKey: ["audit-log", orgId, readable],
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }): Promise<AuditEvent[]> => {
      if (readable) {
        const { data, error } = await db.rpc("audit_log", {
          _org: orgId,
          ...(pageParam ? { _before: pageParam } : {}),
          _limit: AUDIT_PAGE,
        });
        if (error) throw error;
        return (data ?? []).map(toAuditEvent);
      }
      let q = supabase
        .from("audit_events")
        .select("id,created_at,action,target_type,target_id,actor_id,before,after")
        .eq("unit_id", orgId)
        .order("id", { ascending: false })
        .limit(AUDIT_PAGE);
      if (pageParam) q = q.lt("id", pageParam);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? [])
        .map((r) => toAuditEvent({ ...r, id: Number(r.id) }))
        .filter((e) => !isSetupDraft(e));
    },
    getNextPageParam: (last) => (last.length > 0 ? last[last.length - 1]!.id : undefined),
  });
