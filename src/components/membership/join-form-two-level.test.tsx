import { fireEvent, render, screen } from "@testing-library/react";
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
  national_dues: {
    required: true,
    national: { id: "n1", name: "Demo National", slug: "demo-national" },
  },
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
          price_minor: 2500,
          currency: "USD",
        },
      ],
    },
  ],
  fields: [],
};
let state = "none";
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (fn: string) => ({
      data:
        fn === "public_join_info"
          ? info
          : fn === "join_requirements"
            ? {
                national_required: true,
                national: info.national_dues.national,
                national_state: state,
              }
            : null,
      error: null,
    }),
    auth: { getSession: async () => ({ data: { session: { user: { id: "u" } } } }) },
  },
}));
vi.mock("@/modules/payments/payments.functions", () => ({ startCheckout: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    onClick,
  }: {
    children: React.ReactNode;
    params?: { orgSlug?: string };
    onClick?: () => void;
  }) => (
    <a href={`/join/${params?.orgSlug ?? ""}`} onClick={(e) => (e.preventDefault(), onClick?.())}>
      {children}
    </a>
  ),
}));

import { JoinForm } from "./join-form";
import { nextJoin } from "@/modules/membership/joining";

const renderForm = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <JoinForm orgSlug="austin" />
    </QueryClientProvider>,
  );

describe("joining with two-level dues", () => {
  it("sends people who aren't national members to the national first, then back here", async () => {
    state = "none";
    renderForm();
    expect(await screen.findByText("Step 1 of 2: Demo National dues")).toBeInTheDocument();
    expect(screen.queryByText(/Continue to payment/)).toBeNull();
    const link = screen.getByRole("link", { name: "Join Demo National first" });
    expect(link).toHaveAttribute("href", "/join/demo-national");
    fireEvent.click(link);
    expect(nextJoin()).toBe("austin");
  });

  it("is step 2 once the national membership is paid, and says when it's still pending", async () => {
    state = "pending";
    renderForm();
    expect(await screen.findByText("Step 2 of 2: Austin Chapter dues")).toBeInTheDocument();
    expect(screen.getByText(/application is waiting for approval/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Continue to payment \(\$25\.00\)/ }),
    ).toBeInTheDocument();
  });
});
