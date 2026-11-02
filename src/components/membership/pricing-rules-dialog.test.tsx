import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Org } from "@/lib/orgs";

const RANK = "44444444-0000-4000-8000-000000000071";
const defs = [
  {
    id: RANK,
    org_id: "a",
    key: "rank",
    label: "Rank",
    help: "",
    data_type: "ordered",
    required: false,
    visibility: "members",
    member_editable: true,
    show_in_directory: false,
    locked: false,
    sort_order: 0,
    active: true,
    applies_to: "member",
    attribute_options: [
      { value: "E4", label: "E-4", sort_order: 40, active: true },
      { value: "E5", label: "E-5", sort_order: 50, active: true },
    ],
  },
];
const rules = [
  {
    id: "r1",
    term_id: "t1",
    label: "Senior ranks",
    conditions: [{ attribute_id: RANK, op: "at_least", value: "E5" }],
    price_minor: 3000,
    discount_pct: null,
    sort_order: 10,
    active: true,
  },
];
const { rpc } = vi.hoisted(() => ({
  rpc: vi.fn(async (..._a: unknown[]) => ({ data: "r2", error: null })),
}));
vi.mock("@/integrations/supabase/client", () => {
  const chain = (rows: unknown[]) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order"]) c[m] = () => c;
    c["then"] = (ok: (v: unknown) => unknown) => ok({ data: rows, error: null });
    return c;
  };
  return {
    supabase: {
      from: (t: string) =>
        chain(t === "pricing_rules" ? rules : t === "attribute_definitions" ? defs : []),
      rpc,
    },
  };
});

import { PricingRulesDialog } from "./pricing-rules-dialog";

const org: Org = {
  id: "a",
  name: "Chapter A",
  slug: "a",
  type: "chapter",
  parent_id: "n",
  ancestor_ids: ["n"],
  timezone: "UTC",
  logo_path: null,
};
const term = {
  id: "t1",
  key: "1_year",
  label: "1 year",
  length_count: 1,
  length_unit: "year" as const,
  price_minor: 5000,
  currency: "USD",
  sort_order: 0,
  active: true,
};

describe("PricingRulesDialog", () => {
  it("lists rules in plain words and saves a discount rule with every argument", async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <PricingRulesDialog org={org} term={term} levelName="Local" onClose={() => {}} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/Rank is at least E-5/)).toBeInTheDocument();
    expect(screen.getByText("$30.00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add a rule" }));
    fireEvent.change(screen.getByLabelText("Name (optional)"), {
      target: { value: "Everyone else" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    // no amount yet
    expect(rpc).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Price ($)"), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("save_pricing_rule", {
        _term: "t1",
        _rule: null,
        _label: "Everyone else",
        _conditions: [],
        _price_minor: 4500,
        _discount_pct: null,
        _sort_order: 20,
      }),
    );
  });
});
