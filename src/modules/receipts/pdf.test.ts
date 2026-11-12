// @vitest-environment node
import { describe, expect, it } from "vitest";
import { receiptFileName, receiptPdf } from "./pdf";
import type { Receipt } from "./index";

const receipt: Pick<Receipt, "number" | "status" | "snapshot" | "issued_at" | "void_reason"> = {
  number: "2026-00007",
  status: "issued",
  issued_at: "2026-11-12T15:00:00Z",
  void_reason: null,
  snapshot: {
    issuer: {
      unit_id: "u",
      name: "Riverside Community Association",
      legal_name: "Riverside CA Inc.",
      ein: "12-3456789",
      tax_status: "501(c)(3)",
      logo: null,
    },
    payer: { name: "Morgan Lee", email: "morgan@example.org" },
    items: [{ description: "Household membership · 1 year", amount_minor: 4500 }],
    amount_minor: 4500,
    refunded_minor: 0,
    net_minor: 4500,
    currency: "USD",
    received_on: "2026-11-12",
    method: "check",
    livemode: true,
    tax_treatment: "deductible",
    tax_wording: "No goods or services were provided in exchange for this payment.",
    footer: "Thank you for your support.",
    note: "",
  } as Receipt["snapshot"],
};

describe("receipt PDF", () => {
  it("is one Letter page with the receipt's content and nothing of the app", () => {
    const doc = receiptPdf(receipt);
    expect(doc.getNumberOfPages()).toBe(1);
    expect(doc.internal.pageSize.getWidth()).toBe(612);
    const raw = doc.output();
    for (const text of [
      "Receipt 2026-00007",
      "Riverside Community Association",
      "Morgan Lee",
      "Total received",
      "$45.00",
      "Thank you for your support.",
    ])
      expect(raw).toContain(text);
    expect(raw).not.toContain("Switch app");
  });

  it("marks a voided receipt", () => {
    const raw = receiptPdf({ ...receipt, status: "voided", void_reason: "entered twice" }).output();
    expect(raw).toContain("VOID: ENTERED TWICE");
  });

  it("names the file after the organization and number", () => {
    expect(receiptFileName(receipt)).toBe("riverside-community-association-receipt-2026-00007.pdf");
  });
});
