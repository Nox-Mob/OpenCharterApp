import { describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({
  rpc: vi.fn(async (..._args: unknown[]) => ({ data: null, error: null })),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

import {
  boardErrorMessage,
  openSeats,
  plannedEnd,
  ruleInForce,
  scopeLabel,
  seatInputSchema,
  seatKey,
  seatTermLabel,
  setSeatContact,
  setSeatScope,
  setSeatTerm,
  updateSeat,
  usedBelow,
  usedByOwner,
  termSummary,
  vacantRequired,
  type Seat,
  type TermRule,
} from "./seats";

const seat = (over: Partial<Seat> = {}): Seat => ({
  template_id: "t1",
  owner_org_id: "n",
  key: "president",
  title: "President",
  default_title: "President",
  description: "",
  required: true,
  seat_count: 1,
  scope: "chapters",
  role_id: null,
  term: { count: 2, unit: "year" },
  term_source: "default",
  term_since: null,
  bylaw_reference: "",
  holders: [],
  ...over,
});

const holder = {
  appointment_id: "a1",
  profile_id: "p1",
  display_name: "Morgan",
  seat_number: 1,
  starts_on: "2024-03-01",
  planned_end: "2026-02-28",
};

describe("seat terms", () => {
  it("labels terms", () => {
    expect(seatTermLabel({ count: 1, unit: "year" })).toBe("1 year");
    expect(seatTermLabel({ count: 18, unit: "month" })).toBe("18 months");
    expect(seatTermLabel(null)).toBe("No fixed term");
  });

  it("summarizes the term in force with its by-law reference", () => {
    expect(termSummary(seat())).toBe("Term: 2 years (suggested default)");
    expect(
      termSummary(
        seat({
          term_source: "org",
          term: { count: 1, unit: "year" },
          term_since: "2026-03-01",
          bylaw_reference: "Bylaws Art. IV §2",
        }),
      ),
    ).toBe("Term: 1 year (Bylaws Art. IV §2, since 2026-03-01)");
    expect(termSummary(seat({ term_source: "org", term: null }))).toBe("Term: No fixed term");
  });

  it("computes the planned end like the database", () => {
    expect(plannedEnd("2024-03-01", { count: 1, unit: "year" })).toBe("2025-02-28");
    expect(plannedEnd("2024-03-01", { count: 2, unit: "year" })).toBe("2026-02-28");
    expect(plannedEnd("2024-01-31", { count: 1, unit: "month" })).toBe("2024-02-29");
    expect(plannedEnd("2024-03-01", null)).toBeNull();
  });

  it("finds the rule in force on a day (by-law history, newest first)", () => {
    const rules: TermRule[] = [
      {
        id: "r2",
        template_id: "t1",
        term: { count: 2, unit: "year" },
        effective_from: "2025-01-01",
        bylaw_reference: "amended",
        note: "",
        created_at: "",
      },
      {
        id: "r1",
        template_id: "t1",
        term: { count: 1, unit: "year" },
        effective_from: "2020-01-01",
        bylaw_reference: "original",
        note: "",
        created_at: "",
      },
    ];
    expect(ruleInForce(rules, "t1", "2024-06-01")?.id).toBe("r1");
    expect(ruleInForce(rules, "t1", "2025-01-01")?.id).toBe("r2");
    expect(ruleInForce(rules, "t1", "2019-01-01")).toBeNull();
    expect(ruleInForce(rules, "t2", "2025-06-01")).toBeNull();
  });
});

describe("vacancies", () => {
  it("counts open seats and flags vacant required seats", () => {
    expect(openSeats(seat({ seat_count: 3, holders: [holder] }))).toBe(2);
    expect(openSeats(seat({ holders: [holder] }))).toBe(0);
    const seats = [
      seat(),
      seat({ template_id: "t2", holders: [holder] }),
      seat({ template_id: "t3", required: false }),
    ];
    expect(vacantRequired(seats).map((s) => s.template_id)).toEqual(["t1"]);
  });
});

describe("seat input", () => {
  it("derives keys from titles", () => {
    expect(seatKey("Vice President")).toBe("vice_president");
    expect(seatKey("2nd Delegate")).toBe("seat_2nd_delegate");
  });

  it("validates seats", () => {
    const ok = {
      title: "Treasurer",
      description: "",
      required: false,
      seat_count: 1,
      term: { count: 1, unit: "year" as const },
      role_id: null,
      scope: "self" as const,
      sort_order: 0,
    };
    expect(seatInputSchema.safeParse(ok).success).toBe(true);
    expect(seatInputSchema.safeParse({ ...ok, title: " " }).success).toBe(false);
    expect(seatInputSchema.safeParse({ ...ok, seat_count: 0 }).success).toBe(false);
    expect(seatInputSchema.safeParse({ ...ok, term: null }).success).toBe(true);
    expect(seatInputSchema.safeParse({ ...ok, scope: "self_and_chapters" }).success).toBe(true);
    expect(seatInputSchema.safeParse({ ...ok, scope: "everyone" }).success).toBe(false);
  });

  it("knows where each scope applies (mirror of seat_applies_at)", () => {
    expect([usedByOwner("self"), usedBelow("self")]).toEqual([true, false]);
    expect([usedByOwner("chapters"), usedBelow("chapters")]).toEqual([false, true]);
    expect([usedByOwner("self_and_chapters"), usedBelow("self_and_chapters")]).toEqual([
      true,
      true,
    ]);
    expect(scopeLabel("self", "Nat")).toBe("Only Nat");
    expect(scopeLabel("chapters", "Nat")).toBe("Every chapter below Nat");
    expect(scopeLabel("self_and_chapters", "Nat")).toBe("Nat and every chapter below it");
  });

  it("explains database errors", () => {
    expect(boardErrorMessage("officers must be members in good standing")).toBe(
      "Officers must be members in good standing",
    );
    expect(
      boardErrorMessage("end the current terms where this seat would no longer be used"),
    ).toMatch(/^End the current terms/);
    expect(boardErrorMessage(`a seat's "used by" can't be changed`)).toMatch(/Board page/);
    expect(boardErrorMessage("boom")).toBe("Couldn't save the change");
  });
});

describe("writes send every argument the SQL function has", () => {
  // update_seat / set_seat_term have no SQL defaults: leaving an argument out makes PostgREST
  // look for a different function and fail, so "no role" / "no fixed term" are sent as null.
  it("update_seat with no role and no fixed term", async () => {
    await updateSeat("t1", {
      title: "Chaplain",
      description: "",
      required: false,
      seat_count: 1,
      term: null,
      role_id: null,
      scope: "self",
      sort_order: 0,
    });
    expect(rpc).toHaveBeenLastCalledWith(
      "update_seat",
      expect.objectContaining({ _term_count: null, _term_unit: null, _role: null }),
    );
  });

  it("set_seat_term with no fixed term", async () => {
    await setSeatTerm("a", "t1", {
      term: null,
      effective_from: "2026-01-01",
      bylaw_reference: "",
      note: "",
    });
    expect(rpc).toHaveBeenLastCalledWith(
      "set_seat_term",
      expect.objectContaining({ _count: null, _unit: null, _effective_from: "2026-01-01" }),
    );
  });

  it("set_seat_scope with a validated scope", async () => {
    await setSeatScope("t1", "self_and_chapters");
    expect(rpc).toHaveBeenLastCalledWith("set_seat_scope", {
      _template: "t1",
      _scope: "self_and_chapters",
    });
    await expect(setSeatScope("t1", "nobody" as never)).rejects.toThrow();
  });

  it("set_seat_contact: a role email (normalised) or null for the officer's own", async () => {
    await setSeatContact("a", "t1", "  President@DemoAustin.XYZ ");
    expect(rpc).toHaveBeenLastCalledWith("set_seat_contact", {
      _org: "a",
      _template: "t1",
      _role_email: "president@demoaustin.xyz",
    });
    await setSeatContact("a", "t1", "");
    expect(rpc).toHaveBeenLastCalledWith("set_seat_contact", {
      _org: "a",
      _template: "t1",
      _role_email: null,
    });
    await expect(setSeatContact("a", "t1", "nope")).rejects.toThrow();
  });
});
