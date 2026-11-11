import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { rpc, insert } = vi.hoisted(() => ({
  rpc: vi.fn(async (fn: string, _args?: unknown) => ({
    data: fn === "create_organization" ? "nat-id" : fn === "is_platform_operator" ? false : null,
    error: null,
  })),
  insert: vi.fn(async (_row: unknown) => ({ error: null })),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc, from: () => ({ insert: (row: unknown) => insert(row) }) },
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

// Radix Select needs these in jsdom
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};

import { toast } from "sonner";
import { CreateOrgDialog } from "./create-org-dialog";

async function startNational() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <CreateOrgDialog trigger={<button>New org</button>} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByText("New org"));
  fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Signal Assoc" } });
  fireEvent.click(screen.getByRole("combobox", { name: "Type" }));
  fireEvent.click(await screen.findByRole("option", { name: /national/i }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}

describe("creating a national: how membership works (A8, D-166)", () => {
  beforeEach(() => {
    rpc.mockClear();
    insert.mockClear();
  });

  it("compares both models, needs a choice, and saves it with the new organization", async () => {
    await startNational();
    expect(await screen.findByText(/Step 2 of 2: How membership works/)).toBeInTheDocument();
    expect(screen.getAllByText("A good fit if:")).toHaveLength(2);
    expect(screen.getByText(/or an online chapter if there.s none nearby/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(toast.error).toHaveBeenCalledWith("Choose how membership works, or decide later");
    expect(rpc).not.toHaveBeenCalledWith("create_organization", expect.anything());

    fireEvent.click(screen.getByRole("radio", { name: "National membership with a home chapter" }));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(insert).toHaveBeenCalledWith({
        unit_id: "nat-id",
        key: "membership.model",
        value: "home_chapter",
        mode: "locked",
      }),
    );
  });

  it("can decide later: nothing is saved and memberships stay separate", async () => {
    await startNational();
    fireEvent.click(await screen.findByRole("radio", { name: "Decide later" }));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith(
        "create_organization",
        expect.objectContaining({ _type: "national" }),
      ),
    );
    expect(insert).not.toHaveBeenCalled();
  });
});
