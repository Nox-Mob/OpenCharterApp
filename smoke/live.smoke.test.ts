/**
 * Live smoke test against STAGING and the suite demo (OpenAppHub db/seed/0002_suite_demo.sql).
 *
 * Signs in to openapphub-staging as the suite's two demo accounts and checks, through the same
 * API the app uses (PostgREST, schema `charter`, security rules on):
 *   - demo@demo.openapphub.org owns Riverside Community Association and sees its members,
 *     dues, receipts and board;
 *   - test@demo.openapphub.org (no organization) sees none of it, and signed-out visitors are
 *     refused (hosted joining needs an account);
 *   - an admin write works and is undone.
 *
 * It writes almost nothing: one member record per run, removed again at the end (it stays in
 * the roster history until the next 12-hourly demo reset). Payments are append-only, so none are
 * recorded here; the database tests cover them. Run: bun run test:smoke
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, count, DEMO, rpc, rpcFails, runId, signIn, type Db } from "./client";

let owner: Db;
let empty: Db;
let anon: Db;
let createdProfile: string | undefined;

beforeAll(async () => {
  [owner, empty] = await Promise.all([signIn(DEMO.owner), signIn(DEMO.empty)]);
  anon = anonClient();
});

afterAll(async () => {
  if (owner && createdProfile) {
    await rpc(owner, "remove_member_record", {
      _profile: createdProfile,
      _reason: `smoke ${runId}`,
    });
  }
});

describe("1. the suite demo is loaded", () => {
  it("both demo accounts sign in with the shared password", async () => {
    for (const db of [owner, empty]) {
      const { data } = await db.auth.getUser();
      expect(data.user?.email).toMatch(/@demo\.openapphub\.org$/);
    }
  });

  it("the join page shows the levels (signed in: hosted joining needs an account)", async () => {
    const info = await rpc<{ org: { id: string; name: string }; levels: { name: string }[] }>(
      empty,
      "public_join_info",
      { _slug: DEMO.slug },
    );
    expect(info.org.id).toBe(DEMO.org);
    expect(info.org.name).toBe("Riverside Community Association");
    expect(info.levels.map((l) => l.name)).toEqual(
      expect.arrayContaining(["Household", "Individual", "Senior (65+)"]),
    );
  });

  it("signed out, hosted Charter refuses the API (joining goes through sign-in)", async () => {
    expect(await rpcFails(anon, "public_join_info", { _slug: DEMO.slug })).toMatch(
      /permission denied/,
    );
  });
});

describe("2. the demo owner sees Riverside", () => {
  it("the association is theirs", async () => {
    const { data, error } = await owner
      .from("units")
      .select("id, name, is_demo")
      .eq("id", DEMO.org);
    expect(error).toBeNull();
    expect(data).toEqual([
      { id: DEMO.org, name: "Riverside Community Association", is_demo: true },
    ]);
  });

  it("about three months of members, dues and receipts", async () => {
    expect(await count(owner, "member_profiles", ["unit_id", DEMO.org])).toBeGreaterThan(100);
    expect(await count(owner, "memberships", ["unit_id", DEMO.org])).toBeGreaterThan(100);
    expect(await count(owner, "payments", ["unit_id", DEMO.org])).toBeGreaterThan(100);
    expect(await count(owner, "receipts", ["unit_id", DEMO.org])).toBeGreaterThan(100);
  });

  it("the overview counts current members", async () => {
    const [stats] = await rpc<{ roster: number; current_members: number }[]>(
      owner,
      "org_overview_stats",
      { _org: DEMO.org },
    );
    expect(stats?.roster).toBeGreaterThan(100);
    expect(stats?.current_members).toBeGreaterThan(50);
  });

  it("the board has its officers", async () => {
    const { data, error } = await owner
      .from("appointments")
      .select("id")
      .eq("unit_id", DEMO.org)
      .is("ended_on", null);
    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThanOrEqual(5);
  });
});

describe("3. an admin write works", () => {
  it("adds a member record without an email", async () => {
    createdProfile = await rpc<string>(owner, "admin_create_member", {
      _org: DEMO.org,
      _display_name: `Smoke Test ${runId}`,
    });
    const { data } = await owner
      .from("member_profiles")
      .select("display_name")
      .eq("id", createdProfile);
    expect(data).toEqual([{ display_name: `Smoke Test ${runId}` }]);
  });

  it("clients can't write payments directly", async () => {
    const { error } = await owner
      .from("payments")
      .insert({ unit_id: DEMO.org, amount_minor: 100, status: "paid" });
    expect(error).not.toBeNull();
  });
});

describe("4. nobody else sees it", () => {
  it("the test account has no organization and sees no Riverside data", async () => {
    expect(await count(empty, "units", ["id", DEMO.org])).toBe(0);
    expect(await count(empty, "member_profiles", ["unit_id", DEMO.org])).toBe(0);
    expect(await count(empty, "payments", ["unit_id", DEMO.org])).toBe(0);
    expect(await count(empty, "receipts", ["unit_id", DEMO.org])).toBe(0);
  });

  it("the test account can't add members to Riverside", async () => {
    await rpcFails(empty, "admin_create_member", { _org: DEMO.org, _display_name: "Not allowed" });
  });

  it("signed-out visitors see no members or payments", async () => {
    for (const table of ["member_profiles", "payments", "receipts"]) {
      const { data } = await anon.from(table).select("id").eq("unit_id", DEMO.org).limit(1);
      expect(data ?? []).toEqual([]);
    }
  });

  it("gateway secrets are never readable through the API", async () => {
    for (const db of [owner, anon]) {
      const { data } = await db.from("gateway_secrets").select("*").limit(1);
      expect(data ?? []).toEqual([]);
    }
  });
});
