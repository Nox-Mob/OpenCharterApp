import { queryOptions } from "@tanstack/react-query";
import { db } from "@/lib/db/pending-schema";
import type { Standing } from "./standing";

/**
 * National standing for a chapter's members (A5, D-178, separate-memberships model): for a
 * chapter admin, each member's standing at the national. public.chapter_national_standing returns
 * standing only (never the national's records) and needs members.view at the chapter.
 */
export const chapterNationalStandingQuery = (chapterId: string) =>
  queryOptions({
    queryKey: ["chapter-national-standing", chapterId],
    queryFn: async (): Promise<Map<string, Standing>> => {
      const { data, error } = await db.rpc("chapter_national_standing", { _chapter: chapterId });
      if (error) throw error;
      return new Map((data ?? []).map((r) => [r.profile_id, r.national_standing as Standing]));
    },
  });
