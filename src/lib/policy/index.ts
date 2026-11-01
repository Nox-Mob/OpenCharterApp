import { z } from "zod";

/**
 * Policy layer (E-05). All authorization decisions route through here (client UI hints)
 * and through the database `has_permission` function (authoritative, enforced by RLS).
 * Permissions inherit downward only (D-032): a grant on an org applies to that org
 * and its descendants, never to its ancestors or siblings.
 */

export const PERMISSIONS = [
  "org.view",
  "org.manage",
  "org.create_child",
  "members.view",
  "members.manage",
  "members.invite",
  "roles.manage",
  "audit.view",
  "attributes.manage",
  "setup.run",
  "tiers.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Plain-language names for the role editor. */
export const PERMISSION_LABELS: Record<Permission, string> = {
  "org.view": "See this organization and its chapters",
  "org.manage": "Edit organization details and settings",
  "org.create_child": "Create chapters and regions",
  "members.view": "See member profiles",
  "members.manage": "Edit member details",
  "members.invite": "Invite people",
  "roles.manage": "Manage roles and who holds them",
  "audit.view": "See the audit log",
  "attributes.manage": "Define member and chapter fields",
  "setup.run": "Run guided setup",
  "tiers.manage": "Define membership levels and prices",
};

export type OrgNode = { id: string; ancestor_ids: string[] };
export type Grant = { org_id: string; permissions: readonly string[] };

/** Pure mirror of public.has_permission, used for UI gating and tests. */
export function hasPermission(grants: readonly Grant[], perm: Permission, org: OrgNode): boolean {
  const scope = new Set([org.id, ...org.ancestor_ids]);
  return grants.some((g) => scope.has(g.org_id) && g.permissions.includes(perm));
}

export const ORG_TYPES = ["national", "region", "chapter", "standalone"] as const;
export type OrgType = (typeof ORG_TYPES)[number];

export const createOrgSchema = z
  .object({
    name: z.string().trim().min(2, "At least 2 characters").max(120),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/, "Lowercase letters, numbers and dashes"),
    type: z.enum(ORG_TYPES),
    parentId: z.string().uuid().nullable(),
  })
  .refine((v) => (v.type === "national" || v.type === "standalone") === (v.parentId === null), {
    message: "National and standalone orgs are top-level; regions and chapters need a parent",
    path: ["parentId"],
  });

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}
