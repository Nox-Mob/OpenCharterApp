/**
 * Migration rules for db/migrations (spec §3.3, §3.4), checked in CI:
 * - file names are NNNN_name.sql, numbered without gaps;
 * - tables are created in schema charter only;
 * - every table has row level security (an explicit ALTER, or the catalog loop that
 *   enables it for every charter table);
 * - every table has a grant to authenticated, or a `-- no access: <tables>` line
 *   (server-only tables such as gateway secrets);
 * - every granted table has at least one policy;
 * - no DROP TABLE or DROP COLUMN (migrations are additive).
 * The runner (scripts/migrate.mjs) refuses a file that changed after it was applied.
 */
export type MigrationFile = { name: string; sql: string };

const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, "");

export function checkMigrations(files: readonly MigrationFile[]): string[] {
  const problems: string[] = [];
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
  sorted.forEach((f, i) => {
    const m = /^(\d{4})_[a-z0-9_]+\.sql$/.exec(f.name);
    if (!m) problems.push(`${f.name}: name must be NNNN_<name>.sql`);
    else if (Number(m[1]) !== i + 1)
      problems.push(`${f.name}: expected number ${String(i + 1).padStart(4, "0")}`);
  });
  const raw = sorted
    .map((f) => f.sql)
    .join("\n")
    .toLowerCase();
  const all = stripComments(raw);
  const noAccess = new Set(
    [...raw.matchAll(/--\s*no access:\s*([a-z0-9_, ]+)/g)].flatMap((m) =>
      m[1]!
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
  const rlsLoop =
    /for \w+ in select tablename from pg_tables where schemaname = 'charter' loop[\s\S]*?enable row level security/.test(
      all,
    );
  for (const f of sorted) {
    const sql = stripComments(f.sql).toLowerCase();
    if (/\bdrop\s+table\b/.test(sql)) problems.push(`${f.name}: uses DROP TABLE`);
    if (/\bdrop\s+column\b/.test(sql)) problems.push(`${f.name}: uses DROP COLUMN`);
    for (const m of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:(\w+)\.)?(\w+)\s*\(/g,
    )) {
      const [schema, table] = [m[1], m[2]!];
      const where = `${f.name}: ${schema ?? "?"}.${table}`;
      if (schema !== "charter") {
        problems.push(`${where}: tables go in schema charter`);
        continue;
      }
      if (
        !rlsLoop &&
        !new RegExp(`alter table (?:only )?charter\\.${table}\\s+enable row level security`).test(
          all,
        )
      )
        problems.push(`${where}: row level security is never enabled`);
      const granted = new RegExp(
        `grant [^;]+ on\\s[^;]*\\bcharter\\.${table}\\b[^;]*\\sto\\s[^;]*authenticated`,
      ).test(all);
      if (!granted && !noAccess.has(table))
        problems.push(`${where}: no grant to authenticated (or a "-- no access" line)`);
      if (granted && !new RegExp(`create policy [^;]*? on charter\\.${table}[\\s;]`).test(all))
        problems.push(`${where}: has no policies (locked for everyone)`);
    }
  }
  return problems;
}
