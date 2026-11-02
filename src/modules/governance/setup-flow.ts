import type { Answers, Flow, FlowContext } from "@/engines/setup";
import { seatKey, seatTermLabel, type SeatScope, type SeatTerm } from "./seats";

/**
 * Board setup flow (setup-engine.md §6.5, D-143). Defines this org's officer seats (a national
 * or region can define them for every chapter), the governance rules for chapters, and this
 * org's own term per seat from its by-laws (D-142). Applied by public.apply_setup (sections
 * seats, seat_terms, settings) in one transaction. Linked roles are set on the Board tab, not
 * here, so setup never grants access.
 */
export type SeatAnswer = {
  key: string;
  title: string;
  description: string;
  required: boolean;
  seat_count: number;
  term: SeatTerm;
  scope: SeatScope;
};

/** This org's term for one seat: keyed by `${owner_org_id}:${key}` (the seat may not exist yet). */
export type SeatTermAnswer = {
  term: SeatTerm;
  effective_from: string;
  bylaw_reference: string;
};

export type BoardPlan = {
  seats?: {
    key: string;
    title: string;
    description: string;
    required: boolean;
    seat_count: number;
    term_count: number | null;
    term_unit: "day" | "month" | "year" | null;
    scope: SeatScope;
    sort_order: number;
  }[];
  seat_terms: {
    owner_org_id: string;
    key: string;
    length_count: number | null;
    length_unit: "day" | "month" | "year" | null;
    effective_from: string;
    bylaw_reference: string;
  }[];
  settings: { key: string; value: unknown; mode: "override" | "locked" }[];
};

const isParent = (ctx: FlowContext) => ctx.orgType === "national" || ctx.orgType === "region";
const definesSeats = (ctx: FlowContext) => ctx.board?.extraSeatsAllowed !== false;

export const SEAT_PRESETS: readonly Omit<SeatAnswer, "scope">[] = [
  {
    key: "president",
    title: "President",
    description: "Leads the organization and its meetings",
    required: true,
    seat_count: 1,
    term: { count: 1, unit: "year" },
  },
  {
    key: "vice_president",
    title: "Vice President",
    description: "",
    required: false,
    seat_count: 1,
    term: { count: 1, unit: "year" },
  },
  {
    key: "secretary",
    title: "Secretary",
    description: "Keeps minutes and records",
    required: true,
    seat_count: 1,
    term: { count: 1, unit: "year" },
  },
  {
    key: "treasurer",
    title: "Treasurer",
    description: "Looks after the money and the books",
    required: true,
    seat_count: 1,
    term: { count: 1, unit: "year" },
  },
];

export function newSeat(title: string, scope: SeatScope): SeatAnswer {
  return {
    key: seatKey(title),
    title: title.trim(),
    description: "",
    required: false,
    seat_count: 1,
    term: { count: 1, unit: "year" },
    scope,
  };
}

/** Seats used at this org: inherited ones plus its own "self" seats from the answers. */
export function seatsUsedHere(a: Answers, ctx: FlowContext, orgId: string) {
  const own = ((a["seats"] as SeatAnswer[] | undefined) ?? [])
    .filter((s) => s.scope === "self")
    .map((s) => ({ owner_org_id: orgId, key: s.key, title: s.title, term: s.term }));
  return [...(ctx.board?.inherited ?? []), ...(definesSeats(ctx) ? own : [])];
}

export const termKeyOf = (owner: string, key: string) => `${owner}:${key}`;

