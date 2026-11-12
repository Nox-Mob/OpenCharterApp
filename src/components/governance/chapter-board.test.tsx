import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Org } from "@/lib/orgs";

let status: Record<string, unknown> | null = null;
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async (fn: string) =>
      fn === "chapter_board_status"
        ? { data: status ? [status] : [], error: null }
        : { data: null, error: null },
    ),
  },
}));

const { ChapterBoardCard } = await import("./chapter-board");

const chapter: Org = {
  id: "c1",
  name: "Chapter 12",
  slug: "c12",
  type: "chapter",
  parent_id: "nat",
  ancestor_ids: ["nat"],
  timezone: "UTC",
  logo_path: null,
  org_id: "nat",
};

function show(org: Org = chapter) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ChapterBoardCard org={org} />
    </QueryClientProvider>,
  );
}

const base = { request_id: null, status: null, board_org_id: null, note: null, can_request: true };

describe("ChapterBoardCard", () => {
  it("lets a chapter admin ask when the national approves requests", async () => {
    status = { ...base, policy: "approval" };
    show();
    expect(
      await screen.findByRole("button", { name: "Ask to use OpenBoardApp" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Your national approves it first/)).toBeInTheDocument();
  });

  it("shows a pending request with a way to withdraw it", async () => {
    status = { ...base, policy: "approval", status: "pending", request_id: "r1" };
    show();
    expect(await screen.findByRole("button", { name: "Withdraw the request" })).toBeInTheDocument();
  });

  it("links to the chapter's board once it's on", async () => {
    status = { ...base, policy: "approval", status: "approved", board_org_id: "b1" };
    show();
    expect(await screen.findByRole("link", { name: "Open OpenBoardApp" })).toHaveAttribute(
      "href",
      expect.stringContaining("b1"),
    );
  });

  it("says so when the national doesn't offer it", async () => {
    status = { ...base, policy: "off" };
    show();
    expect(await screen.findByText(/doesn't offer OpenBoardApp/)).toBeInTheDocument();
  });

  it("shows nothing for the organization itself", () => {
    status = { ...base, policy: "approval" };
    const { container } = show({ ...chapter, id: "nat", parent_id: null, type: "national" });
    expect(container).toBeEmptyDOMElement();
  });
});
