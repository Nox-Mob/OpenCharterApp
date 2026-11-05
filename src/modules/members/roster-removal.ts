import { queryOptions } from "@tanstack/react-query";
import { db } from "@/lib/db/pending-schema";
import { supabase } from "@/integrations/supabase/client";
import { readAllPages } from "@/lib/db/pages";

/**
 * Remove from roster (U2, D-190, migration 0037). A record is never deleted: it's marked as
 * left (history, payments and receipts stay), its membership here ends, seats end and the roles
 * those seats gave go. It can be restored. Chapter records that stand for a national membership
 * (home-chapter model) are moved from the national instead.
 */
export async function removeFromRoster(profileId: string, reason: string) {
  const { error } = await db.rpc("remove_member_record", { _profile: profileId, _reason: reason });
  if (error) throw error;
}

export async function restoreToRoster(profileId: string) {
  const { error } = await db.rpc("restore_member_record", { _profile: profileId });
  if (error) throw error;
}

export type RemovedMember = {
  id: string;
  display_name: string;
  email: string;
  left_at: string;
};

/** Records taken off this org's roster (not chapter records of a national membership). */
export const removedMembersQuery = (orgId: string) =>
  queryOptions({
    queryKey: ["removed-members", orgId],
    queryFn: async (): Promise<RemovedMember[]> =>
      readAllPages<RemovedMember>(
        (from, to) =>
          supabase
            .from("org_member_profiles")
            .select("id,display_name,email,left_at")
            .eq("org_id", orgId)
            .not("left_at", "is", null)
            .is("home_of", null)
            .order("left_at", { ascending: false })
            .order("id")
            .range(from, to) as unknown as PromiseLike<{
            data: RemovedMember[] | null;
            error: unknown;
          }>,
      ),
  });

const MESSAGES: [RegExp, string][] = [
  [/remove yourself/, "You can't take yourself off the roster."],
  [/hold a role here/, "They hold a role here. Remove it on Settings → Roles first."],
  [
    /choose their own chapter/,
    "Members choose their own chapter. Move them from the national's Members page.",
  ],
  [/already removed/, "They're already off the roster."],
  [
    /login or email is already on the roster/,
    "Someone with that login or email is already on the roster.",
  ],
  [/on the roster/, "They're already on the roster."],
  [/300 characters/, "Keep the reason under 300 characters."],
  [/not allowed/, "You don't have permission to do that."],
];

export function rosterErrorMessage(message: string): string {
  return MESSAGES.find(([re]) => re.test(message))?.[1] ?? "That didn't work. Please try again.";
}
