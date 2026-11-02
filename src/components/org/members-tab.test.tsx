import { fireEvent, render, screen } from "@testing-library/react";
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
      {
        id: "p2",
        user_id: "u2",
        display_name: "Pat Person",
        email: "pat@test.org",
        created_at: "2026-01-02",
      },
    ],
  },
  roles: { data: [] },
  member_segments: { error: { code: "PGRST205", message: "Could not find the table" } },
  attribute_definitions: { data: [] },
  attribute_values: { data: [] },
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
    // 0008 is applied on Lovable's database; simulate an install where it isn't.
    for (const f of ["memberships", "directory", "exports", "joining"])
      qc.setQueryData(["db-ready", f], false);
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
    // search works before any new migration; export waits for 0011 (audited exports)
    expect(screen.getByText("Showing 2 of 2")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search members"), { target: { value: "pat" } });
    expect(screen.queryByText("Morgan Member")).not.toBeInTheDocument();
    expect(screen.getByText("Pat Person")).toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 2")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export CSV" })).not.toBeInTheDocument();
    // only columns that exist before 0008 were requested
    expect(selects.every((c) => !c.includes("memberships") && !c.includes("source"))).toBe(true);
  });
});
