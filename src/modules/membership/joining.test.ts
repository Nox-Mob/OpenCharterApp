import { describe, expect, it } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import {
  joinAnswers,
  joinBlocker,
  joinErrorMessage,
  joinOutcome,
  type JoinInfo,
  type PaymentProgress,
} from "./joining";

const info = (over: Partial<JoinInfo> = {}): JoinInfo => ({
  org: { id: "o", name: "Austin", slug: "austin", type: "chapter" },
  levels_managed_by_parent: false,
  parent: null,
  payments_enabled: true,
  gateway: "stripe",
  livemode: true,
  approval_required: false,
  levels: [
    {
      id: "l",
      name: "Regular",
      description: "",
      terms: [
        {
          id: "t",
          label: "1 year",
          length_count: 1,
          length_unit: "year",
          price_minor: 2500,
          currency: "USD",
        },
      ],
    },
  ],
  fields: [],
  ...over,
});

describe("joinBlocker", () => {
  it("is open with levels and a payment connection", () => {
    expect(joinBlocker(info())).toBeNull();
  });
  it("explains why joining isn't possible", () => {
    expect(joinBlocker(info({ payments_enabled: false }))).toBe("Online joining isn't open yet.");
    expect(joinBlocker(info({ levels: [] }))).toMatch(/hasn't set up membership levels/);
    expect(
      joinBlocker(info({ levels_managed_by_parent: true, parent: { name: "Nat", slug: "nat" } })),
    ).toMatch(/uses Nat's/);
  });
});

describe("joinAnswers", () => {
  it("keeps only answered fields", () => {
    const fields = [
      { id: "a", label: "A", help: "", data_type: "text" as const, required: true, options: [] },
      {
        id: "b",
        label: "B",
        help: "",
        data_type: "multi_choice" as const,
        required: false,
        options: [],
      },
      {
        id: "c",
        label: "C",
        help: "",
        data_type: "boolean" as const,
        required: false,
        options: [],
      },
    ];
    expect(joinAnswers(fields, { a: "x", b: [], c: false, zzz: "ignored" })).toEqual({
      a: "x",
      c: false,
    });
  });
});

describe("joinOutcome", () => {
  const p = (over: Partial<PaymentProgress>): PaymentProgress => ({
    id: "p",
    status: "pending",
    failure_reason: null,
    purpose: "join",
    amount_minor: 2500,
    currency: "USD",
    gateway: "stripe",
    livemode: true,
    membership_status: null,
    org_name: "Austin",
    org_slug: "austin",
    ...over,
  });
  it("waits until the payment is confirmed", () => {
    expect(joinOutcome(p({}))).toBe("waiting");
    expect(joinOutcome(p({ status: "paid" }))).toBe("waiting");
  });
  it("welcomes, renews or waits for approval", () => {
    expect(joinOutcome(p({ status: "paid", membership_status: "active" }))).toBe("welcome");
    expect(joinOutcome(p({ status: "paid", membership_status: "active", purpose: "renew" }))).toBe(
      "renewed",
    );
    expect(joinOutcome(p({ status: "paid", membership_status: "pending" }))).toBe(
      "awaiting_approval",
    );
  });
  it("reports failures, refunds and missing payments", () => {
    expect(joinOutcome(p({ status: "failed" }))).toBe("failed");
    expect(joinOutcome(p({ status: "refunded" }))).toBe("refunded");
    expect(joinOutcome(null)).toBe("missing");
  });
});

describe("joinErrorMessage", () => {
  it("passes through which field is missing and maps the rest", () => {
    expect(joinErrorMessage("Phone is required")).toBe("Phone is required");
    expect(joinErrorMessage("you're already a member; renew instead")).toMatch(/Renew/);
    expect(joinErrorMessage("boom")).toBe("Something went wrong. Please try again.");
  });
});
