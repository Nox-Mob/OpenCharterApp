import { z } from "zod";

/**
 * Membership levels (tiers) and terms (E-11, D-122). Everything here is org-defined:
 * names, prices and term lengths are never assumed in code (D-051). Prices are integer
 * minor units (cents) with a currency code. A term is a count plus a unit, or lifetime.
 */
export const TERM_UNITS = ["day", "month", "year"] as const;
export type TermUnit = (typeof TERM_UNITS)[number];
/** The length drop-down: a unit, or lifetime (no end date). */
export type TermLengthChoice = TermUnit | "lifetime";
export const TERM_LENGTH_CHOICES: readonly { value: TermLengthChoice; label: string }[] = [
  { value: "day", label: "Days" },
  { value: "month", label: "Months" },
  { value: "year", label: "Years" },
  { value: "lifetime", label: "Lifetime" },
];

export const TAX_TREATMENTS = ["non_deductible", "deductible", "partial"] as const;
export type TaxTreatment = (typeof TAX_TREATMENTS)[number];
export const TAX_TREATMENT_LABELS: Record<TaxTreatment, string> = {
  non_deductible: "Not tax-deductible",
  deductible: "Tax-deductible",
  partial: "Partly tax-deductible",
};

export type TermLength = { count: number; unit: TermUnit } | null; // null = lifetime

export type Term = {
  id?: string;
  key: string;
  label: string;
  length_count: number | null;
  length_unit: TermUnit | null;
  price_minor: number;
  currency: string;
  active?: boolean;
};

export type Tier = {
  id?: string;
  org_id?: string;
  key: string;
  name: string;
  description: string;
  tax_treatment: TaxTreatment;
  active?: boolean;
  terms: Term[];
};

const UNIT_NAMES: Record<TermUnit, [string, string]> = {
  day: ["day", "days"],
  month: ["month", "months"],
  year: ["year", "years"],
};

export function lengthOf(t: Pick<Term, "length_count" | "length_unit">): TermLength {
  return t.length_count === null || t.length_unit === null
    ? null
    : { count: t.length_count, unit: t.length_unit };
}

/** "1 year", "18 months", "Lifetime". */
export function termLabel(length: TermLength): string {
  if (!length) return "Lifetime";
  const [one, many] = UNIT_NAMES[length.unit];
  return `${length.count} ${length.count === 1 ? one : many}`;
}

/** Stable key for a term, derived from its length ("1_year", "lifetime"). */
export function termKey(length: TermLength): string {
  return length ? `${length.count}_${length.unit}` : "lifetime";
}

export function tierKey(name: string): string {
  const k = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return /^[a-z]/.test(k) ? k : `t_${k}`.slice(0, 48);
}

/** "25", "25.5", "$1,250.00" → minor units. Returns null for anything that isn't a price. */
export function parsePrice(input: string): number | null {
  const clean = input.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(clean)) return null;
  const [whole, frac = ""] = clean.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

export function formatPrice(minor: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 100);
}

/** Price as typed in a form field ("25.00"). */
export function priceInput(minor: number): string {
  return (minor / 100).toFixed(2);
}

/**
 * Last day covered by a term that starts on `start` (YYYY-MM-DD): the day before the same
 * date one term later, or that month's last day when the date doesn't exist there
 * (Jan 31 + 1 month → Feb 28/29). Lifetime → null.
 * Ready for E-13 renewals; dates are calendar dates with no time zone.
 */
export function termEndDate(start: string, length: TermLength): string | null {
  if (!length) return null;
  const [y, m, d] = start.split("-").map(Number) as [number, number, number];
  let end: Date;
  if (length.unit === "day") {
    end = new Date(Date.UTC(y, m - 1, d + length.count - 1));
  } else {
    const months = length.unit === "year" ? length.count * 12 : length.count;
    const target = new Date(Date.UTC(y, m - 1 + months, 1));
    const lastDay = new Date(
      Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
    ).getUTCDate();
    // Through the day before the same date in the target month (a year from Mar 1 runs
    // through Feb 28/29). If that date doesn't exist (Jan 31 + 1 month), through month end.
    const day = d > lastDay ? lastDay : d - 1;
    end = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), day));
  }
  return end.toISOString().slice(0, 10);
}

const termSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9][a-z0-9_]{0,47}$/),
    label: z.string().trim().min(1).max(80),
    length_count: z.number().int().min(1, "Length must be at least 1").max(1000).nullable(),
    length_unit: z.enum(TERM_UNITS).nullable(),
    price_minor: z
      .number({ invalid_type_error: "Enter a price like 25.00" })
      .int()
      .min(0, "Price can't be negative")
      .max(100000000, "Price is too large"),
    currency: z.string().regex(/^[A-Z]{3}$/),
  })
  .refine((t) => (t.length_count === null) === (t.length_unit === null), {
    message: "Give the term a length, or choose Lifetime",
  });

export const tierInputSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/, "Use lowercase letters, numbers and _"),
    name: z.string().trim().min(1, "Give the level a name").max(80),
    description: z.string().trim().max(500),
    tax_treatment: z.enum(TAX_TREATMENTS),
    terms: z.array(termSchema).min(1, "Add at least one term"),
  })
  .refine((t) => new Set(t.terms.map((x) => x.key)).size === t.terms.length, {
    message: "Each term length can only be listed once",
    path: ["terms"],
  });
export type TierInput = z.infer<typeof tierInputSchema>;

/** A new term row: 1 year at no price yet. */
export function newTerm(currency = "USD"): Term {
  const length = { count: 1, unit: "year" as const };
  return {
    key: termKey(length),
    label: termLabel(length),
    length_count: 1,
    length_unit: "year",
    price_minor: 0,
    currency,
  };
}

/** Apply a new length to a term, keeping key and label in step with it. */
export function withLength(term: Term, length: TermLength): Term {
  return {
    ...term,
    key: term.id ? term.key : termKey(length),
    label: termLabel(length),
    length_count: length?.count ?? null,
    length_unit: length?.unit ?? null,
  };
}

/** "Regular: 1 year $25.00, Lifetime $300.00" for summaries. */
export function describeTier(t: Pick<Tier, "name" | "terms">): string {
  const terms = t.terms.filter((x) => x.active !== false);
  return `${t.name}: ${terms
    .map((x) => `${termLabel(lengthOf(x))} ${formatPrice(x.price_minor, x.currency)}`)
    .join(", ")}`;
}

/** A blank level for the editor: one 1-year term at no price yet. */
export const EMPTY_TIER: Tier = {
  key: "",
  name: "",
  description: "",
  tax_treatment: "non_deductible",
  terms: [newTerm()],
};
