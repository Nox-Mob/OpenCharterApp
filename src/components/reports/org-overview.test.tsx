import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Org } from "@/lib/orgs";

const { rpc } = vi.hoisted(() => ({
  rpc: vi.fn(async (fn: string, _args?: unknown) => {
    if (fn === "org_overview_stats")
      return {
        data: [
          {
            chapters: 4,
            orgs_below: 5,
            roster: 130,
            current_members: 120,
            lifetime_members: 30,
            chapter_memberships: 110,
            pending_members: 2,
            joined_30d: 7,
            expiring_30: 9,
          },
        ],
        error: null,
      };
    if (fn === "org_rollup_revenue")
      return {
        data: [
          {
            unit_id: "n",
            name: "Nat",
            depth: 0,
            currency: "USD",
            payments: 3,
            gross_minor: 9000,
            refunded_minor: 1000,
            net_minor: 8000,
          },
        ],
        error: null,
      };
    if (fn === "org_rollup_governance")
      return {
        data: [
          {
            unit_id: "a",
            name: "A",
            depth: 1,
            required_seats: 2,
            vacant_required: 1,
            vacant_titles: ["President"],
            terms_past_end: 0,
          },
          {
            unit_id: "b",
            name: "B",
            depth: 1,
            required_seats: 2,
            vacant_required: 2,
            vacant_titles: [],
            terms_past_end: 1,
          },
        ],
        error: null,
      };
    return { data: null, error: null };
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

import { OrgOverview } from "./org-overview";

const org = (type: Org["type"]) =>
  ({
    id: "n",
    name: type === "chapter" ? "Austin" : "Nat",
    type,
    slug: "x",
    parent_id: null,
    ancestor_ids: [],
  }) as unknown as Org;

function renderOverview(o: Org, perms = { canSeeRevenue: true, canSeeBoards: true }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["db-ready", "reports"], true);
  return render(
    <QueryClientProvider client={qc}>
      <OrgOverview org={o} {...perms} />
    </QueryClientProvider>,
  );
}

describe("OrgOverview", () => {
  beforeEach(() => rpc.mockClear());

  it("shows a national its roll-up: members, chapters, average, lifetime share", async () => {
    renderOverview(org("national"));
    expect(await screen.findByText("Current members")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("Chapters")).toBeInTheDocument();
    expect(screen.getByText("27.5")).toBeInTheDocument();
    expect(screen.getByText(/90 other current members · 25% lifetime/)).toBeInTheDocument();
    expect(screen.getByText("$80.00")).toBeInTheDocument();
    expect(screen.getByText("Vacant required seats").nextSibling).toHaveTextContent("3");
    expect(screen.getByText(/Nat and every organization below it/)).toBeInTheDocument();
  });

  it("shows a chapter only its own numbers, without chapter tiles", async () => {
    renderOverview(org("chapter"), { canSeeRevenue: false, canSeeBoards: false });
    expect(await screen.findByText("Current members")).toBeInTheDocument();
    expect(screen.queryByText("Chapters")).not.toBeInTheDocument();
    expect(screen.queryByText("Average members per chapter")).not.toBeInTheDocument();
    expect(screen.queryByText("Revenue this year")).not.toBeInTheDocument();
    expect(screen.queryByText("Vacant required seats")).not.toBeInTheDocument();
    expect(screen.getByText(/^Austin, as of today/)).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalledWith("org_rollup_revenue", expect.anything());
  });
});
