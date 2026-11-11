import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Org } from "@/lib/orgs";
import { PERMISSIONS } from "@/lib/policy";

const profile = (id: string, unit_id: string, name: string, email: string) => ({
  id,
  unit_id,
  user_id: `u-${id}`,
  display_name: name,
  email,
  source: "signup",
  created_at: "2026-01-01",
  directory_listed: false,
  memberships: [],
});
const own = [profile("p1", "nat", "Nadia National", "nadia@test.org")];
const everyone = [...own, profile("p2", "a", "Alex Austin", "alex@test.org")];
const rankDef = {
  id: "rank",
  unit_id: "nat",
  label: "Rank",
  data_type: "choice",
  applies_to: "member",
  active: true,
  visibility: "members",
  attribute_options: [{ id: "o1", value: "e5", label: "E-5", sort_order: 1, active: true }],
};

// The list query for several orgs uses .in("unit_id", …); the org's own list uses .eq.
function builder(table: string) {
  const b: Record<string, unknown> = {};
  let tree = false;
  for (const m of ["select", "eq", "is", "order", "limit", "range", "maybeSingle"]) b[m] = () => b;
  b["in"] = () => {
    tree = true;
    return b;
  };
  b["then"] = (ok: (v: unknown) => unknown) =>
    ok({
      error: null,
      data:
        table === "member_profiles"
          ? tree
            ? everyone
            : own
          : table === "attribute_definitions"
            ? [rankDef]
            : table === "attribute_values"
              ? [{ entity_id: "p2", definition_id: "rank", value: "e5" }]
              : [],
    });
  return b;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => builder(t),
    rpc: async () => ({ data: 30, error: null }),
    auth: { getUser: async () => ({ data: { user: { id: "u-p1" } } }) },
  },
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="#org">{children}</a>,
}));

import { MembersTab } from "./members-tab";

const nat: Org = {
  id: "nat",
  name: "Nat",
  slug: "nat",
  type: "national",
  parent_id: null,
  ancestor_ids: [],
  timezone: "UTC",
  logo_path: null,
};
const austin: Org = {
  ...nat,
  id: "a",
  name: "Austin",
  slug: "a",
  type: "chapter",
  parent_id: "nat",
  ancestor_ids: ["nat"],
};
const dallas: Org = { ...austin, id: "d", name: "Dallas", slug: "d" };

function renderTab(org: Org, orgs: Org[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const f of ["memberships", "directory", "exports", "joining"])
    qc.setQueryData(["db-ready", f], true);
  return render(
    <QueryClientProvider client={qc}>
      <MembersTab
        org={org}
        orgs={orgs}
        canInvite={false}
        canAssignAdmin
        canManageMembers
        grants={[{ unit_id: "nat", permissions: [...PERMISSIONS] }]}
      />
    </QueryClientProvider>,
  );
}

describe("MembersTab for a national (D-154)", () => {
  it("lists everyone in the national and its chapters, with their organization and email", async () => {
    renderTab(nat, [nat, austin, dallas]);
    const row = (await screen.findByText("Alex Austin")).closest("tr")!;
    expect(within(row).getByText("Austin")).toBeInTheDocument();
    expect(within(row).getByText("alex@test.org")).toBeInTheDocument();
    // a chapter's member is managed in their chapter; the national's own has Details
    expect(within(row).getByText("Open")).toBeInTheDocument();
    const mine = screen.getByText("Nadia National").closest("tr")!;
    expect(within(mine).getByRole("button", { name: "Details" })).toBeInTheDocument();
    // directory choices don't hide anyone from admins
    expect(screen.getByRole("combobox", { name: "Whose members" })).toHaveTextContent(
      "Everyone in Nat and below (3 organizations)",
    );
    expect(screen.queryByRole("columnheader", { name: "Roles" })).not.toBeInTheDocument();
    // exports work across the tree too, following each org's directory rule (A7)
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeInTheDocument();
  });

  it("a chapter admin gets only their chapter (no scope switch)", async () => {
    renderTab(austin, [nat, austin, dallas]);
    expect(await screen.findByText("Nadia National")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Whose members" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Organization" })).not.toBeInTheDocument();
  });

  it("shows chosen member fields as columns, remembered in the browser (A7)", async () => {
    localStorage.clear();
    renderTab(nat, [nat, austin, dallas]);
    await screen.findByText("Alex Austin");
    fireEvent.click(screen.getByRole("button", { name: "Columns" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Rank" }));
    expect(screen.getByRole("columnheader", { name: "Rank" })).toBeInTheDocument();
    const row = screen.getByText("Alex Austin").closest("tr")!;
    expect(within(row).getByText("E-5")).toBeInTheDocument();
    expect(localStorage.getItem("opencharter.member-columns.nat")).toBe('["rank"]');
  });
});
