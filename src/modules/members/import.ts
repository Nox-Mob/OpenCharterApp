import type { DefWithOptions } from "@/modules/attributes/queries";
import { db } from "@/lib/db/pending-schema";
import { csvCell } from "./roster";

/**
 * Member import (U1, D-189). An admin uploads a spreadsheet saved as CSV, matches its columns to
 * member details, checks it, then imports it. The database (import_members, migration 0037)
 * checks every row again and applies a batch in one transaction; re-running the same file
 * updates the members it already added instead of duplicating them (matched by email, else by
 * name among records without an email).
 */
export const IMPORT_BATCH = 1000;

export type ImportTarget =
  | "ignore"
  | "name"
  | "email"
  | "level"
  | "term"
  | "joined_on"
  | "paid_through"
  | "chapter"
  | `field:${string}`;

export type ImportRow = {
  row: number;
  name: string;
  email: string;
  level: string;
  term: string;
  joined_on: string;
  paid_through: string;
  chapter: string;
  fields: Record<string, unknown>;
};

export type ImportResult = {
  rows: number;
  create: number;
  update: number;
  errors: { row: number; message: string }[];
  applied: boolean;
};

/** RFC 4180 CSV (quoted fields, doubled quotes, CRLF or LF), with a leading byte-order mark ignored. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // blank lines (e.g. at the end of the file) are dropped
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const GUESSES: [ImportTarget, string[]][] = [
  ["name", ["name", "fullname", "membername", "displayname"]],
  ["email", ["email", "emailaddress", "mail"]],
  ["level", ["level", "membershiplevel", "tier", "membership", "membershiptype"]],
  ["term", ["term", "length", "duration"]],
  [
    "joined_on",
    ["joined", "joinedon", "joindate", "datejoined", "since", "memberSince".toLowerCase()],
  ],
  [
    "paid_through",
    [
      "paidthrough",
      "expires",
      "expiry",
      "expiration",
      "expirationdate",
      "renewaldate",
      "paiduntil",
    ],
  ],
  ["chapter", ["chapter", "homechapter"]],
];

/** A first guess at what each column holds, from its heading. */
export function guessTargets(
  headers: readonly string[],
  defs: readonly DefWithOptions[],
  allowChapter: boolean,
): ImportTarget[] {
  const used = new Set<string>();
  return headers.map((h) => {
    const n = norm(h);
    let t: ImportTarget = "ignore";
    const known = GUESSES.find(([, names]) => names.includes(n));
    if (known && (known[0] !== "chapter" || allowChapter)) t = known[0];
    else {
      const def = defs.find((d) => norm(d.label) === n || norm(d.key) === n);
      if (def) t = `field:${def.id}`;
    }
    if (t !== "ignore" && used.has(t)) t = "ignore";
    used.add(t);
    return t;
  });
}

/** A cell as a member field's value (the database checks it again). */
export function fieldValue(def: DefWithOptions, raw: string): unknown {
  const v = raw.trim();
  if (v === "") return null;
  const option = (s: string) =>
    def.options.find(
      (o) => o.active && (o.value === s || o.label.toLowerCase() === s.toLowerCase()),
    )?.value ?? s;
  switch (def.data_type) {
    case "number": {
      const n = Number(v.replace(/,/g, ""));
      return Number.isFinite(n) ? n : v;
    }
    case "boolean":
      return /^(yes|y|true|1|x)$/i.test(v) ? true : /^(no|n|false|0)$/i.test(v) ? false : v;
    case "choice":
    case "ordered":
      return option(v);
    case "multi_choice":
      return v
        .split(/[;|]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map(option);
    default:
      return v;
  }
}

/** The rows to send, numbered as in the spreadsheet (row 1 is the heading). */
export function buildRows(
  table: readonly string[][],
  targets: readonly ImportTarget[],
  defs: readonly DefWithOptions[],
): ImportRow[] {
  const byId = new Map(defs.map((d) => [d.id, d]));
  return table.slice(1).map((cells, i) => {
    const row: ImportRow = {
      row: i + 2,
      name: "",
      email: "",
      level: "",
      term: "",
      joined_on: "",
      paid_through: "",
      chapter: "",
      fields: {},
    };
    targets.forEach((t, c) => {
      const raw = (cells[c] ?? "").trim();
      if (t === "ignore") return;
      if (t.startsWith("field:")) {
        const def = byId.get(t.slice(6));
        if (def && raw !== "") row.fields[def.id] = fieldValue(def, raw);
        return;
      }
      row[t as Exclude<ImportTarget, "ignore" | `field:${string}`>] = raw;
    });
    return row;
  });
}

/** A template with the usual columns and this org's member fields. */
export function templateCsv(defs: readonly DefWithOptions[], allowChapter: boolean): string {
  const headers = [
    "Name",
    "Email",
    "Level",
    "Term",
    "Joined",
    "Paid through",
    ...(allowChapter ? ["Chapter"] : []),
    ...defs.map((d) => d.label),
  ];
  const example = [
    "Pat Example",
    "pat@example.org",
    "Regular",
    "1 year",
    "2024-01-15",
    "2027-01-14",
    ...(allowChapter ? [""] : []),
    ...defs.map(() => ""),
  ];
  return "\uFEFF" + [headers, example].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Combine the results of several batches into one report. */
export function mergeResults(parts: readonly ImportResult[]): ImportResult {
  return parts.reduce(
    (acc, p) => ({
      rows: acc.rows + p.rows,
      create: acc.create + p.create,
      update: acc.update + p.update,
      errors: [...acc.errors, ...p.errors],
      applied: acc.applied && p.applied,
    }),
    { rows: 0, create: 0, update: 0, errors: [], applied: true } as ImportResult,
  );
}

export const TARGET_LABELS: Record<Exclude<ImportTarget, `field:${string}`>, string> = {
  ignore: "Don't import",
  name: "Name",
  email: "Email",
  level: "Membership level",
  term: "Term",
  joined_on: "Joined (YYYY-MM-DD)",
  paid_through: "Paid through (YYYY-MM-DD)",
  chapter: "Chapter",
};

/**
 * Check (apply = false) or import the rows, in batches of IMPORT_BATCH. Checking writes nothing.
 * Importing stops at the first batch with errors; each batch is one transaction.
 */
export async function runImport(orgId: string, rows: readonly ImportRow[], apply: boolean) {
  const parts: ImportResult[] = [];
  for (let i = 0; i < rows.length; i += IMPORT_BATCH) {
    const { data, error } = await db.rpc("import_members", {
      _org: orgId,
      _rows: rows.slice(i, i + IMPORT_BATCH) as never,
      _apply: apply,
    });
    if (error) throw error;
    const part = data as unknown as ImportResult;
    parts.push(part);
    if (apply && !part.applied) break;
  }
  return mergeResults(parts);
}
