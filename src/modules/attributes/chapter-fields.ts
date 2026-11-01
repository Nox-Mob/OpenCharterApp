import { hasPermission, type Grant, type OrgNode } from "@/lib/policy";

/**
 * Who may set a chapter field's value on a chapter (mirrors public.set_attribute_value):
 * anyone with org.manage on the chapter, and for a locked field (D-121) only admins
 * of the org that defined it.
 */
export function canSetChapterField(
  def: { org_id: string; locked: boolean },
  chapter: OrgNode,
  grants: readonly Grant[],
): boolean {
  if (!chapter.ancestor_ids.includes(def.org_id)) return false;
  if (!hasPermission(grants, "org.manage", chapter)) return false;
  if (!def.locked) return true;
  // The defining org is an ancestor; its own ancestors are the ones above it in the chapter's path.
  const owner: OrgNode = {
    id: def.org_id,
    ancestor_ids: chapter.ancestor_ids.slice(0, chapter.ancestor_ids.indexOf(def.org_id)),
  };
  return hasPermission(grants, "org.manage", owner);
}
