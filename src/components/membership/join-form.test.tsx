import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  approval_required: true,
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
        {
          id: "t2",
          label: "Lifetime",
          length_count: null,
          length_unit: null,
          price_minor: 30000,
          currency: "USD",
        },
      ],
    },
  ],
  fields: [{ id: "f1", label: "Phone", help: "", data_type: "text", required: true, options: [] }],
};
let session: object | null = null;
const rpc = vi.fn(async (fn: string, _args?: unknown) => ({
  data: fn === "public_join_info" ? info : "pay-1",
  error: null,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: unknown) => rpc(fn, args),
    auth: { getSession: async () => ({ data: { session } }) },
  },
}));
const startCheckout = vi.fn(async () => ({ url: "https://pay.example/test" }));
vi.mock("@/modules/payments/payments.functions", () => ({
  startCheckout: (...a: unknown[]) => startCheckout(...(a as [])),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    search,
  }: {
    children: React.ReactNode;
    to: string;
    search?: { redirect?: string };
  }) => <a href={search?.redirect ? `${to}?redirect=${search.redirect}` : to}>{children}</a>,
}));
const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (m: string) => toastError(m), success: vi.fn() } }));

import { JoinForm } from "./join-form";

const renderForm = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <JoinForm orgSlug="austin" />
    </QueryClientProvider>,
  );

describe("JoinForm", () => {
  beforeEach(() => {
    rpc.mockClear();
    startCheckout.mockClear();
    toastError.mockClear();
    Object.defineProperty(window, "location", { value: { assign: vi.fn() }, writable: true });
  });

  it("shows levels and asks visitors to sign in first, coming back here", async () => {
    session = null;
    renderForm();
    expect(await screen.findByText("Austin Chapter")).toBeInTheDocument();
    expect(screen.getByText("1 year · $25.00")).toBeInTheDocument();
    expect(screen.getByText(/Test payments/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in or create an account" })).toHaveAttribute(
      "href",
      "/auth?redirect=/join/austin",
    );
  });

  it("checks required fields, then starts the join and opens checkout", async () => {
    session = { access_token: "x" };
    renderForm();
    fireEvent.click(await screen.findByLabelText(/Lifetime/));
    fireEvent.click(screen.getByRole("button", { name: "Continue to payment ($300.00)" }));
    expect(toastError).toHaveBeenCalledWith("Phone is required");
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "555-0100" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue to payment ($300.00)" }));
    await waitFor(() =>
      expect(startCheckout).toHaveBeenCalledWith({ data: { paymentId: "pay-1" } }),
    );
    expect(rpc).toHaveBeenCalledWith("begin_join", {
      _org: info.org.id,
      _term: "t2",
      _answers: { f1: "555-0100" },
    });
    expect(window.location.assign).toHaveBeenCalledWith("https://pay.example/test");
    expect(screen.getByText(/you're refunded in full/)).toBeInTheDocument();
  });

  it("explains when joining isn't open", async () => {
    session = null;
    rpc.mockImplementationOnce(async () => ({
      data: { ...info, payments_enabled: false },
      error: null,
    }));
    renderForm();
    expect(await screen.findByText("Online joining isn't open yet.")).toBeInTheDocument();
  });
});
