import { queryOptions } from "@tanstack/react-query";
import { db } from "@/lib/db/pending-schema";
import type { Org } from "@/lib/orgs";

/**
 * Demo organizations (D-148): test data that QA can set up from scratch and delete. Only
 * platform operators create them (create_demo_organization); their chapters are demo too. A
 * demo org never sends email (emailsAllowed in src/lib/orgs.ts) and may use the test gateway.
 */
export const isPlatformOperatorQuery = () =>
  queryOptions({
    queryKey: ["platform-operator"],
    staleTime: Infinity,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await db.rpc("is_platform_operator");
      if (error) throw error;
      return data === true;
    },
  });

export async function createDemoOrganization(
  name: string,
  slug: string,
  type: "national" | "standalone",
) {
  const { data, error } = await db.rpc("create_demo_organization", {
    _name: name,
    _slug: slug,
    _type: type,
  });
  if (error) throw error;
  return data as string;
}

/** The org and every org below it (from the orgs this person can see). */
export function demoTree(org: Pick<Org, "id">, orgs: readonly Org[]): Org[] {
  return orgs.filter((o) => o.id === org.id || o.ancestor_ids.includes(org.id));
}

/**
 * Deletes a demo org with its chapters and data. Logo files go first, while the person still
 * has access to the orgs' branding folders; a file that can't be removed doesn't stop it.
 */
export async function deleteDemoOrganization(
  org: Pick<Org, "id" | "name">,
  confirmName: string,
  tree: readonly Pick<Org, "id">[],
) {
  for (const o of tree) {
    try {
      const { data } = await db.storage.from("branding").list(o.id);
      const paths = (data ?? []).map((f) => `${o.id}/${f.name}`);
      if (paths.length) await db.storage.from("branding").remove(paths);
    } catch {
      // an orphaned logo file is harmless; the org's data is what matters
    }
  }
  const { data, error } = await db.rpc("delete_demo_organization", {
    _org: org.id,
    _confirm_name: confirmName,
  });
  if (error) throw error;
  return (data ?? []) as string[];
}

export function demoErrorMessage(message: string): string {
  const known: [string, string][] = [
    ["only platform operators", "Only platform operators can create demo organizations"],
    ["starts at the top", "A demo organization must be a national or standalone organization"],
    ["only demo organizations", "Only demo organizations can be deleted"],
    ["from its top", "Delete the whole demo organization from its national"],
    ["type the organization's name", "Type the organization's name exactly to confirm"],
    ["duplicate", "That web address is taken"],
  ];
  return known.find(([k]) => message.includes(k))?.[1] ?? "Something went wrong. Please try again.";
}
