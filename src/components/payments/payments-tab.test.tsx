import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Org } from "@/lib/orgs";

const results: Record<string, { data?: unknown; error?: unknown }> = {
  gateway_connections: { data: null },
  payments: {
    data: [
      {
        id: "p1",
        created_at: "2026-05-01T00:00:00Z",
        received_on: "2026-05-01",
        purpose: "join",
        amount_minor: 2500,
        refunded_amount_minor: 0,
        currency: "USD",
        status: "paid",
        gateway: "test",
        method: null,
        livemode: false,
        note: "",
        org_member_profiles: { display_name: "Pat", email: "" },
      },
    ],
  },
};
function builder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit", "maybeSingle"]) b[m] = () => b;
  b["then"] = (ok: (v: unknown) => unknown) => ok({ data: null, error: null, ...results[table] });
  return b;
}
const rpc = vi.fn(async () => ({ error: null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => builder(t), rpc: (...a: unknown[]) => rpc(...(a as [])) },
}));
const connectStripe = vi.fn(async () => ({ accountLabel: "Stripe", livemode: true }));
vi.mock("@/modules/payments/payments.functions", () => ({
  connectStripe: (...a: unknown[]) => connectStripe(...(a as [])),
}));
const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: (m: string) => toastError(m) } }));

import { PaymentsTab } from "./payments-tab";

const org = (id: string): Org => ({
  id,
  name: "Austin",
  slug: "a",
  type: "chapter",
  parent_id: null,
  ancestor_ids: [],
  timezone: "UTC",
  logo_path: null,
});
const renderTab = (o: Org) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PaymentsTab org={o} canManage />
    </QueryClientProvider>,
  );

describe("PaymentsTab", () => {
  beforeEach(() => {
    rpc.mockClear();
    connectStripe.mockClear();
    toastError.mockClear();
  });

  it("offers test payments to demo orgs only", async () => {
    const { unmount } = renderTab(org("d1000000-0000-4000-8000-000000000002"));
    expect(
      await screen.findByRole("button", { name: "Use test payments (demo only)" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use test payments (demo only)" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("connect_test_gateway", {
        _org: "d1000000-0000-4000-8000-000000000002",
      }),
    );
    unmount();
    renderTab(org("8d7a1c1e-1b7f-4f3a-9b3e-2f6c2a1d9e01"));
    await screen.findByRole("button", { name: "Connect Stripe" });
    expect(
      screen.queryByRole("button", { name: "Use test payments (demo only)" }),
    ).not.toBeInTheDocument();
  });

  it("checks key formats before calling the server", async () => {
    renderTab(org("8d7a1c1e-1b7f-4f3a-9b3e-2f6c2a1d9e01"));
    fireEvent.change(await screen.findByLabelText("Stripe key"), {
      target: { value: "pk_live_nope" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect Stripe" }));
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining("sk_ or rk_"));
    expect(connectStripe).not.toHaveBeenCalled();
  });

  it("sends valid keys to the server function", async () => {
    renderTab(org("8d7a1c1e-1b7f-4f3a-9b3e-2f6c2a1d9e01"));
    fireEvent.change(await screen.findByLabelText("Stripe key"), {
      target: { value: "rk_test_1234567890abcdef" },
    });
    fireEvent.change(screen.getByLabelText("Webhook signing secret"), {
      target: { value: "whsec_1234567890abcdef" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect Stripe" }));
    await waitFor(() => expect(connectStripe).toHaveBeenCalled());
    expect(connectStripe.mock.calls[0]).toEqual([
      {
        data: {
          orgId: "8d7a1c1e-1b7f-4f3a-9b3e-2f6c2a1d9e01",
          secretKey: "rk_test_1234567890abcdef",
          webhookSecret: "whsec_1234567890abcdef",
        },
      },
    ]);
  });

  it("labels test payments so they're never mistaken for real money", async () => {
    renderTab(org("d1000000-0000-4000-8000-000000000002"));
    expect(await screen.findByText("Pat")).toBeInTheDocument();
    expect(screen.getByText("Test payment")).toBeInTheDocument();
    expect(screen.getByText("Test")).toBeInTheDocument();
  });
});
