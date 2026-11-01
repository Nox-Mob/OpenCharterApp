import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Org } from "@/lib/orgs";
import type { MemberRow } from "@/modules/membership/memberships";
import { addDays, today } from "@/modules/membership/standing";
import { termEndDate } from "@/modules/membership/tiers";

const rpc = vi.fn(async (..._args: unknown[]) => ({ data: null, error: null }));
const tierRows = [
  {
    id: "tier1",
    org_id: "a",
    key: "regular",
    name: "Regular",
    description: "",
    tax_treatment: "non_deductible",
    active: true,
    sort_order: 10,
    tier_terms: [
      {
        id: "8d7a1c1e-1b7f-4f3a-9b3e-2f6c2a1d9e01",
        key: "1_year",
        label: "1 year",
        length_count: 1,
        length_unit: "year",
        price_minor: 2500,
        currency: "USD",
        active: true,
        sort_order: 10,
      },
    ],
  },
];
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ in: () => ({ order: async () => ({ data: tierRows, error: null }) }) }),
    }),
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { RecordMembershipDialog } from "./record-membership-dialog";

const org: Org = {
  id: "a",
  name: "Chapter A",
  slug: "a",
  type: "chapter",
  parent_id: "nat",
  ancestor_ids: ["nat"],
  timezone: "UTC",
  logo_path: null,
};
const member = (membership: MemberRow["membership"]): MemberRow => ({
  id: "p1",
  user_id: null,
  display_name: "Pat",
  email: "",
  source: "admin",
  created_at: "2026-01-01",
  membership,
});
const active = (paid_through: string): MemberRow["membership"] => ({
  id: "m1",
  status: "active",
  paid_through,
  lifetime: false,
  joined_on: "2020-01-01",
  tier_id: "tier1",
  term_id: "8d7a1c1e-1b7f-4f3a-9b3e-2f6c2a1d9e01",
  tier_name: "Regular",
  term_label: "1 year",
});

function renderDialog(m: MemberRow, canRecordPayments = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RecordMembershipDialog
        org={org}
        member={m}
        graceDays={30}
        canRecordPayments={canRecordPayments}
        open
        onClose={() => {}}
      />
    </QueryClientProvider>,
  );
}

describe("RecordMembershipDialog", () => {
  beforeEach(() => rpc.mockClear());

  it("stacks an early renewal on the paid-through date", async () => {
    const paidThrough = addDays(today(), 20);
    renderDialog(member(active(paidThrough)));
    const start = addDays(paidThrough, 1);
    expect(await screen.findByTestId("period-preview")).toHaveTextContent(
      `Covers ${start} through ${termEndDate(start, { count: 1, unit: "year" })}. Added on after the current paid-through date.`,
    );
  });

  it("starts a lapsed renewal on the renewal date", async () => {
    renderDialog(member(active(addDays(today(), -90))));
    expect(await screen.findByTestId("period-preview")).toHaveTextContent(
      `Covers ${today()} through`,
    );
    expect(screen.getByTestId("period-preview")).toHaveTextContent("had lapsed");
  });

  it("records a new membership with a cash payment at the term's price", async () => {
    renderDialog(member(null));
    await screen.findByTestId("period-preview");
    fireEvent.click(screen.getByRole("button", { name: "Record membership" }));
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith("record_membership", {
      _profile: "p1",
      _term: "8d7a1c1e-1b7f-4f3a-9b3e-2f6c2a1d9e01",
      _paid_on: today(),
      _amount_minor: 2500,
      _method: "cash",
      _note: "",
    });
  });

  it("lets historical members start earlier", async () => {
    renderDialog(member(null));
    await screen.findByTestId("period-preview");
    fireEvent.change(screen.getByLabelText("Membership started (optional)"), {
      target: { value: "2019-05-01" },
    });
    expect(screen.getByTestId("period-preview")).toHaveTextContent(
      "Covers 2019-05-01 through 2020-04-30",
    );
  });

  it("hides payment fields from people who can't record payments", async () => {
    renderDialog(member(null), false);
    await screen.findByTestId("period-preview");
    expect(screen.queryByLabelText("Record a payment")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Record membership" }));
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(rpc.mock.calls[0]![1]).not.toHaveProperty("_amount_minor");
  });
});
