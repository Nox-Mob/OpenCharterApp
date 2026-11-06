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

/** supabase/migrations file names: `<14-digit UTC timestamp>_<legacy tag>.sql` (Phase 0). */
const SUPABASE_NAME = /^(\d{14})_(\d{4}_[a-z0-9_]+)\.sql$/;

/**
 * The single migration history in supabase/migrations (Phase 0, docs/migration/):
 * - every file is `<14-digit timestamp>_<NNNN>_<name>.sql`; timestamps and NNNN numbers are
 *   unique and in the same order
 * - Lovable's conventions above, applied to the names without their timestamp
 * - every table in public, including Lovable's first ones, enables row-level security and has
 *   at least one policy (tables secured inside `foreach ... execute format(...)` loops can't be
 *   seen here: the replay job's catalog check, supabase/ci/post-replay-check.sql, covers them)
 */
export function checkSupabaseMigrations(files: readonly MigrationFile[]): string[] {
  const problems: string[] = [];
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
  const stamps = new Map<string, string>();
  const tags = new Map<string, string>();
  const legacy: MigrationFile[] = [];
  let lastTag = "";
  for (const f of sorted) {
    const m = SUPABASE_NAME.exec(f.name);
    if (!m) {
      problems.push(`${f.name}: name must be <14-digit timestamp>_<NNNN>_<name>.sql`);
      continue;
    }
    const [, stamp, tag] = m as unknown as [string, string, string];
    const num = tag.slice(0, 4);
    if (stamps.has(stamp))
      problems.push(`${f.name}: timestamp ${stamp} also used by ${stamps.get(stamp)}`);
    if (tags.has(num)) problems.push(`${f.name}: number ${num} also used by ${tags.get(num)}`);
    if (num < lastTag) problems.push(`${f.name}: number ${num} is out of order`);
    stamps.set(stamp, f.name);
    tags.set(num, f.name);
    lastTag = num;
    legacy.push({ name: `${tag}.sql`, sql: f.sql });
  }
  problems.push(...checkMigrations(legacy));

  const all = sorted
    .map((f) => stripComments(f.sql))
    .join("\n")
    .toLowerCase();
  const created = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)\s*\(/gi;
  for (const m of all.matchAll(created)) {
    const table = m[1]!;
    if (
      !new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`).test(
        all,
      )
    )
      problems.push(`public.${table}: row-level security is never enabled`);
    if (!new RegExp(`create\\s+policy\\s+"[^"]*"\\s+on\\s+public\\.${table}\\b`).test(all))
      problems.push(`public.${table}: has no policy`);
  }
  return [...new Set(problems)];
}
