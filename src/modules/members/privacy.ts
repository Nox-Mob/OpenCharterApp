import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db/pending-schema";
import { resolveFromAncestors, resolveSetting, type SettingRow } from "@/engines/settings";

/** Member privacy rules for an org (D-139, Q-11): its directory default and the parent's export rule. */
export type PrivacyRules = { listedByDefault: boolean; adminOverrideAllowed: boolean };

export const privacyRulesQuery = (orgId: string, lineage: readonly string[]) =>
  queryOptions({
    queryKey: ["privacy-rules", orgId],
    queryFn: async (): Promise<PrivacyRules> => {
      const { data, error } = await supabase.rpc("lineage_settings", { _org: orgId });
      if (error) throw error;
      const rows = (data ?? []) as SettingRow[];
      const chain = [...lineage, orgId];
      return {
        listedByDefault:
          resolveSetting(chain, rows, "directory.listed_by_default", true).value !== false,
        adminOverrideAllowed:
          resolveFromAncestors(chain, rows, "privacy.admin_override_allowed", true) !== false,
      };
    },
  });

export type DirectoryEntry = {
  profile_id: string;
  display_name: string;
  fields: Record<string, unknown>;
};

export const directoryQuery = (orgId: string) =>
  queryOptions({
    queryKey: ["member-directory", orgId],
    queryFn: async (): Promise<DirectoryEntry[]> => {
      const { data, error } = await db.rpc("member_directory", { _org: orgId });
      if (error) throw error;
      return (data ?? []).map((d) => ({
        profile_id: d.profile_id,
        display_name: d.display_name,
        fields: (d.fields ?? {}) as Record<string, unknown>,
      }));
    },
  });

export const myDirectoryChoiceQuery = (orgId: string) =>
  queryOptions({
    queryKey: ["my-directory-choice", orgId],
    /** undefined = not a member here; null = following the org default. */
    queryFn: async (): Promise<boolean | null | undefined> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return undefined;
      const { data, error } = await db
        .from("org_member_profiles")
        .select("directory_listed")
        .eq("org_id", orgId)
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return undefined;
      return data.directory_listed ?? null;
    },
  });

export async function setMyDirectoryListing(orgId: string, listed: boolean | null) {
  const { error } = await db.rpc("set_my_directory_listing", { _org: orgId, _listed: listed });
  if (error) throw error;
}

/** A directory value as text (the directory returns labels → raw values). */
export function directoryText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}
