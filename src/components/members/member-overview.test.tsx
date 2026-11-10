import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Org } from "@/lib/orgs";

const in10 = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
const tables: Record<string, unknown> = {
  member_profiles: {
    id: "p1",
    display_name: "Morgan",
    email: "m@test.org",
    memberships: [
      {
        id: "m1",
        status: "active",
        paid_through: in10,
        lifetime: false,
        joined_on: "2020-01-01",
        tier_id: "t",
        term_id: "tt",
        membership_tiers: { name: "Regular" },
        tier_terms: { label: "1 year" },
      },
    ],
  },
  attribute_definitions: [
    {
      id: "f1",
      unit_id: "nat",
      label: "Phone",
      data_type: "text",
      applies_to: "member",
      active: true,
      required: true,
      member_editable: true,
      visibility: "members",
      attribute_options: [],
    },
    {
      id: "f2",
      unit_id: "nat",
      label: "Rank",
      data_type: "text",
      applies_to: "member",
      active: true,
      required: false,
      member_editable: false,
      visibility: "members",
      attribute_options: [],
    },
    {
      id: "f3",
      unit_id: "nat",
      label: "Notes",
      data_type: "text",
      applies_to: "member",
      active: true,
      required: false,
      member_editable: false,
      visibility: "admins",
      attribute_options: [],
    },
  ],
  attribute_values: [{ definition_id: "f2", value: "E-5" }],
  role_assignments: [{ id: "r1", source: "seat", roles: { name: "Treasurer" } }],
};
const board = [
  {
    template_id: "t1",
    owner_org_id: "nat",
    key: "president",
    title: "Commander",
    default_title: "President",
    description: "",
    required: true,
    seat_count: 1,
    scope: "chapters",
    role_id: null,
    term_count: null,
    term_unit: null,
    term_source: "default",
    term_since: null,
    bylaw_reference: "",
    holders: [
      {
        appointment_id: "a1",
        profile_id: "p9",
        display_name: "Casey",
        seat_number: 1,
        starts_on: "2025-01-01",
        planned_end: null,
      },
    ],
  },
  {
    template_id: "t2",
    owner_org_id: "a",
    key: "treasurer",
    title: "Treasurer",
    default_title: "Treasurer",
    description: "",
    required: false,
    seat_count: 1,
    scope: "self",
    role_id: null,
    term_count: null,
    term_unit: null,
    term_source: "default",
    term_since: null,
    bylaw_reference: "",
    holders: [
      {
        appointment_id: "a2",
        profile_id: "p1",
        display_name: "Morgan",
        seat_number: 1,
        starts_on: "2025-02-01",
        planned_end: in10,
      },
    ],
  },
  {
    template_id: "t3",
    owner_org_id: "a",
    key: "secretary",
    title: "Secretary",
    default_title: "Secretary",
    description: "",
    required: false,
    seat_count: 1,
    scope: "self",
    role_id: null,
    term_count: null,
    term_unit: null,
    term_source: "default",
    term_since: null,
    bylaw_reference: "",
    holders: [],
  },
];
function builder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "maybeSingle"]) b[m] = () => b;
  b["then"] = (ok: (v: unknown) => unknown) => ok({ error: null, data: tables[table] });
  return b;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => builder(t),
    rpc: async (fn: string) => {
      if (fn === "org_board") return { data: board, error: null };
      if (fn === "org_board_contacts")
        return {
          data: [
            {
              template_id: "t1",
              title: "Commander",
              sort_order: 1,
              seat_number: 1,
              display_name: "Casey",
              email: "commander@austin.org",
              email_source: "role",
            },
            {
              template_id: "t2",
              title: "Treasurer",
              sort_order: 2,
              seat_number: 1,
              display_name: "Morgan",
              email: "m@test.org",
              email_source: "officer",
            },
            {
              template_id: "t3",
              title: "Secretary",
              sort_order: 3,
              seat_number: null,
              display_name: null,
              email: "secretary@austin.org",
              email_source: "role",
            },
          ],
          error: null,
        };
      if (fn === "grace_days") return { data: 30, error: null };
      if (fn === "lineage_settings")
        return {
          data: [{ unit_id: "nat", key: "contact.email", value: "hq@nat.org", mode: "override" }],
          error: null,
        };
      return { data: null, error: null };
    },
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  },
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="#join">{children}</a>,
}));

import { MemberOverview } from "./member-overview";

const nat = {
  id: "nat",
  name: "Nat",
  slug: "nat",
  type: "national",
  parent_id: null,
  ancestor_ids: [],
} as unknown as Org;
const austin = {
  ...nat,
  id: "a",
  name: "Austin",
  slug: "a",
  type: "chapter",
  parent_id: "nat",
  ancestor_ids: ["nat"],
} as Org;

function renderIt(contactsReady = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["db-ready", "seat_contacts"], contactsReady);
  return render(
    <QueryClientProvider client={qc}>
      <MemberOverview org={austin} orgs={[nat, austin]} />
    </QueryClientProvider>,
  );
}

describe("MemberOverview (D-153)", () => {
  it("lists what needs doing: renewal, missing profile fields, a term ending", async () => {
    renderIt();
    const actions = await screen.findByRole("region", { name: "Actions needed" });
    expect(await within(actions).findByText(/Your membership ends on/)).toBeInTheDocument();
    expect(within(actions).getByText("Complete your profile: Phone.")).toBeInTheDocument();
    expect(await within(actions).findByText(/Your term as Treasurer ends on/)).toBeInTheDocument();
    expect(within(actions).getByRole("link", { name: "Renew" })).toHaveAttribute(
      "href",
      "#my-membership",
    );
  });

  it("shows the profile without admin-only fields, and edits only member-editable ones", async () => {
    renderIt();
    const card = await screen.findByRole("region", { name: "Your profile" });
    expect(await within(card).findByText("E-5")).toBeInTheDocument();
    expect(within(card).getByText("m@test.org")).toBeInTheDocument();
    expect(within(card).queryByText("Notes")).not.toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "Edit" }));
    expect(within(card).getByText("Phone *")).toBeInTheDocument();
    expect(within(card).queryByText("Rank")).not.toBeInTheDocument();
  });

  it("shows my seats and roles, and the board with the contact email", async () => {
    renderIt();
    const roles = await screen.findByRole("region", { name: "Your roles and seats" });
    expect(await within(roles).findByText("Treasurer (from a seat)")).toBeInTheDocument();
    expect(within(roles).getByText(/since 2025-02-01/)).toBeInTheDocument();
    const contact = screen.getByRole("region", { name: "Board and who to contact" });
    expect(await within(contact).findByText("hq@nat.org")).toHaveAttribute(
      "href",
      "mailto:hq@nat.org",
    );
    expect(within(contact).getByText("(Nat)")).toBeInTheDocument();
    expect(within(contact).getByText("Commander")).toBeInTheDocument();
    expect(within(contact).getByText("Casey")).toBeInTheDocument();
    expect(within(contact).queryByText("Secretary")).not.toBeInTheDocument();
  });

  it("shows each seat's role email or the officer's own (D-156)", async () => {
    renderIt(true);
    const contact = await screen.findByRole("region", { name: "Board and who to contact" });
    expect(await within(contact).findByText("commander@austin.org")).toHaveAttribute(
      "href",
      "mailto:commander@austin.org",
    );
    expect(within(contact).getByText("m@test.org")).toBeInTheDocument();
    // a vacant seat with a role email can still be reached
    expect(within(contact).getByText("Vacant")).toBeInTheDocument();
    expect(within(contact).getByText("secretary@austin.org")).toBeInTheDocument();
  });
});
