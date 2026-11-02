import { describe, expect, it } from "vitest";
import { decimalAmount, exportSummary, paymentsCsv, type ExportedPayment } from "./export";

const row = (over: Partial<ExportedPayment> = {}): ExportedPayment => ({
  org_name: "Austin",
  received_on: "2026-03-01",
  member: "Morgan",
  email: "m@test.org",
  purpose: "join",
  level: "Regular",
  term: "1 year",
  amount_minor: 2500,
  refunded_minor: 500,
  net_minor: 2000,
  currency: "USD",
  status: "paid",
  method: "check",
  gateway: "manual",
  test_payment: false,
  reference: "chk-101",
  receipt: "2026-00001",
  tax_treatment: "non_deductible",
  ...over,
});

describe("payments export (A3)", () => {
  it("writes amounts as plain decimals by currency", () => {
    expect(decimalAmount(2500, "USD")).toBe("25.00");
    expect(decimalAmount(1999, "EUR")).toBe("19.99");
    expect(decimalAmount(500, "JPY")).toBe("500");
  });

  it("builds a CSV with a header row and one line per payment", () => {
    const lines = paymentsCsv([
      row(),
      row({ test_payment: true, refunded_minor: 0, net_minor: 2500 }),
    ])
      .trim()
      .split("\r\n");
    expect(lines[0]).toBe(
      "Organization,Date,Member,Email,Purpose,Level,Term,Amount,Refunded,Net,Currency,Status,Method,Gateway,Test payment,Reference,Receipt,Tax treatment",
    );
    expect(lines[1]).toBe(
      "Austin,2026-03-01,Morgan,m@test.org,join,Regular,1 year,25.00,5.00,20.00,USD,paid,check,manual,no,chk-101,2026-00001,non_deductible",
    );
    expect(lines[2]).toContain(",yes,");
  });

  it("neutralises spreadsheet formulas in text", () => {
    const csv = paymentsCsv([row({ member: "=HYPERLINK(1)" })]);
    expect(csv).not.toContain(",=HYPERLINK");
  });

  it("summarises the export per currency", () => {
    expect(exportSummary([row(), row({ net_minor: 1000 })])).toBe("2 payments, net $30.00");
    expect(exportSummary([])).toBe("0 payments");
  });
});
