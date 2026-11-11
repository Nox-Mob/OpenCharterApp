import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import {
  EXPORT_TABLES,
  buildExportZip,
  exportFileName,
  readEverything,
  tableCsv,
  type ExportClient,
  type Row,
} from "./everything";

describe("tableCsv", () => {
  it("header from every row's columns; objects as JSON; formulas made safe", () => {
    const csv = tableCsv([
      { id: "1", name: "Ada", extra: { a: 1 } },
      { id: "2", name: "=SUM(A1)", note: 'say "hi"' },
    ]);
    const [head, a, b] = csv.replace("﻿", "").split("\r\n");
    expect(head).toBe("id,name,extra,note");
    expect(a).toBe('1,Ada,"{""a"":1}",');
    expect(b).toBe(`2,'=SUM(A1),,"say ""hi"""`);
  });

  it("an empty table is an empty file", () => {
    expect(tableCsv([])).toBe("");
  });
});

describe("readEverything", () => {
  it("reads every table for the units, page by page, and never the internal ones", async () => {
    const asked: string[] = [];
    const big = Array.from({ length: 1500 }, (_, i) => ({ id: String(i), unit_id: "u1" }));
    const client: ExportClient = {
      from: (table) => ({
        select: () => ({
          in: (col, values) => ({
            order: () => ({
              range: async (a, b) => {
                asked.push(`${table}:${col}:${values.join("+")}:${a}`);
                const rows: Row[] = table === "payments" ? big.slice(a, b + 1) : [];
                return { data: rows, error: null };
              },
            }),
          }),
        }),
      }),
    };
    const data = await readEverything(client, ["u1", "u2"]);
    expect(data.payments).toHaveLength(1500);
    expect(asked).toContain("payments:unit_id:u1+u2:1000");
    expect(asked).toContain("units:id:u1+u2:0");
    for (const t of ["gateway_secrets", "receipt_counters", "webhook_events"])
      expect(asked.some((q) => q.startsWith(`${t}:`))).toBe(false);
  });
});

describe("buildExportZip", () => {
  it("has the README, the JSON and one CSV per table", () => {
    const data = Object.fromEntries(EXPORT_TABLES.map((t) => [t, []])) as never as Parameters<
      typeof buildExportZip
    >[0];
    data.member_profiles = [{ id: "m1", display_name: "Ada" }];
    const zip = unzipSync(
      buildExportZip(data, {
        organization: "Riverside",
        organizationId: "org1",
        exportedAt: "2026-11-11T00:00:00Z",
      }),
    );
    expect(Object.keys(zip)).toContain("README.txt");
    for (const t of EXPORT_TABLES) expect(Object.keys(zip)).toContain(`csv/${t}.csv`);
    const json = JSON.parse(strFromU8(zip["charter-export.json"]!));
    expect(json.format).toBe("opencharterapp-export");
    expect(json.counts.member_profiles).toBe(1);
    expect(json.tables.member_profiles[0].display_name).toBe("Ada");
    expect(strFromU8(zip["README.txt"]!)).toContain("member_profiles: 1 rows");
  });

  it("names the file after the organization and date", () => {
    expect(exportFileName("Riverside Community Association", "2026-11-11")).toBe(
      "riverside-community-association-charter-export-2026-11-11.zip",
    );
  });
});
