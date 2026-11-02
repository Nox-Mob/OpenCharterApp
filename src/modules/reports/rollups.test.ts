import { describe, expect, it } from "vitest";
import {
  memberTotals,
  revenueTotals,
  standingShares,
  tableCsv,
  yearToDate,
  type MemberRollup,
} from "./rollups";

const row = (over: Partial<MemberRollup>): MemberRollup => ({
  org_id: "x",
  name: "X",
  type: "chapter",
  parent_id: null,
  depth: 1,
  profiles: 0,
  good: 0,
  grace: 0,
  lapsed: 0,
  pending: 0,
  ended: 0,
  no_membership: 0,
  joined_30d: 0,
  expiring_30: 0,
  expiring_60: 0,
  expiring_90: 0,
  ...over,
});

describe("roll-up helpers", () => {
  it("adds up member counts", () => {
    const t = memberTotals([
      row({ profiles: 3, good: 2, lapsed: 1 }),
      row({ profiles: 2, good: 1, pending: 1 }),
    ]);
    expect([t.profiles, t.good, t.lapsed, t.pending]).toEqual([5, 3, 1, 1]);
  });

  it("never adds amounts across currencies", () => {
    const base = { org_id: "a", name: "A", depth: 1, payments: 1, refunded_minor: 0 };
    expect(
      revenueTotals([
        { ...base, currency: "USD", gross_minor: 2500, net_minor: 2500 },
        { ...base, currency: "USD", gross_minor: 1000, net_minor: 900, refunded_minor: 100 },
        { ...base, currency: "CAD", gross_minor: 700, net_minor: 700 },
      ]),
    ).toEqual([
      { currency: "USD", payments: 2, gross: 3500, refunded: 100, net: 3400 },
      { currency: "CAD", payments: 1, gross: 700, refunded: 0, net: 700 },
    ]);
  });

  it("splits standing into shares, skipping empty segments", () => {
    expect(standingShares(row({ good: 3, lapsed: 1 })).map((s) => [s.key, s.share])).toEqual([
      ["good", 0.75],
      ["lapsed", 0.25],
    ]);
    expect(standingShares(row({}))).toEqual([]);
  });

  it("defaults the revenue range to the year so far", () => {
    expect(yearToDate("2026-11-02")).toEqual({ from: "2026-01-01", to: "2026-11-02" });
  });

  it("writes safe CSV", () => {
    expect(
      tableCsv(
        ["Org", "Net"],
        [
          ["=cmd", 1],
          ["A, Inc", "2.00"],
        ],
      ),
    ).toBe('Org,Net\r\n\'=cmd,1\r\n"A, Inc",2.00\r\n');
  });
});
