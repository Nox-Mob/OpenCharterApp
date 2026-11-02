import { describe, expect, it } from "vitest";

const { selects, results } = vi.hoisted(() => ({
  selects: [] as string[],
  results: [] as { data: unknown; error: unknown }[],
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: (cols: string) => {
        selects.push(cols);
        return { order: async () => results.shift() };
      },
    }),
  },
}));

import { emailsAllowed, isDemoOrg, myOrgsQuery } from "./orgs";

const org = (id: string, ancestor_ids: string[] = [], is_demo?: boolean) => ({
  id,
  ancestor_ids,
  ...(is_demo === undefined ? {} : { is_demo }),
});

describe("demo organizations (D-148)", () => {
  it("uses the flag once it exists", () => {
    expect(isDemoOrg(org("22222222-0000-4000-8000-000000000001", [], true))).toBe(true);
    expect(isDemoOrg(org("d1000000-0000-4000-8000-000000000001", [], false))).toBe(false);
  });
  it("before migration 0022, knows the original demo orgs by their ID prefix", () => {
    expect(isDemoOrg(org("d1000000-0000-4000-8000-000000000002"))).toBe(true);
    expect(isDemoOrg(org("x", ["d1000000-0000-4000-8000-000000000001"]))).toBe(true);
    expect(isDemoOrg(org("22222222-0000-4000-8000-000000000001"))).toBe(false);
  });
  it("demo orgs never send email", () => {
    expect(emailsAllowed(org("a", [], true))).toBe(false);
    expect(emailsAllowed(org("a", [], false))).toBe(true);
  });
  it("reads orgs without is_demo while the column doesn't exist yet", async () => {
    const row = { id: "o", name: "Org" };
    results.push({ data: null, error: { code: "42703" } }, { data: [row], error: null });
    expect(await myOrgsQuery().queryFn!({} as never)).toEqual([row]);
    expect(selects.at(-2)).toContain("is_demo");
    expect(selects.at(-1)).not.toContain("is_demo");
    results.push({ data: [{ ...row, is_demo: true }], error: null });
    expect(await myOrgsQuery().queryFn!({} as never)).toEqual([{ ...row, is_demo: true }]);
  });
});
