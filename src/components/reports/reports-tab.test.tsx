import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Org } from "@/lib/orgs";

const members = [
  {
    org_id: "n",
    name: "Nat",
    type: "national",
    parent_id: null,
    depth: 0,
    profiles: 1,
    good: 0,
    grace: 0,
    lapsed: 0,
    pending: 0,
    ended: 0,
    no_membership: 1,
    joined_30d: 0,
    expiring_30: 0,
    expiring_60: 0,
    expiring_90: 0,
  },
  {
    org_id: "a",
    name: "Chapter A",
    type: "chapter",
    parent_id: "n",
    depth: 1,
    profiles: 4,
    good: 2,
    grace: 1,
    lapsed: 1,
    pending: 0,
    ended: 0,
    no_membership: 0,
    joined_30d: 1,
    expiring_30: 1,
    expiring_60: 2,
    expiring_90: 2,
  },
];
const revenue = [
  {
    org_id: "a",
    name: "Chapter A",
    depth: 1,
    currency: "USD",
    payments: 2,
    gross_minor: 5000,
    refunded_minor: 500,
    net_minor: 4500,
  },
];
const boards = [
  {
    org_id: "a",
    name: "Chapter A",
    depth: 1,
    required_seats: 2,
    vacant_required: 1,
    vacant_titles: ["Treasurer"],
    terms_past_end: 0,
  },
];
const { rpc, model } = vi.hoisted(() => ({ rpc: vi.fn(), model: { value: "separate" } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
rpc.mockImplementation(async (fn: string) => ({
  data:
    fn === "org_rollup_members"
      ? members
      : fn === "org_rollup_revenue"
        ? revenue
        : fn === "org_rollup_governance"
          ? boards
          : fn === "membership_model"
            ? model.value
            : null,
  error: null,
}));

import { ReportsTab } from "./reports-tab";

const nat: Org = {
  id: "n",
  name: "Nat",
  slug: "nat",
  type: "national",
  parent_id: null,
  ancestor_ids: [],
  timezone: "UTC",
  logo_path: null,
};

const renderTab = (
  perms: { members: boolean; revenue: boolean; boards: boolean },
  org: Org = nat,
) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ReportsTab
        org={org}
        canSeeMembers={perms.members}
        canSeeRevenue={perms.revenue}
        canSeeBoards={perms.boards}
      />
    </QueryClientProvider>,
  );

describe("ReportsTab", () => {
  it("shows members by standing with a total, revenue and vacant seats", async () => {
    renderTab({ members: true, revenue: true, boards: true });
    const a = (await screen.findAllByText("Chapter A"))[0]!.closest("tr")!;
    expect(within(a).getByText("1 / 2 / 2")).toBeInTheDocument();
    expect(within(a).getByRole("img", { name: "Chapter A standing" })).toBeInTheDocument();
    expect(within(a).getByTitle("Good standing: 2 (50%)")).toBeInTheDocument();
    // Members counts current memberships (good or grace), not records (D-196): Nat's only
    // record is its admin, without a membership
    expect(within(a).getAllByRole("cell")[2]).toHaveTextContent("3");
    const nat = screen
      .getAllByText("Nat")
      .map((el) => el.closest("tr")!)
      .find(Boolean)!;
    expect(within(nat).getAllByRole("cell")[2]).toHaveTextContent("0");
    const total = screen.getByText("Total").closest("tr")!;
    expect(within(total).getAllByRole("cell")[2]).toHaveTextContent("3");
    expect(screen.getByRole("list", { name: "Legend" })).toHaveTextContent("Grace period");
    expect(await screen.findByText("Total (USD)")).toBeInTheDocument();
    expect(screen.getAllByText("$45.00").length).toBeGreaterThan(0);
    expect(await screen.findByText("Treasurer")).toBeInTheDocument();
  });

  it("counts each member once in the home-chapter model's total (D-196)", async () => {
    model.value = "home_chapter";
    try {
      renderTab({ members: true, revenue: false, boards: false });
      expect(await screen.findByText(/so the total counts them once/)).toBeInTheDocument();
      const total = (await screen.findByText("Total")).closest("tr")!;
      // the national's own row (0 here), not the national plus its chapters
      await vi.waitFor(() => expect(within(total).getAllByRole("cell")[2]).toHaveTextContent("0"));
    } finally {
      model.value = "separate";
    }
  });

  it("shows only the sections you may see", async () => {
    rpc.mockClear();
    renderTab({ members: false, revenue: false, boards: true });
    expect(await screen.findByRole("heading", { name: "Boards" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Members" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Revenue" })).toBeNull();
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["org_rollup_governance"]);
  });

  it("describes a chapter's report as its own chapter only", async () => {
    rpc.mockClear();
    renderTab(
      { members: true, revenue: false, boards: false },
      { ...nat, id: "a", name: "Chapter A", type: "chapter", parent_id: "n" },
    );
    expect(await screen.findByText(/Chapter A, as of today\./)).toBeInTheDocument();
    expect(screen.queryByText(/every organization below it/)).toBeNull();
    expect(rpc).toHaveBeenCalledWith("org_rollup_members", { _org: "a" });
  });
});
