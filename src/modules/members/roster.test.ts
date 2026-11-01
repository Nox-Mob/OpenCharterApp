import { describe, expect, it } from "vitest";
import type { MemberRow } from "@/modules/membership/memberships";
import { STANDING_LABELS } from "@/modules/membership/standing";
import {
  csvCell,
  EMPTY_FILTER,
  exportColumns,
  fieldText,
  filterRoster,
  sortRoster,
  toCsv,
  toRosterRows,
  type RosterField,
} from "./roster";

const rank: RosterField = {
  id: "rank",
  label: "Rank",
  data_type: "ordered",
  visibility: "members",
  options: ["E1", "E2", "E3", "E4"].map((v, i) => ({
    value: v,
    label: v.replace("E", "E-"),
    sort_order: i,
    active: true,
  })),
};
const phone: RosterField = {
  id: "phone",
  label: "Phone",
  data_type: "text",
  visibility: "admins",
  options: [],
};
const vet: RosterField = {
  id: "vet",
  label: "Veteran",
  data_type: "boolean",
  visibility: "members",
  options: [],
};
const tags: RosterField = {
  id: "tags",
  label: "Tags",
  data_type: "multi_choice",
  visibility: "members",
  options: [
    { value: "a", label: "Alpha", sort_order: 0, active: true },
    { value: "b", label: "Beta", sort_order: 1, active: true },
  ],
};
const fields = [rank, phone, vet, tags];

const member = (
  id: string,
  name: string,
  paid_through: string | null,
  tier = "t1",
  extra: Partial<MemberRow> = {},
): MemberRow => ({
  id,
  user_id: id,
  display_name: name,
  email: `${id}@x.org`,
  source: "signup",
  created_at: "2026-01-01",
  membership:
    paid_through === null
      ? null
      : {
          id: `m-${id}`,
          status: "active",
          paid_through,
          lifetime: false,
          joined_on: "2025-01-01",
          tier_id: tier,
          term_id: "x",
          tier_name: tier === "t1" ? "Regular" : "Senior",
          term_label: "1 year",
        },
  ...extra,
});
const rows = toRosterRows(
  [
    member("a", "Ana Álvarez", "2026-12-31"),
    member("b", "Bo", "2026-05-20", "t2"),
    member("c", "Cy", "2026-01-31"),
    member("d", "Di", null),
  ],
  {
    a: { rank: "E3", phone: "555-0100", vet: true, tags: ["a", "b"] },
    b: { rank: "E1" },
    c: { rank: "E4", vet: false },
  },
  30,
  "2026-06-01",
);

describe("toRosterRows", () => {
  it("derives standing on the given day", () => {
    expect(rows.map((r) => r.standing)).toEqual(["good", "grace", "lapsed", "none"]);
  });
});

describe("filterRoster", () => {
  const ids = (f: Partial<typeof EMPTY_FILTER>) =>
    filterRoster(rows, { ...EMPTY_FILTER, ...f }, fields).map((r) => r.id);
  it("searches names and emails, ignoring case and accents", () => {
    expect(ids({ q: "alvarez" })).toEqual(["a"]);
    expect(ids({ q: "B@X" })).toEqual(["b"]);
  });
  it("filters by standing and level", () => {
    expect(ids({ standings: ["good", "grace"] })).toEqual(["a", "b"]);
    expect(ids({ tierIds: ["t2"] })).toEqual(["b"]);
  });
  it("filters ordered fields by 'at least' (rank E-3 or higher)", () => {
    expect(ids({ field: { fieldId: "rank", op: "at_least", value: "E3" } })).toEqual(["a", "c"]);
  });
  it("matches exact choices, booleans, several choices and 'has a value'", () => {
    expect(ids({ field: { fieldId: "rank", op: "is", value: "E1" } })).toEqual(["b"]);
    expect(ids({ field: { fieldId: "vet", op: "is", value: "false" } })).toEqual(["c"]);
    expect(ids({ field: { fieldId: "tags", op: "is", value: "b" } })).toEqual(["a"]);
    expect(ids({ field: { fieldId: "phone", op: "has_value" } })).toEqual(["a"]);
    expect(ids({ field: { fieldId: "phone", op: "is", value: "0100" } })).toEqual(["a"]);
  });
});

describe("sortRoster", () => {
  it("sorts by name, soonest expiry, or standing", () => {
    expect(sortRoster(rows, "name").map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
    expect(sortRoster(rows, "paid_through").map((r) => r.id)).toEqual(["c", "b", "a", "d"]);
    expect(sortRoster(rows, "standing").map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("CSV export", () => {
  it("escapes commas, quotes and line breaks (RFC 4180)", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(" padded")).toBe('" padded"');
  });
  it("neutralizes spreadsheet formulas", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("+1 555")).toBe("'+1 555");
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell("@cmd")).toBe("'@cmd");
  });
  it("formats field values readably", () => {
    expect(fieldText(rank, "E3")).toBe("E-3");
    expect(fieldText(tags, ["a", "b"])).toBe("Alpha; Beta");
    expect(fieldText(vet, false)).toBe("No");
    expect(fieldText(phone, undefined)).toBe("");
  });
  it("leaves admin-only fields out unless the exporter may see them", () => {
    const keys = (admin: boolean) =>
      exportColumns(fields, admin, (s) => STANDING_LABELS[s]).map((c) => c.label);
    expect(keys(false)).not.toContain("Phone");
    expect(keys(true)).toContain("Phone");
    expect(keys(false)).toEqual(
      expect.arrayContaining(["Name", "Email", "Standing", "Paid through", "Rank"]),
    );
  });
  it("writes a header and one CRLF line per member", () => {
    const cols = exportColumns([rank], false, (s) => STANDING_LABELS[s]);
    const csv = toCsv(rows.slice(0, 2), cols);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Name,Email,Standing,Level,Term,Member since,Paid through,Rank");
    expect(lines[1]).toBe(
      "Ana Álvarez,a@x.org,Good standing,Regular,1 year,2025-01-01,2026-12-31,E-3",
    );
    expect(lines).toHaveLength(4);
  });
});
