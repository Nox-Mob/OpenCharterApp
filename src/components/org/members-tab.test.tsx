import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Org } from "@/lib/orgs";
import { PERMISSIONS } from "@/lib/policy";

// A chainable stand-in for the Supabase query builder: every call returns the builder,
// and awaiting it resolves to the canned result for the table.
const results: Record<string, { data?: unknown; error?: unknown }> = {
  memberships: { error: { code: "PGRST205", message: "Could not find the table" } },
  org_member_profiles: {
    data: [
      {
        id: "p1",
        user_id: "u1",
        display_name: "Morgan Member",
        email: "m@test.org",
        created_at: "2026-01-01",
      },
    ],
  },
  roles: { data: [] },
  role_assignments: { data: [] },
  invitations: { data: [] },
};
const selects: string[] = [];
function builder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ["eq", "order", "limit", "in", "maybeSingle"]) b[m] = () => b;
  b["select"] = (cols: string) => {
    if (table === "org_member_profiles") selects.push(cols);
    return b;
  };
  b["then"] = (ok: (v: unknown) => unknown) => ok({ data: null, error: null, ...results[table] });
  return b;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => builder(t),
    rpc: async () => ({ data: 30, error: null }),
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  },
}));

import { MembersTab } from "./members-tab";

const org: Org = {
  id: "a",
  name: "Chapter A",
  slug: "a",
  type: "chapter",
  parent_id: "nat",
  ancestor_ids: ["nat"],
  timezone: "UTC",
  logo_path: null,
};

describe("MembersTab before migration 0008", () => {
  it("still lists members, without membership columns or actions", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MembersTab
          org={org}
          canInvite={false}
          canAssignAdmin={false}
          canManageMembers
          grants={[{ org_id: "a", permissions: [...PERMISSIONS] }]}
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Morgan Member")).toBeInTheDocument();
    expect(screen.queryByText("Standing")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add member" })).not.toBeInTheDocument();
    // only columns that exist before 0008 were requested
    expect(selects.every((c) => !c.includes("memberships") && !c.includes("source"))).toBe(true);
  });
});
