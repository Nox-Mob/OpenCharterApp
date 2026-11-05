import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Org } from "@/lib/orgs";

// A national in the home-chapter model, with one level
vi.mock("@/integrations/supabase/client", () => {
  const tiers = [
    {
      id: "t1",
      org_id: "n",
      key: "regular",
      name: "Regular",
      description: "",
      tax_treatment: "non_deductible",
      active: true,
      sort_order: 0,
      suggested: false,
      source_tier_id: null,
      link_mode: null,
      price_rule: null,
      price_value: null,
      tier_terms: [
        {
          id: "x1",
          key: "1_year",
          label: "1 year",
          length_count: 1,
          length_unit: "year",
          price_minor: 4500,
          currency: "USD",
          active: true,
          sort_order: 0,
        },
      ],
    },
  ];
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "in", "eq", "order"]) chain[m] = () => chain;
  chain["then"] = (ok: (v: unknown) => unknown) => ok({ data: tiers, error: null });
  return {
    supabase: {
      from: () => chain,
      rpc: async (fn: string) => ({
        data: fn === "membership_model" ? "home_chapter" : [],
        error: null,
      }),
    },
  };
});

import { LevelsTab } from "./levels-tab";

const national: Org = {
  id: "n",
  name: "Test-Demo",
  slug: "test-demo",
  type: "national",
  parent_id: null,
  ancestor_ids: [],
  timezone: "UTC",
  logo_path: null,
};

describe("LevelsTab at a home-chapter national", () => {
  it("shows the national's levels even when the home-chapter info is cached from another page", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // the Members page (or another) has already loaded this for the national
    qc.setQueryData(["home-chapter-info", "test-demo"], {
      model: "home_chapter",
      org: { id: "n", name: "Test-Demo", slug: "test-demo", type: "national" },
      national: { id: "n", name: "Test-Demo", slug: "test-demo" },
      at_large_chapter: null,
      chapters: [],
    });
    render(
      <QueryClientProvider client={qc}>
        <LevelsTab org={national} orgs={[national]} canManage />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Regular")).toBeInTheDocument();
    expect(screen.getByText(/1 year · \$45\.00/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add level" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.queryByText(/doesn.t sell memberships of its own/)).toBeNull();
    // chapters have no levels in this model, so nothing to suggest to them
    expect(screen.queryByRole("button", { name: "Suggest to chapters" })).toBeNull();
  });
});
