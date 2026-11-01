import { z } from "zod";
import {
  hasPermission,
  PERMISSIONS,
  type Grant,
  type OrgNode,
  type Permission,
} from "@/lib/policy";

/**
 * Roles (E-05). Mirrors public.create_role / update_role / assign_role /
 * remove_role so the UI only offers actions the database will accept.
 * Platform roles have org_id null and can't be edited. Org roles apply to the
 * org that defined them and its descendants (D-032).
 */
export const PLATFORM_ROLE_KEYS = ["org_admin", "member"] as const;

export type Role = {
  id: string;
  org_id: string | null;
  key: string;
  name: string;
  description: string;
  active: boolean;
  permissions: string[];
};

export type Assignment = { id: string; user_id: string; org_id: string; role_key: string };

/** A top-level org (no parent) must always keep at least one admin. */
export function canRemove(
  a: Assignment,
  all: readonly Assignment[],
  orgHasParent: boolean,
): boolean {
  if (a.role_key !== "org_admin" || orgHasParent) return true;
  return all.filter((x) => x.org_id === a.org_id && x.role_key === "org_admin").length > 1;
}

/** Active roles usable at an org: platform roles first, then ancestors' and its own. */
export function rolesForOrg(roles: readonly Role[], org: OrgNode): Role[] {
  const lineage = [...org.ancestor_ids, org.id];
  const rank = (r: Role) => (r.org_id === null ? -1 : lineage.indexOf(r.org_id));
  return roles
    .filter((r) => r.active && (r.org_id === null || lineage.includes(r.org_id)))
    .sort((x, y) => rank(x) - rank(y) || x.name.localeCompare(y.name));
}

/** True when the signed-in person holds every permission of the role at this org. */
export function canGrantRole(
  role: Pick<Role, "permissions">,
  grants: readonly Grant[],
  org: OrgNode,
) {
  return role.permissions.every(
    (p) =>
      (PERMISSIONS as readonly string[]).includes(p) && hasPermission(grants, p as Permission, org),
  );
}

/** Roles a person doesn't already hold here and that the assigner may grant. */
export function availableRoles(
  userId: string,
  orgId: string,
  all: readonly Assignment[],
  usable: readonly Role[],
  grants: readonly Grant[],
  org: OrgNode,
): Role[] {
  const held = new Set(
    all.filter((x) => x.user_id === userId && x.org_id === orgId).map((x) => x.role_key),
  );
  return usable.filter((r) => !held.has(r.key) && canGrantRole(r, grants, org));
}

/** Permissions the signed-in person may put into a role at this org. */
export function grantablePermissions(grants: readonly Grant[], org: OrgNode): Permission[] {
  return PERMISSIONS.filter((p) => hasPermission(grants, p, org));
}

/** Permissions being added by an edit (only these need to be held; removing is always fine). */
export function addedPermissions(before: readonly string[], after: readonly string[]): string[] {
  const had = new Set(before);
  return after.filter((p) => !had.has(p));
}

export function roleKey(name: string): string {
  const k = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return /^[a-z]/.test(k) ? k : `r_${k}`.slice(0, 40);
}

export const roleInputSchema = z.object({
  name: z.string().trim().min(1, "Give the role a name").max(60, "At most 60 characters"),
  description: z.string().trim().max(300, "At most 300 characters"),
  permissions: z
    .array(z.enum(PERMISSIONS))
    .min(1, "Pick at least one permission")
    .refine((p) => new Set(p).size === p.length, "Duplicate permission"),
});
export type RoleInput = z.infer<typeof roleInputSchema>;

/** Checks run before calling create_role, matching the database rules. */
export function validateNewRole(input: RoleInput, existingKeys: readonly string[]): string | null {
  const key = roleKey(input.name);
  if ((PLATFORM_ROLE_KEYS as readonly string[]).includes(key)) return "That role name is reserved";
  if (existingKeys.includes(key)) return "A role with that name already exists";
  return null;
}

/** Friendly text for errors raised by the role RPCs. */
export function roleErrorMessage(message: string): string {
  if (message.includes("already exists")) return "A role with that name already exists";
  if (message.includes("reserved")) return "That role name is reserved";
  if (message.includes("permissions you hold")) return "You can only grant permissions you hold";
  if (message.includes("remove this role"))
    return "Remove this role from everyone before retiring it";
  if (message.includes("pending invitations"))
    return "Revoke pending invitations for this role before retiring it";
  if (message.includes("at least one admin")) return "An organization must keep at least one admin";
  return "Couldn't save the role";
}
