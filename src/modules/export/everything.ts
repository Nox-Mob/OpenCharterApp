// "Export everything" (S-06, SHARED-SPEC §9): every Charter table for an organization and the
// chapters below it, as one CSV per table plus one JSON file, zipped. The database's security
// rules decide what each table returns, so the export holds exactly what the person can read.
// Reading only: it works while billing makes Charter read-only.
import { strToU8, zipSync } from "fflate";
import { csvCell } from "@/modules/members/roster";

/** Tables in the export, in schema `charter`. Internal tables are left out: gateway secrets
 *  (never readable), receipt counters and webhook deliveries. */
export const EXPORT_TABLES = [
  "units",
  "org_settings",
  "member_profiles",
  "memberships",
  "membership_events",
  "membership_tiers",
  "tier_terms",
  "pricing_rules",
  "member_segments",
  "affiliation_history",
  "attribute_definitions",
  "attribute_options",
  "attribute_values",
  "roles",
  "role_assignments",
  "seat_templates",
  "seat_terms",
  "seat_title_overrides",
  "seat_contacts",
  "appointments",
  "payments",
  "receipts",
  "tax_profiles",
  "gateway_connections",
  "setup_states",
  "audit_events",
] as const;

export type ExportTable = (typeof EXPORT_TABLES)[number];
export type Row = Record<string, unknown>;
export type ExportData = Record<ExportTable, Row[]>;

const PAGE = 1000;

/** Columns per table where "*" isn't right: member field values come decrypted where the person
 *  may read them (sensitive fields, Charter 0019), never in their encrypted form. */
const SELECT: Partial<Record<ExportTable, string>> = {
  attribute_values: "id,unit_id,definition_id,entity_id,value:shown_value,updated_by,updated_at",
};

/** The minimal client surface used (PostgREST through supabase-js, schema `charter`). */
type Query = {
  select: (cols: string) => {
    in: (
      col: string,
      values: readonly string[],
    ) => {
      order: (col: string) => {
        range: (a: number, b: number) => PromiseLike<{ data: Row[] | null; error: unknown }>;
      };
    };
  };
};
export type ExportClient = { from: (table: string) => Query };

/** Reads every table for the given units (the organization and its chapters), page by page. */
export async function readEverything(
  client: ExportClient,
  unitIds: readonly string[],
  onProgress?: (table: ExportTable) => void,
): Promise<ExportData> {
  const out = {} as ExportData;
  for (const table of EXPORT_TABLES) {
    onProgress?.(table);
    const key = table === "units" ? "id" : "unit_id";
    const rows: Row[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await client
        .from(table)
        .select(SELECT[table] ?? "*")
        .in(key, unitIds)
        .order(key === "id" ? "id" : "unit_id")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`${table}: ${(error as { message?: string }).message ?? error}`);
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    out[table] = rows;
  }
  return out;
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** One table as RFC 4180 CSV (CRLF, header row, spreadsheet-formula safe). */
export function tableCsv(rows: readonly Row[]): string {
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  if (columns.length === 0) return "";
  const lines = [columns.map(csvCell).join(",")];
  for (const r of rows) lines.push(columns.map((c) => csvCell(cellText(r[c]))).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export type ExportMeta = { organization: string; organizationId: string; exportedAt: string };

/** The zip: README.txt, charter-export.json (everything) and csv/<table>.csv. */
export function buildExportZip(data: ExportData, meta: ExportMeta): Uint8Array {
  const counts = Object.fromEntries(EXPORT_TABLES.map((t) => [t, data[t]?.length ?? 0]));
  const readme = [
    `OpenCharterApp export: ${meta.organization} (${meta.organizationId})`,
    `Exported ${meta.exportedAt}.`,
    "",
    "charter-export.json holds every table below in one file; csv/ has one file per table.",
    "It covers the organization and its chapters, as far as your role lets you read them.",
    "",
    ...EXPORT_TABLES.map((t) => `${t}: ${counts[t]} rows`),
    "",
  ].join("\r\n");
  const files: Record<string, Uint8Array> = {
    "README.txt": strToU8(readme),
    "charter-export.json": strToU8(
      JSON.stringify(
        { format: "opencharterapp-export", version: 1, ...meta, counts, tables: data },
        null,
        2,
      ),
    ),
  };
  for (const t of EXPORT_TABLES) files[`csv/${t}.csv`] = strToU8(tableCsv(data[t] ?? []));
  return zipSync(files, { level: 6 });
}

export function exportFileName(slugOrName: string, date: string): string {
  const base = slugOrName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base || "organization"}-charter-export-${date}.zip`;
}
