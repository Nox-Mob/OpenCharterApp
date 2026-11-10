import { describe, expect, it } from "vitest";
import type { DefWithOptions } from "@/modules/attributes/queries";
import { buildRows, fieldValue, guessTargets, mergeResults, parseCsv, templateCsv } from "./import";

const def = (over: Partial<DefWithOptions>): DefWithOptions =>
  ({
    id: "d1",
    unit_id: "o",
    key: "rank",
    label: "Rank",
    data_type: "text",
    required: false,
    visibility: "admins",
    member_editable: false,
    show_in_directory: false,
    locked: false,
    sort_order: 0,
    active: true,
    applies_to: "member",
    options: [],
    ...over,
  }) as DefWithOptions;

describe("parseCsv", () => {
  it("reads quoted cells, doubled quotes, CRLF, a byte-order mark and skips blank lines", () => {
    expect(parseCsv('\uFEFFName,Note\r\n"Lee, Ann","said ""hi"""\r\n\r\nBo,\n')).toEqual([
      ["Name", "Note"],
      ["Lee, Ann", 'said "hi"'],
      ["Bo", ""],
    ]);
  });
  it("keeps line breaks inside quotes", () => {
    expect(parseCsv('a\n"x\ny"')).toEqual([["a"], ["x\ny"]]);
  });
});

describe("guessTargets", () => {
  it("matches common headings and member fields, once each", () => {
    const defs = [
      def({ id: "r", label: "Rank" }),
      def({ id: "b", label: "Branch", key: "branch" }),
    ];
    expect(
      guessTargets(
        [
          "Full name",
          "E-mail",
          "Membership level",
          "Term",
          "Join date",
          "Expires",
          "Chapter",
          "RANK",
          "branch",
          "Email",
          "Shoe size",
        ],
        defs,
        false,
      ),
    ).toEqual([
      "name",
      "email",
      "level",
      "term",
      "joined_on",
      "paid_through",
      "ignore", // chapters only in the home-chapter model
      "field:r",
      "field:b",
      "ignore", // email is already taken
      "ignore",
    ]);
    expect(guessTargets(["Home chapter"], [], true)).toEqual(["chapter"]);
  });
});

describe("fieldValue", () => {
  it("turns cells into the field's type", () => {
    expect(fieldValue(def({ data_type: "number" }), "1,200")).toBe(1200);
    expect(fieldValue(def({ data_type: "boolean" }), "Yes")).toBe(true);
    expect(fieldValue(def({ data_type: "boolean" }), "no")).toBe(false);
    const options = [
      { value: "e4", label: "E-4", sort_order: 1, active: true },
      { value: "e5", label: "E-5", sort_order: 2, active: true },
    ];
    expect(fieldValue(def({ data_type: "choice", options }), "e-4")).toBe("e4");
    expect(fieldValue(def({ data_type: "multi_choice", options }), "E-4; e5")).toEqual([
      "e4",
      "e5",
    ]);
    expect(fieldValue(def({ data_type: "choice", options }), "Z")).toBe("Z"); // the database reports it
    expect(fieldValue(def({}), "  ")).toBeNull();
  });
});

describe("buildRows and templateCsv", () => {
  it("numbers rows as in the spreadsheet and leaves empty fields out", () => {
    const rows = buildRows(
      [
        ["Name", "Email", "Rank"],
        ["Ann", "ann@x.org", "E-4"],
        ["Bo", "", ""],
      ],
      ["name", "email", "field:d1"],
      [def({})],
    );
    expect(rows[0]).toMatchObject({
      row: 2,
      name: "Ann",
      email: "ann@x.org",
      fields: { d1: "E-4" },
    });
    expect(rows[1]).toMatchObject({ row: 3, name: "Bo", fields: {} });
  });
  it("offers a template with this org's fields", () => {
    const csv = templateCsv([def({ label: "Rank" })], true);
    expect(csv.split("\r\n")[0]).toBe(
      "\uFEFFName,Email,Level,Term,Joined,Paid through,Chapter,Rank",
    );
  });
  it("merges batch results", () => {
    expect(
      mergeResults([
        { rows: 2, create: 1, update: 1, errors: [], applied: true },
        { rows: 1, create: 0, update: 0, errors: [{ row: 5, message: "x" }], applied: false },
      ]),
    ).toEqual({
      rows: 3,
      create: 1,
      update: 1,
      errors: [{ row: 5, message: "x" }],
      applied: false,
    });
  });
});
