import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Org } from "@/lib/orgs";
import type { SettingRow } from "@/engines/settings";

const insert = vi.fn(async (_row: unknown) => ({ error: null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ insert: (row: unknown) => insert(row), upsert: async () => ({ error: null }) }),
    rpc: async () => ({
      data: {
        model: "home_chapter",
        org: {},
        national: {},
        at_large_chapter: null,
        chapters: [{ id: "a", name: "Austin", slug: "a" }],
      },
      error: null,
    }),
  },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { MembershipModelCard } from "./membership-model-card";

const nat = {
  id: "n",
  name: "Nat",
  slug: "nat",
  type: "national",
  parent_id: null,
  ancestor_ids: [],
} as unknown as Org;

function renderCard(org: Org, settings: SettingRow[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["db-ready", "home_chapter"], true);
  return render(
    <QueryClientProvider client={qc}>
      <MembershipModelCard org={org} settings={settings} />
    </QueryClientProvider>,
  );
}

describe("MembershipModelCard (A8)", () => {
  it("explains both models and saves the choice once, after a warning", () => {
    window.confirm = vi.fn(() => true);
    renderCard(nat, []);
    expect(screen.getByText("Separate memberships")).toBeInTheDocument();
    expect(screen.getByText(/one membership and one payment/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "National membership with a home chapter" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose this model" }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/can't be changed later/));
    expect(insert).toHaveBeenCalledWith({
      org_id: "n",
      key: "membership.model",
      value: "home_chapter",
      mode: "locked",
    });
  });

  it("once chosen, shows it as fixed with the at-large chapter option", () => {
    renderCard(nat, [
      { org_id: "n", key: "membership.model", value: "home_chapter", mode: "locked" },
    ]);
    expect(screen.getByText("Chosen; can't be changed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Choose this model" })).toBeNull();
    expect(
      screen.getByRole("combobox", { name: "Chapter for members at large" }),
    ).toBeInTheDocument();
  });

  it("is only for a top-level national", () => {
    const { container } = renderCard({ ...nat, type: "chapter", parent_id: "x" } as Org, []);
    expect(container).toBeEmptyDOMElement();
  });
});
