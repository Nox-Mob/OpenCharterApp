import { describe, expect, it } from "vitest";
import {
  addDays,
  daysToExpiration,
  expirationLabel,
  inGoodStanding,
  renewalStart,
  standing,
  today,
  type MembershipState,
} from "./standing";

const active = (paid_through: string): MembershipState => ({
  status: "active",
  paid_through,
  lifetime: false,
});
const lifetime: MembershipState = { status: "active", paid_through: null, lifetime: true };

describe("standing (same cases as public.membership_standing)", () => {
  it("is good through the paid-through day, then grace, then lapsed", () => {
    expect(standing(active("2026-05-31"), 30, "2026-05-31")).toBe("good");
    expect(standing(active("2026-05-31"), 30, "2026-06-30")).toBe("grace");
    expect(standing(active("2026-05-31"), 30, "2026-07-01")).toBe("lapsed");
    expect(standing(active("2026-05-31"), 0, "2026-06-01")).toBe("lapsed");
  });
  it("lifetime is always good; other statuses pass through", () => {
    expect(standing(lifetime, 30, "2099-01-01")).toBe("good");
    expect(standing({ ...active("2026-01-01"), status: "pending" }, 30, "2026-01-01")).toBe(
      "pending",
    );
    expect(standing({ ...active("2026-01-01"), status: "cancelled" }, 30, "2025-01-01")).toBe(
      "cancelled",
    );
    expect(standing(null, 30, "2026-01-01")).toBe("none");
  });
  it("good standing includes grace", () => {
    expect(inGoodStanding("good")).toBe(true);
    expect(inGoodStanding("grace")).toBe(true);
    expect(inGoodStanding("lapsed")).toBe(false);
    expect(inGoodStanding("pending")).toBe(false);
  });
});

describe("renewalStart (same cases as public.renewal_start)", () => {
  it("stacks early and grace renewals on paid-through", () => {
    expect(renewalStart(active("2026-05-31"), 30, "2026-04-01")).toBe("2026-06-01");
    expect(renewalStart(active("2026-05-31"), 30, "2026-06-20")).toBe("2026-06-01");
  });
  it("restarts lapsed, cancelled and new members today", () => {
    expect(renewalStart(active("2026-05-31"), 30, "2026-07-15")).toBe("2026-07-15");
    expect(renewalStart({ ...active("2026-05-31"), status: "cancelled" }, 30, "2026-04-01")).toBe(
      "2026-04-01",
    );
    expect(renewalStart(null, 30, "2026-04-01")).toBe("2026-04-01");
  });
});

describe("expiration", () => {
  it("counts days to paid-through", () => {
    expect(daysToExpiration(active("2026-05-31"), "2026-05-01")).toBe(30);
    expect(daysToExpiration(active("2026-05-31"), "2026-06-03")).toBe(-3);
    expect(daysToExpiration(lifetime, "2026-05-01")).toBeNull();
  });
  it("describes it in words", () => {
    expect(expirationLabel(active("2026-05-31"), "2026-05-30")).toBe("Expires in 1 day");
    expect(expirationLabel(active("2026-05-31"), "2026-05-31")).toBe("Expires today");
    expect(expirationLabel(active("2026-05-31"), "2026-06-02")).toBe("Expired 2 days ago");
    expect(expirationLabel(lifetime, "2026-05-31")).toBe("Lifetime");
    expect(expirationLabel(null, "2026-05-31")).toBe("—");
  });
  it("does calendar math across months and years", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(today(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
