import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Org } from "@/lib/orgs";

const { rpc, remove, navigate } = vi.hoisted(() => ({
  rpc: vi.fn(async (..._a: unknown[]) => ({ data: ["c", "n"], error: null })),
  remove: vi.fn(async (..._a: unknown[]) => ({ data: [], error: null })),
  navigate: vi.fn(async () => {}),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc,
    storage: {
      from: () => ({
        list: async (dir: string) => ({
          data: dir === "n" ? [{ name: "logo.png" }] : [],
          error: null,
        }),
        remove,
      }),
    },
  },
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));

import { DeleteDemoOrg } from "./delete-demo-org";

const base = { slug: "s", timezone: "UTC", logo_path: null };
const nat: Org = {
  ...base,
  id: "n",
  name: "QA Demo",
  type: "national",
  parent_id: null,
  ancestor_ids: [],
  is_demo: true,
};
const ch: Org = {
  ...base,
  id: "c",
  name: "QA Austin",
  type: "chapter",
  parent_id: "n",
  ancestor_ids: ["n"],
  is_demo: true,
};
const prod: Org = { ...nat, id: "p", name: "Real", is_demo: false };

const renderIt = (org: Org) => {
  const qc = new QueryClient();
  qc.setQueryData(["db-ready", "demo_orgs"], true);
  return render(
    <QueryClientProvider client={qc}>
      <DeleteDemoOrg org={org} orgs={[nat, ch, prod]} />
    </QueryClientProvider>,
  );
};

describe("DeleteDemoOrg", () => {
  it("never shows for production orgs or for a demo chapter", () => {
    const { container, unmount } = renderIt(prod);
    expect(container).toBeEmptyDOMElement();
    unmount();
    expect(renderIt(ch).container).toBeEmptyDOMElement();
  });

  it("deletes the whole tree after the name is typed, removing logos first", async () => {
    renderIt(nat);
    expect(screen.getByText(/and its 1 chapter with all/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete demo organization" }));
    const go = screen.getByRole("button", { name: "Delete for good" });
    expect(go).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Type QA Demo to confirm"), {
      target: { value: "QA Demo" },
    });
    fireEvent.click(go);
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("delete_demo_organization", {
        _org: "n",
        _confirm_name: "QA Demo",
      }),
    );
    expect(remove).toHaveBeenCalledWith(["n/logo.png"]);
    expect(remove.mock.invocationCallOrder[0]!).toBeLessThan(rpc.mock.invocationCallOrder[0]!);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/dashboard" }));
  });
});
