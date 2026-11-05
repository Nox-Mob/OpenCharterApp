import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Org } from "@/lib/orgs";

const state = vi.hoisted(() => ({ status: "verified" as string | null }));
vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) chain[m] = () => chain;
  chain["maybeSingle"] = async () => ({
    data: state.status ? { gateway: "stripe", status: state.status } : null,
    error: null,
  });
  return { supabase: { from: () => chain } };
});

import { ShareJoinPage } from "./share-join-page";

const org = { id: "o", name: "Austin", slug: "austin" } as Org;
const renderIt = (open?: () => void) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ShareJoinPage org={org} {...(open ? { onOpenPayments: open } : {})} />
    </QueryClientProvider>,
  );

describe("ShareJoinPage (U6)", () => {
  it("shows the join page address with Copy", async () => {
    state.status = "verified";
    renderIt();
    expect(screen.getByLabelText("Join page address")).toHaveValue(
      `${window.location.origin}/join/austin`,
    );
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(/opens once payments are connected/)).toBeNull();
  });

  it("says joining opens once payments are connected", async () => {
    state.status = null;
    renderIt(() => {});
    expect(
      await screen.findByText(/Online joining opens once payments are connected/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect payments" })).toBeInTheDocument();
  });
});
