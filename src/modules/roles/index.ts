/**
 * Role assignment rules (E-05). Mirrors public.assign_role / public.remove_role
 * so the UI only offers actions the database will accept.
 */
export const ASSIGNABLE_ROLES = [
  { key: "member", name: "Member" },
  { key: "org_admin", name: "Organization admin" },
] as const;
export type RoleKey = (typeof ASSIGNABLE_ROLES)[number]["key"];

export type Assignment = { id: string; user_id: string; org_id: string; role_key: string };

/** A top-level org (no parent) must always keep at least one admin. */
export function canRemove(a: Assignment, all: readonly Assignment[], orgHasParent: boolean): boolean {
  if (a.role_key !== "org_admin" || orgHasParent) return true;
  return all.filter((x) => x.org_id === a.org_id && x.role_key === "org_admin").length > 1;
}

/** Roles a person doesn't already hold at this org. */
export function availableRoles(userId: string, orgId: string, all: readonly Assignment[]) {
  const held = new Set(all.filter((x) => x.user_id === userId && x.org_id === orgId).map((x) => x.role_key));
  return ASSIGNABLE_ROLES.filter((r) => !held.has(r.key));
}
