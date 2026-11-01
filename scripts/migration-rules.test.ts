import { describe, expect, it } from "vitest";
import { checkMigrations } from "./migration-rules";

const good = `create table public.widgets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade
);
grant select, insert, update, delete on public.widgets to authenticated;
alter table public.widgets enable row level security;
create policy "read" on public.widgets for select to authenticated
  using (public.is_org_member(auth.uid(), org_id));`;

const file = (name: string, sql: string) => ({ name, sql });

describe("checkMigrations", () => {
  it("accepts a table that follows the conventions", () => {
    expect(checkMigrations([file("0008_widgets.sql", good)])).toEqual([]);
  });
  it("needs org_id unless the table says it isn't tenant-scoped", () => {
    const noOrg = good.replace(/,\n {2}org_id[^\n]*/, "");
    expect(checkMigrations([file("0008_w.sql", noOrg)])).toEqual([
      expect.stringContaining("needs org_id"),
    ]);
    const optedOut = noOrg.replace(
      "gen_random_uuid()",
      "gen_random_uuid() -- not tenant-scoped: lookup list",
    );
    expect(checkMigrations([file("0008_w.sql", optedOut)])).toEqual([]);
  });
  it("needs all four grants to authenticated, possibly from a later migration", () => {
    const partial = good.replace("select, insert, update, delete", "select, insert");
    expect(checkMigrations([file("0008_w.sql", partial)])[0]).toMatch(/needs grant/);
    expect(
      checkMigrations([
        file("0008_w.sql", partial),
        file("0009_fix.sql", "grant update, delete on public.widgets to authenticated;"),
      ]),
    ).toEqual([]);
    expect(
      checkMigrations([
        file("0008_w.sql", good.replace("to authenticated;", "to service_role;")),
      ])[0],
    ).toMatch(/needs grant/);
  });
  it("needs RLS and a has_permission / is_org_member policy", () => {
    const noRls = good.replace(/alter table[^\n]*\n/, "");
    expect(checkMigrations([file("0008_w.sql", noRls)])[0]).toMatch(/row level security/);
    const badPolicy = good.replace("public.is_org_member(auth.uid(), org_id)", "true");
    expect(checkMigrations([file("0008_w.sql", badPolicy)])[0]).toMatch(/needs a policy/);
  });
  it("rejects DROP TABLE and DROP COLUMN from 0004 on, ignoring comments", () => {
    expect(checkMigrations([file("0008_x.sql", "drop table public.old;")])).toEqual([
      "0008_x.sql: uses DROP TABLE",
    ]);
    expect(checkMigrations([file("0008_x.sql", "alter table public.t drop column c;")])).toEqual([
      "0008_x.sql: uses DROP COLUMN",
    ]);
    expect(checkMigrations([file("0008_x.sql", "-- we never drop table here")])).toEqual([]);
    expect(checkMigrations([file("0002_old.sql", "drop table public.old;")])).toEqual([]);
  });
  it("leaves Lovable's earlier migrations alone", () => {
    expect(checkMigrations([file("0003_old.sql", good.replace(/grant[^\n]*\n/, ""))])).toEqual([]);
  });
});