export const boardFlow: Flow<BoardPlan> = {
  id: "board",
  version: 1,
  title: "Board setup",
  description: "Your officer seats, the rules for chapters, and the terms your by-laws set.",
  steps: [
    {
      id: "seats",
      title: "Officer seats",
      description:
        "The positions on your board. Pick common ones or add your own. You'll appoint people from the Board tab.",
      when: (_a, ctx) => definesSeats(ctx),
      questions: [{ id: "seats", type: "seats", label: "Seats" }],
    },
    {
      id: "rules",
      title: "Officer rules",
      questions: [
        {
          id: "officers_good_standing",
          type: "boolean",
          label: "Must officers be members in good standing?",
          help: "Checked whenever someone is appointed.",
        },
        {
          id: "lock_good_standing",
          type: "boolean",
          label: "Require this for every chapter?",
          when: (_a, ctx) => isParent(ctx),
        },
        {
          id: "custom_titles_allowed",
          type: "boolean",
          label: "May chapters rename the seats you define?",
          help: 'For example "Commander" instead of "President". The seat\'s access stays the same.',
          when: (_a, ctx) => isParent(ctx),
        },
        {
          id: "chapter_extra_seats_allowed",
          type: "boolean",
          label: "May chapters add their own seats?",
          when: (_a, ctx) => isParent(ctx),
        },
      ],
    },
    {
      id: "terms",
      title: "Terms from your by-laws",
      description:
        "How long each officer serves here, as your by-laws say. Changes are kept in each seat's term history.",
      questions: [{ id: "seat_terms", type: "seat_terms", label: "Terms" }],
    },
  ],
  validate: (a) => seatAnswersError((a["seats"] as SeatAnswer[] | undefined) ?? []),
  defaults: () => ({
    seats: [],
    seat_terms: {},
    officers_good_standing: true,
    lock_good_standing: false,
    custom_titles_allowed: true,
    chapter_extra_seats_allowed: true,
  }),
  summarize: (a, ctx) => {
    const seats = (a["seats"] as SeatAnswer[] | undefined) ?? [];
    const terms = (a["seat_terms"] as Record<string, SeatTermAnswer> | undefined) ?? {};
    const lines: string[] = [];
    if (definesSeats(ctx)) {
      lines.push(
        ...(seats.length
          ? seats.map(
              (s) =>
                `${s.title}${s.seat_count > 1 ? ` (${s.seat_count} seats)` : ""}${s.required ? ", required" : ""} · ${
                  s.scope === "chapters" ? "every chapter" : ctx.orgName
                } · suggested term ${seatTermLabel(s.term).toLowerCase()}`,
            )
          : ["No seats of your own"]),
      );
    } else lines.push("Your parent organization manages board seats");
    for (const [k, t] of Object.entries(terms)) {
      const title = [...(ctx.board?.inherited ?? []), ...seats].find((s) =>
        k.endsWith(`:${s.key}`),
      )?.title;
      if (title)
        lines.push(
          `${title} term here: ${seatTermLabel(t.term).toLowerCase()} from ${t.effective_from}${
            t.bylaw_reference ? ` (${t.bylaw_reference})` : ""
          }`,
        );
    }
    lines.push(
      a["officers_good_standing"] === false
        ? "Officers don't have to be in good standing"
        : "Officers must be members in good standing",
    );
    if (isParent(ctx)) {
      lines.push(
        a["custom_titles_allowed"] === false
          ? "Chapters use your seat titles"
          : "Chapters may rename your seats",
      );
      lines.push(
        a["chapter_extra_seats_allowed"] === false
          ? "Chapters use only your seats"
          : "Chapters may add their own seats",
      );
    }
    return lines;
  },
  plan: (a, ctx) => {
    const seats = (a["seats"] as SeatAnswer[] | undefined) ?? [];
    const terms = (a["seat_terms"] as Record<string, SeatTermAnswer> | undefined) ?? {};
    const settings: BoardPlan["settings"] = [
      {
        key: "governance.officers_good_standing",
        value: a["officers_good_standing"] !== false,
        mode: isParent(ctx) && a["lock_good_standing"] === true ? "locked" : "override",
      },
    ];
    if (isParent(ctx)) {
      settings.push(
        {
          key: "governance.custom_titles_allowed",
          value: a["custom_titles_allowed"] !== false,
          mode: "locked",
        },
        {
          key: "governance.chapter_extra_seats_allowed",
          value: a["chapter_extra_seats_allowed"] !== false,
          mode: "locked",
        },
      );
    }
    return {
      // Left out when the parent manages seats, so setup never tries to add any.
      ...(definesSeats(ctx)
        ? {
            seats: seats.map((s, i) => ({
              key: s.key,
              title: s.title.trim(),
              description: s.description.trim(),
              required: s.required,
              seat_count: s.seat_count,
              term_count: s.term?.count ?? null,
              term_unit: s.term?.unit ?? null,
              scope: isParent(ctx) ? s.scope : "self",
              sort_order: (i + 1) * 10,
            })),
          }
        : {}),
      seat_terms: Object.entries(terms).map(([k, t]) => {
        const i = k.indexOf(":");
        return {
          owner_org_id: k.slice(0, i),
          key: k.slice(i + 1),
          length_count: t.term?.count ?? null,
          length_unit: t.term?.unit ?? null,
          effective_from: t.effective_from,
          bylaw_reference: t.bylaw_reference.trim(),
        };
      }),
      settings,
    };
  },
};

/** Seat answers that are invalid, as one message (null when fine). */
export function seatAnswersError(seats: readonly SeatAnswer[]): string | null {
  const keys = new Set<string>();
  for (const s of seats) {
    if (!s.title.trim()) return "Give every seat a title";
    if (s.seat_count < 1 || s.seat_count > 50) return `${s.title}: 1 to 50 seats`;
    if (s.term && (s.term.count < 1 || s.term.count > 100)) return `${s.title}: check the term`;
    if (keys.has(s.key)) return `Two seats are called ${s.title}`;
    keys.add(s.key);
  }
  return null;
}
