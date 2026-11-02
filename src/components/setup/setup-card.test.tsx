import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Org } from "@/lib/orgs";

const connection = {
  gateway: "test",
  status: "verified",
  account_label: "Test payments",
  livemode: false,
};
vi.mock("@/integrations/supabase/client", () => {
  const chain = (row: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "limit", "order"]) c[m] = () => c;
    c["maybeSingle"] = async () => ({ data: row, error: null });
    return c;
  };
  return {
    supabase: {
      from: (t: string) => chain(t === "gateway_connections" ? connection : null),
      rpc: async () => ({ data: [], error: null }),
    },
  };
});
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, search }: { children: React.ReactNode; search?: object }) => (
    <a data-search={JSON.stringify(search ?? {})}>{children}</a>
  ),
}));

import { SetupCards } from "./setup-card";

const org: Org = {
  id: "nat",
  name: "Nat",
  slug: "nat",
  type: "national",
  parent_id: null,
  ancestor_ids: [],
  timezone: "UTC",
  logo_path: null,
};

function renderCards(boardReady: boolean, canManagePayments = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["db-ready", "board_setup"], boardReady);
  return render(
    <QueryClientProvider client={qc}>
      <SetupCards org={org} canManagePayments={canManagePayments} />
    </QueryClientProvider>,
  );
}

describe("SetupCards", () => {
  it("shows a card per flow and the payments card", async () => {
    renderCards(true);
    expect(screen.getByRole("heading", { name: "Membership setup" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Board setup" })).toBeInTheDocument();
    expect(
      await screen.findByText(/Collecting into Test payments \(test mode\)/),
    ).toBeInTheDocument();
    expect(screen.getByText("Payment settings").closest("a")).toHaveAttribute(
      "data-search",
      '{"tab":"payments"}',
    );
    const board = screen.getAllByText("Start setup")[1]!.closest("a");
    expect(board).toHaveAttribute("data-search", '{"flow":"board"}');
  });

  it("hides Board setup until its migration is applied, and payments without permission", () => {
    renderCards(false, false);
    expect(screen.queryByRole("heading", { name: "Board setup" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Connect payments" })).toBeNull();
  });
});
