import { describe, expect, it } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { memberRecordSchema, membershipErrorMessage, recordMembershipSchema } from "./memberships";

describe("memberRecordSchema", () => {
  it("allows an empty email for admin records and lowercases the rest", () => {
    expect(memberRecordSchema.parse({ display_name: " Pat ", email: "" })).toEqual({
      display_name: "Pat",
      email: "",
    });
    expect(memberRecordSchema.parse({ display_name: "Pat", email: " Pat@X.org " }).email).toBe(
      "pat@x.org",
    );
  });
  it("rejects a missing name or a bad email", () => {
    expect(memberRecordSchema.safeParse({ display_name: " ", email: "" }).success).toBe(false);
    expect(memberRecordSchema.safeParse({ display_name: "P", email: "nope" }).success).toBe(false);
  });
});

describe("recordMembershipSchema", () => {
  const base = {
    term_id: "8d7a1c1e-1b7f-4f3a-9b3e-2f6c2a1d9e01",
    paid_on: "2026-05-01",
    amount_minor: 2500,
    method: "cash" as const,
    note: "",
    starts_on: null,
  };
  it("accepts a payment or none at all", () => {
    expect(recordMembershipSchema.safeParse(base).success).toBe(true);
    expect(
      recordMembershipSchema.safeParse({ ...base, amount_minor: null, method: null }).success,
    ).toBe(true);
  });
  it("needs a term and real dates", () => {
    expect(recordMembershipSchema.safeParse({ ...base, term_id: "" }).success).toBe(false);
    expect(recordMembershipSchema.safeParse({ ...base, paid_on: "May 1" }).success).toBe(false);
    expect(recordMembershipSchema.safeParse({ ...base, amount_minor: -1 }).success).toBe(false);
  });
});

describe("membershipErrorMessage", () => {
  it("maps database errors to friendly text", () => {
    expect(membershipErrorMessage("already a lifetime member")).toBe(
      "This person is already a lifetime member",
    );
    expect(membershipErrorMessage("not allowed to record payments")).toBe(
      "You can record memberships but not payments",
    );
    expect(membershipErrorMessage("boom")).toBe("Couldn't save the membership");
  });
});
