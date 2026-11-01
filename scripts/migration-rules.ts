/**
 * Lovable's migration conventions (D-125), checked in CI for the migrations we author:
 * - every tenant table has `org_id uuid not null references public.organizations(id)`
 *   (a table can opt out with a `-- not tenant-scoped: <reason>` comment inside it)
 * - every table grants SELECT, INSERT, UPDATE and DELETE to authenticated
 * - every table enables row-level security and has a policy using has_permission or is_org_member
 * - no DROP TABLE / DROP COLUMN (use additive columns and deprecation comments)
 * Rules apply to tables created from FIRST_CHECKED on; older migrations came from Lovable.
 * Grants and policies may come from any later migration (checks run on the whole set).
 */
export const FIRST_CHECKED = "0004";
/** DROP TABLE / DROP COLUMN were allowed before this migration. */
export const FIRST_NO_DROP = "0004";

export type MigrationFile = { name: string; sql: string };

const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, "");

export function checkMigrations(files: readonly MigrationFile[]): string[] {
  const problems: string[] = [];
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
  const all = sorted
    .map((f) => stripComments(f.sql))
    .join("\n")
    .toLowerCase();

  for (const f of sorted) {
    if (f.name < FIRST_NO_DROP) continue;
    const sql = stripComments(f.sql).toLowerCase();
    if (/\bdrop\s+table\b/.test(sql)) problems.push(`${f.name}: uses DROP TABLE`);
    if (/\bdrop\s+column\b/.test(sql)) problems.push(`${f.name}: uses DROP COLUMN`);
  }

  for (const f of sorted) {
    if (f.name < FIRST_CHECKED) continue;
    const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)\s*\(([\s\S]*?)\n\);/gi;
    for (const m of f.sql.matchAll(re)) {
      const table = m[1]!.toLowerCase();
      const body = m[2]!;
      const where = `${f.name}: public.${table}`;
      if (
        !/--\s*not tenant-scoped/i.test(body) &&
        !/\borg_id\s+uuid\s+not\s+null\s+references\s+public\.organizations\s*\(\s*id\s*\)/i.test(
          stripComments(body),
        )
      )
        problems.push(`${where} needs org_id uuid not null references public.organizations(id)`);
      if (!grantsAll(all, table))
        problems.push(`${where} needs grant select, insert, update, delete ... to authenticated`);
      if (
        !new RegExp(
          `alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`,
        ).test(all)
      )
        problems.push(`${where} needs alter table ... enable row level security`);
      if (!hasPolicy(all, table))
        problems.push(
          `${where} needs a policy using public.has_permission or public.is_org_member`,
        );
    }
  }
  return problems;
}

function grantsAll(all: string, table: string): boolean {
  const re = new RegExp(
    `grant\\s+([a-z,\\s]+?)\\s+on\\s+(?:table\\s+)?public\\.${table}\\s+to\\s+([a-z_,\\s]+);`,
    "g",
  );
  const granted = new Set<string>();
  for (const m of all.matchAll(re)) {
    if (!m[2]!.split(",").some((r) => r.trim() === "authenticated")) continue;
    for (const p of m[1]!.split(",").map((x) => x.trim())) {
      if (p === "all" || p === "all privileges")
        ["select", "insert", "update", "delete"].forEach((x) => granted.add(x));
      else granted.add(p);
    }
  }
  return ["select", "insert", "update", "delete"].every((p) => granted.has(p));
}

function hasPolicy(all: string, table: string): boolean {
  const re = new RegExp(
    `(?:create|alter)\\s+policy\\s+"[^"]*"\\s+on\\s+public\\.${table}\\b([\\s\\S]*?);`,
    "g",
  );
  return [...all.matchAll(re)].some((m) =>
    /public\.(has_permission|is_org_member)\s*\(/.test(m[1]!),
  );
}
