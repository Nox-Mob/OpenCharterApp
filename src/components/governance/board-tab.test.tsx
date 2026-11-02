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
  for (const m of ["select", "eq", "order", "in"]) chain[m] = () => chain;
  chain["then"] = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
  const contacts: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "in"]) contacts[m] = () => contacts;
  contacts["then"] = (resolve: (v: unknown) => void) =>
    resolve({ data: [{ template_id: "t1", role_email: "president@a.org" }], error: null });
  return {
    supabase: {
      from: (t: string) => (t === "seat_contacts" ? contacts : chain),
      rpc: vi.fn(async (fn: string) => ({
        data: fn === "org_board" ? board : fn === "board_history" ? history : null,
        error: null,
      })),
    },
  };
});

import { fireEvent } from "@testing-library/react";
import { supabase } from "@/integrations/supabase/client";
import { BoardTab } from "./board-tab";

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

function renderTab(canManage: boolean, contactsReady = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["db-ready", "seat_contacts"], contactsReady);
  return render(
    <QueryClientProvider client={qc}>
      <BoardTab org={chapterA} canManage={canManage} />
    </QueryClientProvider>,
  );
}

describe("BoardTab", () => {
  it("shows seats with this org's title, term and by-law, holders and vacancies", async () => {
    renderTab(true);
    expect(await screen.findByRole("heading", { name: "Commander" })).toBeInTheDocument();
    expect(screen.getByText("(President)")).toBeInTheDocument();
    expect(
      screen.getByText("Term: 2 years (Bylaws Art. IV §2, since 2025-01-01)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Vacant")).toBeInTheDocument();
    expect(screen.getByText(/Required seats with nobody in them: Commander/)).toBeInTheDocument();
    expect(screen.getByText("Morgan")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 filled")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Appoint" })).toHaveLength(2);
    // configuring the board is in Settings → Board (D-185)
    expect(screen.queryByRole("button", { name: "Rename here" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Change term" })).toBeNull();
    expect(await screen.findByText("Pat")).toBeInTheDocument();
  });

  it("is read-only without governance.manage", async () => {
    renderTab(false);
    expect(await screen.findByRole("heading", { name: "Commander" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Appoint" })).toBeNull();
    expect(screen.queryByRole("button", { name: "End term" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Change term" })).toBeNull();
  });

  it("shows each seat's contact, without the controls to change it", async () => {
    renderTab(true, true);
    expect(await screen.findByText("president@a.org")).toBeInTheDocument();
    expect(screen.getByText("(role email)")).toBeInTheDocument();
    expect(screen.getByText("the officer's own email")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Contact email" })).toBeNull();
  });

  it("links to Settings → Board for those who may configure it", async () => {
    const open = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <BoardTab org={chapterA} canManage onOpenSettings={open} />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Change board settings" }));
    expect(open).toHaveBeenCalled();
  });

  it("hides contact controls before migration 0026", async () => {
    renderTab(true, false);
    expect(await screen.findByRole("heading", { name: "Commander" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Contact email" })).toBeNull();
    expect(screen.queryByText(/Contact:/)).toBeNull();
  });
});
