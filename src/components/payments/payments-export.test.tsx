import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Org } from "@/lib/orgs";

const { rpc } = vi.hoisted(() => ({
  rpc: vi.fn(async (_fn: string, _args?: unknown) => ({ data: [], error: null })),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

import { PaymentsExport } from "./payments-export";

const nat = {
  id: "n",
  name: "Nat",
  slug: "nat",
  type: "national",
  parent_id: null,
  ancestor_ids: [],
} as unknown as Org;

function renderIt(org: Org, ready = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["db-ready", "payments_export"], ready);
  return render(
    <QueryClientProvider client={qc}>
      <PaymentsExport org={org} />
    </QueryClientProvider>,
  );
}

describe("PaymentsExport", () => {
  beforeEach(() => {
    rpc.mockClear();
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
  });

  it("exports a date range, optionally with every org below", async () => {
    renderIt(nat);
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-06-30" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await vi.waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("export_payments", {
        _org: "n",
        _from: "2026-01-01",
        _to: "2026-06-30",
        _include_below: true,
      }),
    );
  });

  it("has no 'below' option for a chapter, and hides before migration 0029", () => {
    const { unmount } = renderIt({ ...nat, type: "chapter" } as Org);
    expect(screen.queryByRole("checkbox")).toBeNull();
    unmount();
    renderIt(nat, false);
    expect(screen.queryByRole("heading", { name: "Export payments" })).toBeNull();
  });
});
