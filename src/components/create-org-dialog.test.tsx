import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const orgs = [
  {
    id: "22222222-0000-4000-8000-000000000001",
    name: "Nat",
    slug: "nat",
    type: "national",
    parent_id: null,
    ancestor_ids: [],
    timezone: "UTC",
    logo_path: null,
  },
];
const tables: Record<string, unknown[]> = {
  organizations: orgs,
  attribute_definitions: [],
  seat_templates: [
    { id: "s1", key: "president", title: "President", seat_count: 1, sort_order: 10 },
  ],
};
const { rpc } = vi.hoisted(() => ({
  rpc: vi.fn(async (fn: string, _args?: unknown) => ({
    data: fn === "create_organization" ? "new-id" : fn === "create_invitation" ? "tok" : [],
    error: null,
  })),
}));
vi.mock("@/integrations/supabase/client", () => {
  const chain = (rows: unknown[]) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order"]) c[m] = () => c;
    c["then"] = (ok: (v: unknown) => unknown) => ok({ data: rows, error: null });
    return c;
  };
  return {
    supabase: {
      from: (t: string) => chain(tables[t] ?? []),
      rpc,
      auth: { getUser: async () => ({ data: { user: { id: "u" } } }) },
    },
  };
});
vi.mock("@/lib/orgs", async (orig) => ({
  ...(await orig<typeof import("@/lib/orgs")>()),
  myOrgsQuery: () => ({ queryKey: ["my-orgs"], queryFn: async () => orgs }),
  myPermissionsQuery: () => ({ queryKey: ["my-perms"], queryFn: async () => [] }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

import { CreateOrgDialog } from "./create-org-dialog";

describe("chapter creation wizard", () => {
  it("asks for an admin and the required officers, then shows the invitation links", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <CreateOrgDialog
          parentId="22222222-0000-4000-8000-000000000001"
          trigger={<button>Add chapter</button>}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByText("Add chapter"));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Austin" } });
    await screen.findByText(/Step 1 of 3/);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(await screen.findByLabelText(/Who runs it/), {
      target: { value: "pat@example.org" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(await screen.findByLabelText("President"), {
      target: { value: "sam@example.org" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText(/is ready/)).toBeInTheDocument();
    expect(screen.getByText(/show as Vacant/)).toBeInTheDocument();
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("create_invitation", {
        _org: "new-id",
        _email: "sam@example.org",
        _role_key: "member",
      }),
    );
    expect(rpc).toHaveBeenCalledWith("create_invitation", {
      _org: "new-id",
      _email: "pat@example.org",
      _role_key: "org_admin",
    });
    expect(screen.getByLabelText("Invitation for sam@example.org")).toHaveValue(
      `${window.location.origin}/invite/tok`,
    );
  });

  it("refuses a bad admin email before creating anything", async () => {
    rpc.mockClear();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <CreateOrgDialog
          parentId="22222222-0000-4000-8000-000000000001"
          trigger={<button>Add chapter</button>}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByText("Add chapter"));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Dallas" } });
    await screen.findByText(/Step 1 of 3/);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(await screen.findByLabelText(/Who runs it/), { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(rpc).not.toHaveBeenCalledWith("create_organization", expect.anything());
  });
});
