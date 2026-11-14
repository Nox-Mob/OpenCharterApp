// The home chapter query embeds the member's profile through its real foreign key. It used the
// table's old name (org_member_profiles), which PostgREST rejected with a 400 on every load.
import { describe, expect, it, vi } from "vitest";

const calls: { select?: string; eqs: [string, unknown][] } = { eqs: [] };
vi.mock("@/lib/db/pending-schema", () => {
  const q = {
    select: (s: string) => ((calls.select = s), q),
    eq: (k: string, v: unknown) => (calls.eqs.push([k, v]), q),
    maybeSingle: async () => ({
      data: { id: "m1", home_org_id: "c1", status: "active" },
      error: null,
    }),
  };
  return {
    db: {
      auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
      from: () => q,
    },
  };
});

describe("myHomeChapterQuery", () => {
  it("embeds member_profiles by its foreign key and filters on the signed-in person", async () => {
    const { myHomeChapterQuery } = await import("./home-chapter");
    const fn = myHomeChapterQuery("n1").queryFn as () => Promise<unknown>;
    await expect(fn()).resolves.toEqual({ membershipId: "m1", homeOrgId: "c1" });
    expect(calls.select).toContain("member_profiles!memberships_profile_id_fkey!inner(user_id)");
    expect(calls.select).not.toContain("org_member_profiles");
    expect(calls.eqs).toContainEqual(["member_profiles.user_id", "u1"]);
  });
});
