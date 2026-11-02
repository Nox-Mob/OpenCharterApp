import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const info = {
  org: {
    id: "8d7a1c1e-1b7f-4f3a-9b3e-2f6c2a1d9e01",
    name: "Austin Chapter",
    slug: "austin",
    type: "chapter",
  },
  levels_managed_by_parent: false,
  parent: null,
  payments_enabled: true,
  gateway: "test",
  livemode: false,
  approval_required: false,
  levels: [
    {
      id: "l1",
      name: "Regular",
      description: "",
      terms: [
        {
          id: "t1",
          label: "1 year",
          length_count: 1,
          length_unit: "year",
          price_minor: 5000,
          currency: "USD",
          has_rules: true,
        },
      ],
    },
  ],
  fields: [],
};
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
rpc.mockImplementation(async (fn: string) => ({
  data: fn === "public_join_info" ? info : fn === "quote_price" ? 3000 : null,
  error: null,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc,
    auth: { getSession: async () => ({ data: { session: { user: { id: "u" } } } }) },
  },
}));
vi.mock("@/modules/payments/payments.functions", () => ({ startCheckout: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

import { JoinForm } from "./join-form";

describe("join form with pricing rules", () => {
  it("says the price can vary and shows the member's own price", async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <JoinForm orgSlug="austin" />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/your price can depend on your answers/)).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Continue to payment ($30.00)" }),
    ).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("quote_price", { _term: "t1", _answers: {} });
  });
});
