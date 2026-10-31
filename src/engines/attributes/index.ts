import { z } from "zod";

/**
 * Custom attribute engine (E-09). Org-defined fields on members (and chapters).
 * validateValue mirrors public.validate_attribute_value so the UI can explain
 * problems before the database rejects them.
 */
export const ATTRIBUTE_TYPES = [
  "text",
  "number",
  "date",
  "boolean",
  "choice",
  "multi_choice",
  "ordered",
] as const;
export type AttributeType = (typeof ATTRIBUTE_TYPES)[number];
export const VISIBILITIES = ["admins", "members", "public"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

/** What an attribute describes. Chapter fields are defined by a national or region (D-061). */
export const SUBJECTS = ["member", "chapter"] as const;
export type AttributeSubject = (typeof SUBJECTS)[number];

export const TYPE_LABELS: Record<AttributeType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  boolean: "Yes / no",
  choice: "Pick one",
  multi_choice: "Pick several",
  ordered: "Ordered list (e.g. rank)",
};
export const VISIBILITY_LABELS: Record<Visibility, string> = {
  admins: "Admins only",
  members: "Members of the organization",
  public: "Anyone",
};

/** Same stored values, worded for chapter fields. */
export const CHAPTER_VISIBILITY_LABELS: Record<Visibility, string> = {
  admins: "National and chapter admins",
  members: "Members of the chapter",
  public: "Anyone",
};

export function visibilityLabels(subject: AttributeSubject): Record<Visibility, string> {
  return subject === "chapter" ? CHAPTER_VISIBILITY_LABELS : VISIBILITY_LABELS;
}

/** Member-only switches have no meaning for chapter fields (the database clears them too). */
export function forSubject(input: AttributeInput, subject: AttributeSubject): AttributeInput {
  return subject === "chapter"
    ? { ...input, member_editable: false, show_in_directory: false }
    : input;
}

export type AttributeDef = {
  id: string;
  org_id: string;
  key: string;
  label: string;
  data_type: AttributeType;
  required: boolean;
  visibility: Visibility;
  member_editable: boolean;
  show_in_directory: boolean;
  sort_order: number;
  active: boolean;
};
export type AttributeOption = {
  id?: string;
  value: string;
  label: string;
  sort_order: number;
  active: boolean;
};

export const hasOptions = (t: AttributeType) =>
  t === "choice" || t === "multi_choice" || t === "ordered";

export function toKey(label: string): string {
  const k = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return /^[a-z]/.test(k) ? k : `f_${k}`.slice(0, 48);
}

export function validateValue(
  def: Pick<AttributeDef, "data_type" | "required" | "label">,
  options: readonly Pick<AttributeOption, "value" | "active">[],
  value: unknown,
): string | null {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  ) {
    return def.required ? `${def.label} is required` : null;
  }
  const allowed = new Set(options.filter((o) => o.active).map((o) => o.value));
  const bad = `Invalid value for ${def.label}`;
  switch (def.data_type) {
    case "text":
      return typeof value === "string" && value.length <= 2000 ? null : bad;
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? null : bad;
    case "boolean":
      return typeof value === "boolean" ? null : bad;
    case "date": {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return bad;
      const d = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value) ? null : bad;
    }
    case "choice":
    case "ordered":
      return typeof value === "string" && allowed.has(value) ? null : bad;
    case "multi_choice":
      return Array.isArray(value) &&
        value.every((v) => typeof v === "string" && allowed.has(v)) &&
        new Set(value).size === value.length
        ? null
        : bad;
  }
}

/** Compare two ordered-list values (e.g. rank E5 >= E3). Negative if a ranks below b. */
export function compareOrdered(options: readonly AttributeOption[], a: string, b: string): number {
  const pos = (v: string) => options.find((o) => o.value === v)?.sort_order ?? Number.NaN;
  return pos(a) - pos(b);
}

