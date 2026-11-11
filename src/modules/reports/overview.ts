import { queryOptions } from "@tanstack/react-query";
import { db } from "@/lib/db/pending-schema";
import type { Database } from "@/integrations/supabase/types";

type Fn = Database["charter"]["Functions"];

/**
 * The numbers on an organization's Overview page (D-152): for the org and everything below it,
 * from public.org_overview_stats (aggregates only, needs members.view, which inherits downward,
 * so a chapter admin only ever sees their chapter). People are counted once across the tree.
 */
export type OverviewStats = Fn["org_overview_stats"]["Returns"][number];

export const EMPTY_STATS: OverviewStats = {
  chapters: 0,
  orgs_below: 0,
  roster: 0,
  current_members: 0,
  lifetime_members: 0,
  chapter_memberships: 0,
  pending_members: 0,
  joined_30d: 0,
  expiring_30: 0,
};

export const overviewStatsQuery = (orgId: string) =>
  queryOptions({
    queryKey: ["overview-stats", orgId],
    queryFn: async (): Promise<OverviewStats> => {
      const { data, error } = await db.rpc("org_overview_stats", { _org: orgId });
      if (error) throw error;
      return data?.[0] ?? EMPTY_STATS;
    },
  });

/** Current members per chapter, one decimal; null when there are no chapters. */
export function averagePerChapter(s: Pick<OverviewStats, "chapters" | "chapter_memberships">) {
  if (s.chapters <= 0) return null;
  return Math.round((s.chapter_memberships / s.chapters) * 10) / 10;
}

/** Lifetime vs other current members, with the lifetime share (0..1, 0 when nobody is current). */
export function lifetimeSplit(s: Pick<OverviewStats, "current_members" | "lifetime_members">) {
  const lifetime = Math.min(s.lifetime_members, s.current_members);
  const other = s.current_members - lifetime;
  return { lifetime, other, share: s.current_members > 0 ? lifetime / s.current_members : 0 };
}

export const percent = (share: number) => `${Math.round(share * 100)}%`;
