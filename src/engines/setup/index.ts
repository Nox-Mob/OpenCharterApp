/**
 * Setup engine (E-10, docs/setup-engine.md). A flow is a list of steps with
 * conditional visibility; answers are saved as drafts and turned into a plan
 * that public.apply_setup applies in one transaction.
 */
export type Answers = Record<string, unknown>;

type QuestionBody =
  | {
      id: string;
      type: "text";
      label: string;
      help?: string;
      required?: boolean;
      pattern?: RegExp;
      patternMessage?: string;
    }
  | {
      id: string;
      type: "number";
      label: string;
      help?: string;
      required?: boolean;
      min?: number;
      max?: number;
    }
  | { id: string; type: "boolean"; label: string; help?: string }
  | {
      id: string;
      type: "choice";
      label: string;
      help?: string;
      required?: boolean;
      options: { value: string; label: string }[];
    }
  | {
      id: string;
      type: "attributes";
      label: string;
      help?: string;
      /** What the fields describe; defaults to members. */
      subject?: "member" | "chapter";
    }
  | { id: string; type: "tiers"; label: string; help?: string }
  /** Board seats this org defines (governance flow). */
  | { id: string; type: "seats"; label: string; help?: string }
  /** This org's own term per seat, from its by-laws (governance flow, D-142). */
  | { id: string; type: "seat_terms"; label: string; help?: string };

/** A question; `when` hides it (and drops its answer) based on earlier answers or the org. */
export type Question = QuestionBody & { when?: (a: Answers, ctx: FlowContext) => boolean };

export type FlowContext = {
  orgType: string;
  orgName: string;
  /** False when a parent org manages membership levels for this org (D-123). */
  childLevelsAllowed?: boolean;
  /** Set when a parent org decides how this org's new members are accepted (D-130). */
  parentApproval?: "auto" | "review";
  /** Migration 0020 is applied: national and chapter dues rules can be set (D-146). */
  twoLevelDues?: boolean;
  /** Board setup: what applies at this org (from org_board and the parent's rules). */
  board?: {
    /** False when a parent turned off governance.chapter_extra_seats_allowed. */
    extraSeatsAllowed: boolean;
    /** Seats from parent orgs that apply here. */
    inherited: readonly {
      owner_org_id: string;
      key: string;
      title: string;
      term: { count: number; unit: "day" | "month" | "year" } | null;
    }[];
  };
};

export type Step = {
  id: string;
  title: string;
  description?: string;
  when?: (a: Answers, ctx: FlowContext) => boolean;
  questions: Question[];
};

export type Flow<P> = {
  id: string;
  /** Bumped when questions are added, so orgs that already applied see "new setup options" (§8). */
  version: number;
  title: string;
  description: string;
  steps: Step[];
  defaults: (ctx: FlowContext) => Answers;
  summarize: (a: Answers, ctx: FlowContext) => string[];
  plan: (a: Answers, ctx: FlowContext) => P;
  /** The version for an org type, when new questions only reach some orgs (default: version). */
  versionFor?: (ctx: Pick<FlowContext, "orgType" | "twoLevelDues">) => number;
  /** Checks answers the generic question rules can't (e.g. a list of seats); null when fine. */
  validate?: (a: Answers, ctx: FlowContext) => string | null;
};

export const flowVersion = (
  flow: Pick<Flow<unknown>, "version" | "versionFor">,
  ctx: Pick<FlowContext, "orgType" | "twoLevelDues">,
) => flow.versionFor?.(ctx) ?? flow.version;

export function visibleSteps(flow: Flow<unknown>, a: Answers, ctx: FlowContext): Step[] {
  return flow.steps.filter((s) => !s.when || s.when(a, ctx));
}

const isBlank = (v: unknown) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "");

export function visibleQuestions(step: Step, a: Answers, ctx?: FlowContext): Question[] {
  return step.questions.filter((q) => !q.when || !ctx || q.when(a, ctx));
}

export function validateStep(step: Step, a: Answers, ctx?: FlowContext): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const q of visibleQuestions(step, a, ctx)) {
    const v = a[q.id];
    if (q.type === "text") {
      if (q.required && isBlank(v)) errors[q.id] = `${q.label} is required`;
      else if (!isBlank(v) && q.pattern && !q.pattern.test(String(v)))
        errors[q.id] = q.patternMessage ?? "Invalid format";
    } else if (q.type === "number") {
      if (isBlank(v)) {
        if (q.required) errors[q.id] = `${q.label} is required`;
      } else if (typeof v !== "number" || !Number.isFinite(v)) errors[q.id] = "Enter a number";
      else if ((q.min !== undefined && v < q.min) || (q.max !== undefined && v > q.max))
        errors[q.id] = `Enter a number from ${q.min ?? "-∞"} to ${q.max ?? "∞"}`;
    } else if (q.type === "choice") {
      if (q.required && isBlank(v)) errors[q.id] = `${q.label} is required`;
      else if (!isBlank(v) && !q.options.some((o) => o.value === v))
        errors[q.id] = "Pick one of the options";
    }
  }
  return errors;
}

/** Drop answers to steps that are no longer visible so stale answers never reach the plan. */
export function pruneAnswers(flow: Flow<unknown>, a: Answers, ctx: FlowContext): Answers {
  const keep = new Set(
    visibleSteps(flow, a, ctx).flatMap((s) => visibleQuestions(s, a, ctx).map((q) => q.id)),
  );
  return Object.fromEntries(Object.entries(a).filter(([k]) => keep.has(k)));
}

export type ItemDiff = { key: string; label: string; change: "add" | "update" | "same" };

/** Plain-language diff of attributes the plan would create vs what exists. */
export function diffByKey(
  planned: readonly { key: string; label: string; options?: { value: string }[] }[],
  existing: readonly { key: string; label: string; options?: { value: string }[] }[],
): ItemDiff[] {
  const byKey = new Map(existing.map((e) => [e.key, e]));
  return planned.map((p) => {
    const e = byKey.get(p.key);
    if (!e) return { key: p.key, label: p.label, change: "add" };
    const sameOpts =
      JSON.stringify((p.options ?? []).map((o) => o.value)) ===
      JSON.stringify((e.options ?? []).map((o) => o.value));
    return {
      key: p.key,
      label: p.label,
      change: e.label === p.label && sameOpts ? "same" : "update",
    };
  });
}
