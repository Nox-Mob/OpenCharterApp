import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Org } from "@/lib/orgs";

const board = [
  {
    template_id: "t1",
    owner_org_id: "nat",
    key: "president",
    title: "President",
    default_title: "President",
    description: "",
    required: true,
    seat_count: 1,
    scope: "chapters",
    role_id: null,
    term_count: 2,
    term_unit: "year",
    term_source: "default",
    term_since: null,
    bylaw_reference: "",
    holders: [],
  },
];
vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "in", "update", "insert"]) chain[m] = () => chain;
  chain["maybeSingle"] = async () => ({ data: null, error: null });
  chain["then"] = (ok: (v: unknown) => unknown) => ok({ data: [], error: null });
  return {
    supabase: {
      from: () => chain,
      rpc: async (fn: string) => ({ data: fn === "org_board" ? board : [], error: null }),
      auth: { getUser: async () => ({ data: { user: { id: "u" } } }) },
    },
  };
});
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => () => {},
}));

import { BoardSetup } from "./board-setup";

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

describe("BoardSetup", () => {
  it("walks a chapter through its seats, rules and its own terms", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <BoardSetup org={chapterA} />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("heading", { name: "Officer seats" })).toBeInTheDocument();
    // a chapter's seats are its own: no "used by" choice
    fireEvent.click(screen.getByRole("checkbox", { name: "Treasurer" }));
    expect(screen.getByDisplayValue("Treasurer")).toBeInTheDocument();
    expect(screen.queryByLabelText("Treasurer used by")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(await screen.findByRole("heading", { name: "Officer rules" })).toBeInTheDocument();
    expect(screen.queryByText("May chapters add their own seats?")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(
      await screen.findByRole("heading", { name: "Terms from your by-laws" }),
    ).toBeInTheDocument();
    // the national's seat (inherited) and the chapter's own seat both get a term choice
    expect(screen.getByText("Uses the suggested term (2 years).")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "President: set our own term" }));
    expect(screen.getByLabelText("By-law reference")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Treasurer: set our own term" }),
    ).toBeInTheDocument();
  });
});
