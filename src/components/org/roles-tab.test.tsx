import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PERMISSIONS } from "@/lib/policy";
import type { Org } from "@/lib/orgs";

const roleRows = [
  {
    id: "1",
    org_id: null,
    key: "org_admin",
    name: "Organization admin",
    description: "",
    active: true,
    role_permissions: PERMISSIONS.map((p) => ({ permission_key: p })),
  },
  {
    id: "2",
    org_id: null,
    key: "member",
    name: "Member",
    description: "",
    active: true,
    role_permissions: [],
  },
  {
    id: "3",
    org_id: "nat",
    key: "treasurer",
    name: "Treasurer",
    description: "",
    active: true,
    role_permissions: [{ permission_key: "audit.view" }],
  },
  {
    id: "4",
    org_id: "a",
    key: "secretary",
    name: "Secretary",
    description: "Minutes",
    active: true,
    role_permissions: [{ permission_key: "members.view" }],
  },
  {
    id: "5",
    org_id: "b",
    key: "sibling",
    name: "Sibling role",
    description: "",
    active: true,
    role_permissions: [],
  },
];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ order: async () => ({ data: roleRows, error: null }) }) }),
    rpc: vi.fn(async () => ({ error: null })),
  },
}));

import { RolesTab } from "./roles-tab";

const org = (id: string, name: string, ancestor_ids: string[]): Org => ({
  id,
  name,
  slug: id,
  type: ancestor_ids.length ? "chapter" : "national",
  parent_id: ancestor_ids.at(-1) ?? null,
  ancestor_ids,
  timezone: "UTC",
  logo_path: null,
});
const nat = org("nat", "Nat", []);
const chapterA = org("a", "Chapter A", ["nat"]);

function renderTab(grants: { org_id: string; permissions: string[] }[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RolesTab org={chapterA} orgs={[nat, chapterA]} grants={grants} />
    </QueryClientProvider>,
  );
}

describe("RolesTab", () => {
  it("shows built-in, inherited and own roles, but never a sibling's", async () => {
    renderTab([{ org_id: "a", permissions: [...PERMISSIONS] }]);
    expect(await screen.findByText("Secretary")).toBeInTheDocument();
    expect(screen.getByText("Treasurer")).toBeInTheDocument();
    expect(screen.getByText("From Nat")).toBeInTheDocument();
    expect(screen.queryByText("Sibling role")).not.toBeInTheDocument();
    // only this org's role is editable
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(1);
    const row = screen.getByText("Secretary").closest("tr")!;
    expect(within(row).getByRole("button", { name: "Retire" })).toBeInTheDocument();
  });

  it("only offers permissions the editor holds", async () => {
    renderTab([{ org_id: "a", permissions: ["roles.manage", "members.view"] }]);
    fireEvent.click(await screen.findByRole("button", { name: "Add role" }));
    expect(screen.getByRole("checkbox", { name: "See member profiles" })).not.toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "See the audit log" })).toBeDisabled();
  });
});
