import { describe, expect, it } from "vitest";
import type { MemberRow } from "@/modules/membership/memberships";
import type { Seat } from "@/modules/governance/seats";
import {
  formatFieldValue,
  memberActions,
  missingRequiredFields,
  mySeats,
  officers,
} from "./my-overview";

const membership = (over: Partial<NonNullable<MemberRow["membership"]>> = {}) => ({
  id: "m1",
  status: "active" as const,
  paid_through: "2026-12-31",
  lifetime: false,
  joined_on: "2020-01-01",
  tier_id: "t",
  term_id: "tt",
  tier_name: "Regular",
  term_label: "1 year",
  ...over,
});
const base = {
  hasProfile: true,
  graceDays: 30,
  on: "2026-11-02",
  missingRequired: [] as string[],
  seats: [],
};
const keys = (a: { key: string }[]) => a.map((x) => x.key);

describe("member actions", () => {
  it("nothing to do for a member in good standing far from renewal", () => {
    expect(
      memberActions({ ...base, membership: membership({ paid_through: "2027-06-30" }) }),
    ).toEqual([]);
    expect(
      memberActions({ ...base, membership: membership({ lifetime: true, paid_through: null }) }),
    ).toEqual([]);
  });

  it("renew soon within 30 days, with the date", () => {
    const [a] = memberActions({ ...base, membership: membership({ paid_through: "2026-11-20" }) });
    expect(a).toMatchObject({ key: "renew", tone: "soon", cta: "renew" });
    expect(a!.text).toContain("2026-11-20 (in 18 days)");
    expect(
      memberActions({ ...base, membership: membership({ paid_through: "2026-12-03" }) }),
    ).toEqual([]);
  });

  it("grace and lapsed are urgent; grace says the last day", () => {
    const [g] = memberActions({ ...base, membership: membership({ paid_through: "2026-10-20" }) });
    expect(g).toMatchObject({ key: "grace", tone: "urgent" });
    expect(g!.text).toContain("Renew by 2026-11-19");
    expect(
      keys(memberActions({ ...base, membership: membership({ paid_through: "2026-01-01" }) })),
    ).toEqual(["lapsed"]);
  });

  it("no membership, pending and ended", () => {
    expect(memberActions({ ...base, membership: null })[0]).toMatchObject({
      key: "join",
      cta: "join",
    });
    expect(keys(memberActions({ ...base, membership: membership({ status: "pending" }) }))).toEqual(
      ["pending"],
    );
    expect(
      keys(memberActions({ ...base, membership: membership({ status: "cancelled" }) })),
    ).toEqual(["rejoin"]);
    expect(memberActions({ ...base, hasProfile: false, membership: null })).toEqual([]);
  });

  it("profile and seat reminders, most urgent first", () => {
    const actions = memberActions({
      ...base,
      membership: membership({ paid_through: "2026-01-01" }),
      missingRequired: ["Phone", "Rank"],
      seats: [
        {
          title: "President",
          seat_number: 1,
          seat_count: 1,
          starts_on: "2025-01-01",
          planned_end: "2026-11-30",
        },
        {
          title: "Treasurer",
          seat_number: 1,
          seat_count: 1,
          starts_on: "2024-01-01",
          planned_end: "2026-10-01",
        },
        {
          title: "Chaplain",
          seat_number: 1,
          seat_count: 1,
          starts_on: "2024-01-01",
          planned_end: null,
        },
      ],
    });
    expect(keys(actions)).toEqual([
      "lapsed",
      "profile",
      "seat:President:1",
      "seat-past:Treasurer:1",
    ]);
    expect(actions[1]!.text).toBe("Complete your profile: Phone, Rank.");
  });
});

describe("profile and board helpers", () => {
  const defs = [
    { id: "a", label: "Phone", required: true, member_editable: true },
    { id: "b", label: "Rank", required: true, member_editable: false },
    { id: "c", label: "Nickname", required: false, member_editable: true },
    { id: "d", label: "Units", required: true, member_editable: true },
  ];
  it("lists required fields the member can fill but hasn't", () => {
    expect(missingRequiredFields(defs, { a: "", d: [] })).toEqual(["Phone", "Units"]);
    expect(missingRequiredFields(defs, { a: "555", d: ["x"] })).toEqual([]);
  });

  it("formats values for the summary", () => {
    const opts = [
      { value: "e5", label: "E-5" },
      { value: "e6", label: "E-6" },
    ];
    expect(formatFieldValue({ data_type: "ordered", options: opts }, "e5")).toBe("E-5");
    expect(formatFieldValue({ data_type: "multi_choice", options: opts }, ["e5", "e6"])).toBe(
      "E-5, E-6",
    );
    expect(formatFieldValue({ data_type: "boolean", options: [] }, false)).toBe("No");
    expect(formatFieldValue({ data_type: "text", options: [] }, null)).toBe("—");
  });

  const seat = (over: Partial<Seat>): Seat => ({
    template_id: "t",
    owner_org_id: "n",
    key: "k",
    title: "President",
    default_title: "President",
    description: "",
    required: true,
    seat_count: 1,
    scope: "self",
    role_id: null,
    term: null,
    term_source: "default",
    term_since: null,
    bylaw_reference: "",
    holders: [],
    ...over,
  });
  const holder = (profile_id: string, display_name: string, seat_number = 1) => ({
    appointment_id: `ap-${profile_id}`,
    profile_id,
    display_name,
    seat_number,
    starts_on: "2025-01-01",
    planned_end: null,
  });
  it("finds my seats and lists officers without vacant seats", () => {
    const board = [
      seat({ template_id: "p", holders: [holder("me", "Me")] }),
      seat({
        template_id: "d",
        title: "Delegate",
        seat_count: 2,
        holders: [holder("x", "Xan", 2), holder("me", "Me", 1)],
      }),
      seat({ template_id: "v", title: "Secretary" }),
    ];
    expect(mySeats(board, "me").map((s) => `${s.title}#${s.seat_number}`)).toEqual([
      "President#1",
      "Delegate#1",
    ]);
    expect(mySeats(board, null)).toEqual([]);
    expect(officers(board).map((o) => `${o.title}: ${o.name}`)).toEqual([
      "President: Me",
      "Delegate: Me",
      "Delegate: Xan",
    ]);
  });
});