export function moveOption<T>(list: readonly T[], index: number, dir: -1 | 1): T[] {
  const j = index + dir;
  if (j < 0 || j >= list.length) return [...list];
  const out = [...list];
  [out[index], out[j]] = [out[j]!, out[index]!];
  return out;
}

export const optionInputSchema = z.object({
  value: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(80),
});

export const attributeInputSchema = z
  .object({
    label: z.string().trim().min(1, "Give the field a name").max(80),
    key: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/, "Use lowercase letters, numbers and _"),
    data_type: z.enum(ATTRIBUTE_TYPES),
    required: z.boolean(),
    visibility: z.enum(VISIBILITIES),
    member_editable: z.boolean(),
    show_in_directory: z.boolean(),
    options: z.array(optionInputSchema),
  })
  .superRefine((v, ctx) => {
    if (hasOptions(v.data_type) && v.options.length < 2) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "Add at least two choices" });
    }
    if (new Set(v.options.map((o) => o.value)).size !== v.options.length) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "Choices must be unique" });
    }
  });
export type AttributeInput = z.infer<typeof attributeInputSchema>;

const opts = (...v: string[]) => v.map((x) => ({ value: x, label: x }));
/** Common starters offered in setup (setup-engine.md §6.2). Nothing here is assumed in code. */
export const STARTER_ATTRIBUTES: readonly (Omit<AttributeInput, "options"> & {
  options: { value: string; label: string }[];
})[] = [
  {
    label: "Salutation",
    key: "salutation",
    data_type: "choice",
    required: false,
    visibility: "members",
    member_editable: true,
    show_in_directory: true,
    options: opts("Mr.", "Ms.", "Mx.", "Dr."),
  },
  {
    label: "Rank",
    key: "rank",
    data_type: "ordered",
    required: false,
    visibility: "members",
    member_editable: false,
    show_in_directory: true,
    options: opts("E-1", "E-2", "E-3", "E-4", "E-5", "E-6"),
  },
  {
    label: "Branch",
    key: "branch",
    data_type: "choice",
    required: false,
    visibility: "members",
    member_editable: true,
    show_in_directory: true,
    options: opts("Army", "Navy", "Air Force", "Marine Corps", "Coast Guard", "Space Force"),
  },
  {
    label: "Join date",
    key: "join_date",
    data_type: "date",
    required: false,
    visibility: "admins",
    member_editable: false,
    show_in_directory: false,
    options: [],
  },
  {
    label: "Phone",
    key: "phone",
    data_type: "text",
    required: false,
    visibility: "admins",
    member_editable: true,
    show_in_directory: false,
    options: [],
  },
];

/** Common chapter fields offered to nationals in setup (setup-engine.md §6.2). */
export const STARTER_CHAPTER_ATTRIBUTES: readonly (Omit<AttributeInput, "options"> & {
  options: { value: string; label: string }[];
})[] = [
  {
    label: "Charter date",
    key: "charter_date",
    data_type: "date",
    required: false,
    visibility: "members",
    member_editable: false,
    show_in_directory: false,
    options: [],
  },
  {
    label: "Chapter number",
    key: "chapter_number",
    data_type: "text",
    required: false,
    visibility: "public",
    member_editable: false,
    show_in_directory: false,
    options: [],
  },
  {
    label: "Meeting place",
    key: "meeting_place",
    data_type: "text",
    required: false,
    visibility: "members",
    member_editable: false,
    show_in_directory: false,
    options: [],
  },
  {
    label: "Meeting schedule",
    key: "meeting_schedule",
    data_type: "text",
    required: false,
    visibility: "members",
    member_editable: false,
    show_in_directory: false,
    options: [],
  },
];

/** Convert a UI form value into the stored JSON value. */
export function coerceInput(type: AttributeType, raw: unknown): unknown {
  if (raw === "" || raw === undefined || raw === null) return null;
  if (type === "number") {
    const n = typeof raw === "number" ? raw : Number(String(raw).trim());
    return Number.isFinite(n) ? n : String(raw);
  }
  return raw;
}
