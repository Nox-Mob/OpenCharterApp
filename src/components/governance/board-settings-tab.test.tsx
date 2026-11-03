import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Org } from "@/lib/orgs";

const board = [
  {
    template_id: "t1",
    owner_org_id: "nat",
    key: "president",
    title: "Commander",
    default_title: "President",
    description: "Leads the chapter",
    required: true,
    seat_count: 1,
    scope: "chapters",
    role_id: null,
    term_count: 2,
    term_unit: "year",
    term_source: "org",
    term_since: "2025-01-01",
    bylaw_reference: "Bylaws Art. IV §2",
    holders: [],
  },
  {
    template_id: "t2",
    owner_org_id: "a",
    key: "chaplain",
    title: "Chaplain",
    default_title: "Chaplain",
    description: "",
    required: false,
    seat_count: 2,
    scope: "self",
    role_id: null,
    term_count: null,
    term_unit: null,
    term_source: "default",
    term_since: null,
    bylaw_reference: "",
    holders: [
      {
        appointment_id: "ap1",
        profile_id: "p1",
        display_name: "Morgan",
        seat_number: 1,
        starts_on: "2024-03-01",
        planned_end: null,
      },
    ],
  },
];
const history = [
  {
    appointment_id: "ap0",
    template_id: "t1",
    display_name: "Pat",
    seat_number: 1,
    starts_on: "2022-01-01",
    planned_end: "2023-12-31",
    ended_on: "2023-12-31",
    end_reason: "Term over",
  },
];

vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "in", "is"]) chain[m] = () => chain;
  chain["then"] = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
  const contacts: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "in"]) contacts[m] = () => contacts;
  contacts["then"] = (resolve: (v: unknown) => void) =>
    resolve({ data: [{ template_id: "t1", role_email: "president@a.org" }], error: null });
  return {
    supabase: {
      from: (t: string) => (t === "seat_contacts" ? contacts : chain),
      rpc: vi.fn(async (fn: string) => ({
        data:
          fn === "org_board"
            ? board
            : fn === "board_history"
              ? history
              : fn === "org_board_contacts"
                ? [
                    {
                      template_id: "t2",
                      title: "Chaplain",
                      sort_order: 0,
                      seat_number: 1,
                      display_name: "Morgan",
                      email: "morgan@a.org",
                      email_source: "officer",
                    },
                  ]
                : null,
        error: null,
      })),
    },
  };
});

import { fireEvent } from "@testing-library/react";
import { supabase } from "@/integrations/supabase/client";
import { BoardSettingsTab } from "./board-settings-tab";

const chapterA: Org = {
  id: "a",
  name: "Chapter A",
  slug: "a",
  type: "chapter",
  parent_id: "nat",
  ancestor_ids: ["nat"],
  timezone: "UTC",
  logo_path: null,
};

function renderSettings(canManage: boolean, contactsReady = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["db-ready", "seat_contacts"], contactsReady);
  return render(
    <QueryClientProvider client={qc}>
      <BoardSettingsTab
        org={chapterA}
        grants={[]}
        canManage={canManage}
        canDefine={false}
        canManageRules={false}
      />
    </QueryClientProvider>,
  );
}

describe("BoardSettingsTab (D-185)", () => {
  it("lists each seat's term and contact with the configuration buttons", async () => {
    renderSettings(true, true);
    expect(await screen.findByText("Commander")).toBeInTheDocument();
    expect(
      screen.getByText("Term: 2 years (Bylaws Art. IV §2, since 2025-01-01)"),
    ).toBeInTheDocument();
    expect(await screen.findByText("president@a.org")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Change term" })).toHaveLength(2);
    // only an inherited seat can be renamed here
    expect(screen.getAllByRole("button", { name: "Rename here" })).toHaveLength(1);
    // appointing stays on the Board page
    expect(screen.queryByRole("button", { name: "Appoint" })).toBeNull();
  });

  it("shows the officer's email, and switches a seat back to it", async () => {
    renderSettings(true, true);
    expect(await screen.findByText("president@a.org")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Contact email" })[0]!);
    expect(await screen.findByLabelText("Role email")).toHaveValue("president@a.org");
    expect(await screen.findByText("morgan@a.org")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "The officer's sign-in email" }));
    expect(screen.queryByLabelText("Role email")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() =>
      expect(supabase.rpc).toHaveBeenCalledWith("set_seat_contact", {
        _org: "a",
        _template: "t1",
        _role_email: null,
      }),
    );
  });

  it("shows no configuration buttons without governance.manage, and no contact before 0026", async () => {
    renderSettings(false, false);
    expect(await screen.findByText("Commander")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change term" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Contact email" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Contact" })).toBeNull();
  });
});
