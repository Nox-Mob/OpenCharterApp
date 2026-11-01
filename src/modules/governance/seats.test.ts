import { describe, expect, it } from "vitest";
import {
  boardErrorMessage,
  openSeats,
  plannedEnd,
  ruleInForce,
  seatInputSchema,
  seatKey,
  seatTermLabel,
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
  });

  it("explains database errors", () => {
    expect(boardErrorMessage("officers must be members in good standing")).toBe(
      "Officers must be members in good standing",
    );
    expect(boardErrorMessage("boom")).toBe("Couldn't save the change");
  });
});
