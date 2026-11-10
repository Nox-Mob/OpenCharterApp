import { describe, expect, it } from "vitest";
import { checkMigrations } from "./migration-rules";

const good = `create table charter.widgets (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references charter.units(id) on delete cascade
);
alter table charter.widgets enable row level security;
grant select, insert, update, delete on charter.widgets to authenticated;
create policy "read" on charter.widgets for select to authenticated
  using (charter.is_org_member(auth.uid(), unit_id));`;
const file = (name: string, sql: string) => ({ name, sql });

describe("checkMigrations (db/migrations)", () => {
  it("accepts a table that follows the rules", () => {
    expect(checkMigrations([file("0001_widgets.sql", good)])).toEqual([]);
  });
  it("needs schema charter, a grant (or no-access line) and a policy", () => {
    expect(
      checkMigrations([file("0001_w.sql", good.replaceAll("charter.widgets", "public.widgets"))]),
    ).toEqual([expect.stringContaining("tables go in schema charter")]);
    const noGrant = good.replace(/grant[^;]*;/, "");
    expect(checkMigrations([file("0001_w.sql", noGrant)])).toEqual([
      expect.stringContaining("no grant"),
    ]);
    expect(
      checkMigrations([file("0001_w.sql", noGrant + "\n-- no access: widgets (server only)")]),
    ).toEqual([]);
    expect(
      checkMigrations([file("0001_w.sql", good.replace(/create policy[\s\S]*$/, ""))]),
    ).toEqual([expect.stringContaining("no policies")]);
  });
  it("accepts the catalog loop for row level security", () => {
    const sql = good.replace(
      /alter table charter.widgets enable row level security;/,
      `do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'charter' loop
    execute format('alter table charter.%I enable row level security', t);
  end loop; end $$;`,
    );
    expect(checkMigrations([file("0001_w.sql", sql)])).toEqual([]);
    const none = good.replace(/alter table charter.widgets enable row level security;/, "");
    expect(checkMigrations([file("0001_w.sql", none)])).toEqual([
      expect.stringContaining("row level security"),
    ]);
  });
  it("refuses DROP TABLE / DROP COLUMN and bad numbering", () => {
    expect(checkMigrations([file("0001_d.sql", "drop table charter.x;")])).toEqual([
      expect.stringContaining("DROP TABLE"),
    ]);
    expect(checkMigrations([file("0001_d.sql", "alter table charter.x drop column y;")])).toEqual([
      expect.stringContaining("DROP COLUMN"),
    ]);
    expect(checkMigrations([file("0002_x.sql", "select 1;")])).toEqual([
      expect.stringContaining("expected number 0001"),
    ]);
  });
});
