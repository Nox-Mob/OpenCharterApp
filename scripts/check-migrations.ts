// Fails CI when a migration breaks the conventions (see scripts/migration-rules.ts, D-125).
// Checks both histories while Lovable still applies drizzle/migrations (legacy, Phase 0):
// supabase/migrations is the single ordered history the new project is built from.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkMigrations, checkSupabaseMigrations } from "./migration-rules";

const root = join(import.meta.dirname, "..");
const read = (dir: string) =>
  readdirSync(dir)
    .filter((n) => n.endsWith(".sql"))
    .map((name) => ({ name, sql: readFileSync(join(dir, name), "utf8") }));

const legacy = read(join(root, "drizzle", "migrations"));
const problems = checkMigrations(legacy).map((p) => `drizzle/migrations/${p}`);
const supabaseDir = join(root, "supabase", "migrations");
const current = existsSync(supabaseDir) ? read(supabaseDir) : [];
problems.push(...checkSupabaseMigrations(current).map((p) => `supabase/migrations: ${p}`));
if (problems.length) {
  console.error(`Migration rules failed:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(
  `Migration rules ok (${legacy.length} legacy files in drizzle/migrations, ${current.length} in supabase/migrations)`,
);
