// Fails CI when a migration in db/migrations breaks the rules (scripts/migration-rules.ts).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkMigrations } from "./migration-rules";

const dir = join(import.meta.dirname, "..", "db", "migrations");
const files = readdirSync(dir)
  .filter((n) => n.endsWith(".sql"))
  .map((name) => ({ name, sql: readFileSync(join(dir, name), "utf8") }));
const problems = checkMigrations(files);
if (problems.length) {
  console.error(`Migration rules failed:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`Migration rules ok (${files.length} files in db/migrations)`);
