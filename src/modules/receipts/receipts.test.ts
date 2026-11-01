import { describe, expect, it } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { receiptErrorMessage, receiptSummary, type Receipt } from "./index";

const receipt = (
  over: Partial<Receipt["snapshot"]> = {},
  status: Receipt["status"] = "issued",
) => ({
  number: "2026-00042",
  status,
  snapshot: {
    issuer: {
      org_id: "o",
      name: "Austin",
      legal_name: "Austin Chapter Inc.",
      ein: "12-3456789",
      tax_status: "501(c)(3)",
      logo: null,
    },
    payer: { name: "Morgan", email: "m@x.org" },
    items: [{ description: "Regular membership · 1 year", amount_minor: 2500 }],
    amount_minor: 2500,
    refunded_minor: 0,
    net_minor: 2500,
    currency: "USD",
    received_on: "2026-05-01",
    method: "check",
    livemode: true,
    tax_treatment: "deductible",
    tax_wording: "No goods or services were provided.",
    footer: "",
    note: "",
    ...over,
  },
});

describe("receiptSummary", () => {
  it("shows what the frozen snapshot holds", () => {
    expect(receiptSummary(receipt())).toEqual({
      title: "Receipt 2026-00042",
      issuer: "Austin Chapter Inc. · EIN 12-3456789 · 501(c)(3)",
      received: "Received 2026-05-01 by Check",
      items: [{ description: "Regular membership · 1 year", amount: "$25.00" }],
      refunded: null,
      total: "$25.00",
      banner: null,
    });
  });
  it("shows partial refunds against the net total", () => {
    const s = receiptSummary(receipt({ refunded_minor: 1000, net_minor: 1500 }));
    expect(s.refunded).toBe("$10.00");
    expect(s.total).toBe("$15.00");
  });
  it("marks void, replaced and test receipts", () => {
    expect(receiptSummary(receipt({}, "voided")).banner).toBe("VOID");
    expect(receiptSummary(receipt({}, "superseded")).banner).toBe("REPLACED");
    const test = receiptSummary(receipt({ livemode: false, method: "test" }));
    expect(test.title).toBe("Test receipt 2026-00042");
    expect(test.banner).toMatch(/no real money/);
    expect(test.received).toBe("Received 2026-05-01 by Test payment");
  });
  it("leaves out a missing EIN", () => {
    expect(
      receiptSummary(receipt({ issuer: { ...receipt().snapshot.issuer, ein: "" } })).issuer,
    ).toBe("Austin Chapter Inc. · 501(c)(3)");
  });
});

describe("receiptErrorMessage", () => {
  it("maps database errors", () => {
    expect(receiptErrorMessage("give a reason")).toBe("Give a reason");
    expect(receiptErrorMessage("only issued receipts can be voided")).toBe(
      "Only the current receipt can be changed",
    );
    expect(receiptErrorMessage("boom")).toBe("Couldn't update the receipt");
  });
});
