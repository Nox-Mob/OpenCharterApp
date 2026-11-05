import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const term = {
  id: "t1",
  label: "1 year",
  length_count: 1,
  length_unit: "year",
  price_minor: 2500,
  currency: "USD",
};
const joinInfo = (org: { id: string; name: string; slug: string; type: string }) => ({
  org,
  levels_managed_by_parent: org.type === "chapter",
  parent: org.type === "chapter" ? { name: "Nat", slug: "nat" } : null,
  payments_enabled: true,
  gateway: "test",
  livemode: false,
  approval_required: false,
  levels:
    org.type === "chapter" ? [] : [{ id: "l1", name: "Regular", description: "", terms: [term] }],
  fields: [],
});
const national = { id: "n", name: "Nat", slug: "nat" };
const homeInfo = (org: { id: string; name: string; slug: string; type: string }) => ({
  model: "home_chapter",
  org,
  national,
  at_large_chapter: "o",
  chapters: [
    { id: "a", name: "Austin", slug: "austin" },
    { id: "o", name: "Online", slug: "online" },
  ],
});
let current = { id: "n", name: "Nat", slug: "nat", type: "national" };
const rpc = vi.fn(async (fn: string, _args?: unknown) => ({
  data:
    fn === "public_join_info"
      ? joinInfo(current)
      : fn === "public_home_chapter_info"
        ? homeInfo(current)
        : "pay-1",
  error: null,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: unknown) => rpc(fn, args),
    auth: { getSession: async () => ({ data: { session: { access_token: "x" } } }) },
  },
}));
vi.mock("@/modules/payments/payments.functions", () => ({
  startCheckout: async () => ({ url: "https://pay.example/test" }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
    search,
  }: {
    children: React.ReactNode;
    to: string;
    params?: { orgSlug?: string };
    search?: { chapter?: string };
  }) => (
    <a
      href={`${to.replace("$orgSlug", params?.orgSlug ?? "")}${search?.chapter ? `?chapter=${search.chapter}` : ""}`}
    >
      {children}
    </a>
  ),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { JoinForm } from "./join-form";
import { takeRememberedHomeChapter } from "@/modules/membership/home-chapter";

function renderForm(slug: string, chapter?: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["db-ready", "home_chapter"], true);
  qc.setQueryData(["db-ready", "joining"], true);
  return render(
    <QueryClientProvider client={qc}>
      <JoinForm orgSlug={slug} chapter={chapter} />
    </QueryClientProvider>,
  );
}

describe("JoinForm in the home-chapter model (A8)", () => {
  beforeEach(() => {
    Object.defineProperty(window, "location", { value: { assign: vi.fn() }, writable: true });
  });

  it("a chapter's join page sends people to the national with the chapter preselected", async () => {
    current = { id: "a", name: "Austin", slug: "austin", type: "chapter" };
    renderForm("austin");
    expect(
      await screen.findByRole("link", { name: "Join Nat with Austin as your chapter" }),
    ).toHaveAttribute("href", "/join/nat?chapter=a");
    expect(screen.queryByText("Choose your membership")).toBeNull();
  });

  it("the national's join page asks for the chapter and remembers it for after payment", async () => {
    current = { id: "n", name: "Nat", slug: "nat", type: "national" };
    renderForm("nat", "a");
    const picker = await screen.findByRole("combobox", { name: "Your chapter" });
    expect(picker).toHaveTextContent("Austin");
    fireEvent.click(screen.getByRole("button", { name: /Continue to payment/ }));
    await waitFor(() => expect(window.location.assign).toHaveBeenCalled());
    expect(takeRememberedHomeChapter("nat")).toEqual({ chapterId: "a" });
  });

  it("defaults to the at-large chapter when none is preselected", async () => {
    current = { id: "n", name: "Nat", slug: "nat", type: "national" };
    renderForm("nat");
    expect(await screen.findByRole("combobox", { name: "Your chapter" })).toHaveTextContent(
      "Online (members at large)",
    );
  });
});
