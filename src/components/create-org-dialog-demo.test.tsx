import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let operator = true;
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
rpc.mockImplementation(async (fn: string) => ({
  data:
    fn === "is_platform_operator"
      ? operator
      : fn === "create_demo_organization"
        ? "demo-id"
        : "prod-id",
  error: null,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

import { CreateOrgDialog } from "./create-org-dialog";

const renderDialog = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["db-ready", "demo_orgs"], true);
  render(
    <QueryClientProvider client={qc}>
      <CreateOrgDialog trigger={<button>New org</button>} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByText("New org"));
};

describe("creating a demo organization", () => {
  it("platform operators can mark a new top-level org as demo", async () => {
    operator = true;
    renderDialog();
    fireEvent.click(await screen.findByRole("checkbox", { name: /This is a demo organization/ }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "QA Demo" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("create_demo_organization", {
        _name: "QA Demo",
        _slug: "qa-demo",
        _type: "standalone",
      }),
    );
    expect(rpc).not.toHaveBeenCalledWith("create_organization", expect.anything());
  });

  it("others don't see the option", async () => {
    operator = false;
    rpc.mockClear();
    renderDialog();
    await waitFor(() => expect(rpc.mock.calls.map((c) => c[0])).toContain("is_platform_operator"));
    expect(screen.queryByRole("checkbox", { name: /demo organization/ })).toBeNull();
  });
});
