import type { Condition } from "@/engines/rules";
import { forSubject, type AttributeInput, type AttributeSubject } from "@/engines/attributes";
import { describeTier, formatPrice, type Tier } from "./tiers";
import type { Answers, Flow, FlowContext } from "@/engines/setup";

/**
 * Membership setup flow (setup-engine.md §6.1 basics, §6.2 incl. chapter fields,
 * §6.3 levels, terms and prices, joining/grace).
 * v2 (E-11) added membership levels and the "may chapters create their own levels" rule.
 * v3 (E-13b) splits joining rules: chapter acceptance is its own 3-way rule (D-130) and
 * "lock" now covers only the grace period.
 * v4 (E-18) adds two-level dues for parents (D-146): chapter members also pay national dues,
 * chapter dues required or not, and a price range for chapter dues. Asked only once migration
 * 0020 is applied (ctx.twoLevelDues).
 */
export type TierPlan = {
  key: string;
  name: string;
  description: string;
  tax_treatment: Tier["tax_treatment"];
  terms: {
    key: string;
    label: string;
    length_count: number | null;
    length_unit: "day" | "month" | "year" | null;
    price_minor: number;
    currency: string;
  }[];
};
/** A pricing rule in Membership setup (A6, D-177), by level and term key; matched by label. */
export type PricingRuleAnswer = {
  tier_key: string;
  term_key: string;
  label: string;
  conditions: Condition[];
  price_minor: number | null;
  discount_pct: number | null;
};

export type MembershipPlan = {
  tax: { legal_name: string; ein: string; tax_status: string };
  attributes: (AttributeInput & { applies_to: AttributeSubject })[];
  settings: { key: string; value: unknown; mode: "override" | "locked" }[];
  tiers?: TierPlan[];
  pricing_rules?: (PricingRuleAnswer & { sort_order: number })[];
};

export type ChapterAcceptance = "auto" | "review" | "chapter";
export const CHAPTER_ACCEPTANCE: { value: ChapterAcceptance; label: string }[] = [
  { value: "auto", label: "Accepted automatically" },
  { value: "review", label: "Always reviewed by an admin" },
  { value: "chapter", label: "Each chapter decides" },
];
const CHAPTER_ACCEPTANCE_SUMMARY: Record<ChapterAcceptance, string> = {
  auto: "New chapter members are accepted automatically",
  review: "New chapter members are always reviewed by an admin",
  chapter: "Each chapter decides whether new members need approval",
};

const isParent = (ctx: FlowContext) => ctx.orgType === "national" || ctx.orgType === "region";
/** Home-chapter model (D-166, D-184): members belong to the national, not to chapters. */
const home = (ctx: FlowContext) => ctx.homeChapter === true;
/** A chapter (or region) under a home-chapter national: no members of its own to accept. */
const homeSub = (ctx: FlowContext) => home(ctx) && ctx.orgType !== "national";
const ownsLevels = (ctx: FlowContext) => ctx.childLevelsAllowed !== false && !homeSub(ctx);
const pricingStep = (ctx: FlowContext) => ownsLevels(ctx) && ctx.setupPricing === true;
const twoLevel = (ctx: FlowContext) => isParent(ctx) && ctx.twoLevelDues === true && !home(ctx);
const chaptersCharge = (a: Answers) => a["child_levels_allowed"] !== false;
/** Dollars typed in setup → cents stored in settings (0 = no limit). */
const toMinor = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v * 100) : 0;

export const TAX_STATUSES = [
  { value: "501(c)(3)", label: "501(c)(3) charity" },
  { value: "501(c)(19)", label: "501(c)(19) veterans organization" },
  { value: "501(c)(6)", label: "501(c)(6) business league" },
  { value: "other", label: "Other / not sure" },
];

export const membershipFlow: Flow<MembershipPlan> = {
  id: "membership",
  version: 4,
  // v4's questions are for nationals and regions, once 0020 is applied; others stay on v3.
  versionFor: (ctx) => (twoLevel(ctx as FlowContext) ? 4 : 3),
  title: "Membership setup",
  description:
    "Tell us about your organization, what you track about members, and how joining works.",
  steps: [
    {
      id: "about",
      title: "About your organization",
      description: "Used on receipts and official records.",
      questions: [
        { id: "legal_name", type: "text", label: "Legal name", required: true },
        {
          id: "ein",
          type: "text",
          label: "EIN",
          help: "Format 12-3456789. Leave blank if you don't have one yet.",
          pattern: /^\d{2}-\d{7}$/,
          patternMessage: "EIN must look like 12-3456789",
        },
        {
          id: "tax_status",
          type: "choice",
          label: "Tax status",
          required: true,
          options: TAX_STATUSES,
        },
      ],
    },
    {
      id: "attributes",
      title: "What do you want to track about each member?",
      description: "Pick common fields or create your own. You can change these later.",
      questions: [{ id: "attributes", type: "attributes", label: "Member fields" }],
    },
    {
      id: "chapter_fields",
      title: "What do you want to track about each chapter?",
      description:
        "For example its charter date. Chapter admins fill these in, and required ones are asked for when a chapter is created.",
      when: (_a, ctx) => isParent(ctx),
      questions: [
        {
          id: "chapter_attributes",
          type: "attributes",
          label: "Chapter fields",
          subject: "chapter",
        },
      ],
    },
    {
      id: "levels",
      title: "Membership levels",
      description:
        "The levels people can join at, how long each membership lasts, and what it costs. You can change these later.",
      when: (_a, ctx) => ownsLevels(ctx),
      questions: [{ id: "tiers", type: "tiers", label: "Membership levels" }],
    },
    {
      id: "pricing",
      title: "Prices by member fields",
      description:
        "Optional: charge some members a different price, for example by rank or for veterans. The first matching rule sets the price; everyone else pays the term's price.",
      when: (_a, ctx) => pricingStep(ctx),
      questions: [{ id: "pricing_rules", type: "pricing_rules", label: "Pricing rules" }],
    },
    {
      id: "joining",
      title: "Joining and renewals",
      // In the home-chapter model a chapter's members join the national (D-184).
      when: (_a, ctx) => !homeSub(ctx),
      questions: [
        {
          id: "approval_required",
          type: "boolean",
          label: "Must an admin approve new members before they join?",
          // Hidden when a parent organization already decides it for this org (D-130).
          when: (_a, ctx) => !ctx.parentApproval,
        },
        {
          id: "grace_days",
          type: "number",
          label: "Grace period after a membership expires (days)",
          required: true,
          min: 0,
          max: 365,
          help: "Members keep their standing during this time.",
        },
      ],
    },
    {
      id: "chapters",
      title: "Rules for your chapters",
      when: (_a, ctx) => isParent(ctx),
      questions: [
        {
          id: "chapter_acceptance",
          type: "choice",
          label: "How are new members of your chapters accepted?",
          required: true,
          options: CHAPTER_ACCEPTANCE,
          when: (_a, ctx) => !home(ctx),
        },
        {
          id: "lock_joining",
          type: "boolean",
          label: "Require every chapter to use this grace period?",
          when: (_a, ctx) => !home(ctx),
        },
        {
          id: "chapter_logo_allowed",
          type: "boolean",
          label: "May chapters upload their own logo?",
        },
        {
          id: "child_levels_allowed",
          type: "boolean",
          label: "May chapters create their own membership levels?",
          help: "When off, chapters use your levels and can't add their own.",
          when: (_a, ctx) => !home(ctx),
        },
        {
          id: "national_dues_required",
          type: "boolean",
          label: "Do chapter members also need a membership with your organization?",
          help: "If yes, joining a chapter takes two payments: your dues first, then the chapter's.",
          when: (_a, ctx) => twoLevel(ctx),
        },
        {
          id: "chapter_dues_required",
          type: "boolean",
          label: "Must every chapter sell its own memberships, on top of yours?",
          when: (a, ctx) => twoLevel(ctx) && chaptersCharge(a),
        },
        {
          id: "chapter_dues_min",
          type: "number",
          label: "Lowest price a chapter may charge ($)",
          help: "Leave empty for no minimum.",
          min: 0,
          max: 1000000,
          when: (a, ctx) => twoLevel(ctx) && chaptersCharge(a),
        },
        {
          id: "chapter_dues_max",
          type: "number",
          label: "Highest price a chapter may charge ($)",
          help: "Leave empty for no maximum.",
          min: 0,
          max: 1000000,
          when: (a, ctx) => twoLevel(ctx) && chaptersCharge(a),
        },
      ],
    },
  ],
  defaults: (ctx) => ({
    legal_name: ctx.orgName,
    ein: "",
    tax_status: "",
    attributes: [],
    chapter_attributes: [],
    tiers: [],
    pricing_rules: [],
    child_levels_allowed: true,
    approval_required: false,
    grace_days: 30,
    lock_joining: false,
    chapter_acceptance: "chapter",
    chapter_logo_allowed: true,
    national_dues_required: false,
    chapter_dues_required: false,
    chapter_dues_min: null,
    chapter_dues_max: null,
  }),
  validate: (a, ctx) => {
    if (!twoLevel(ctx) || !chaptersCharge(a)) return null;
    const min = toMinor(a["chapter_dues_min"]);
    const max = toMinor(a["chapter_dues_max"]);
    return min && max && min > max ? "The lowest chapter price is above the highest" : null;
  },
  summarize: (a, ctx) => {
    const attrs = (a["attributes"] as AttributeInput[] | undefined) ?? [];
    const lines = [
      `Legal name: ${String(a["legal_name"] ?? "")}${a["ein"] ? ` (EIN ${String(a["ein"])})` : ""}`,
      `Tax status: ${TAX_STATUSES.find((t) => t.value === a["tax_status"])?.label ?? "not set"}`,
      attrs.length
        ? `Track ${attrs.length} member field${attrs.length === 1 ? "" : "s"}: ${attrs.map((x) => x.label).join(", ")}`
        : "No custom member fields yet",
      homeSub(ctx)
        ? "Members join your national organization, which handles approval and renewals"
        : ctx.parentApproval
          ? ctx.parentApproval === "auto"
            ? "New members are accepted automatically (set by your parent organization)"
            : "New members are reviewed by an admin (set by your parent organization)"
          : a["approval_required"]
            ? "New members need admin approval"
            : "New members join without approval",
      ...(homeSub(ctx) ? [] : [`Grace period: ${Number(a["grace_days"] ?? 0)} days`]),
    ];
    if (ownsLevels(ctx)) {
      const tiers = (a["tiers"] as Tier[] | undefined) ?? [];
      lines.push(...(tiers.length ? tiers.map(describeTier) : ["No membership levels yet"]));
      if (pricingStep(ctx)) {
        const n = pricingPlan((a["pricing_rules"] as PricingRuleAnswer[]) ?? [], a).length;
        lines.push(
          n ? `${n} pricing rule${n === 1 ? "" : "s"} by member fields` : "No pricing rules",
        );
      }
    } else {
      lines.push(
        homeSub(ctx)
          ? "Membership levels are your national organization's"
          : "Membership levels come from your parent organization",
      );
    }
    if (isParent(ctx)) {
      const chapterAttrs = (a["chapter_attributes"] as AttributeInput[] | undefined) ?? [];
      lines.push(
        chapterAttrs.length
          ? `Track ${chapterAttrs.length} chapter field${chapterAttrs.length === 1 ? "" : "s"}: ${chapterAttrs.map((x) => x.label).join(", ")}`
          : "No chapter fields yet",
      );
      if (!home(ctx)) {
        lines.push(
          CHAPTER_ACCEPTANCE_SUMMARY[(a["chapter_acceptance"] as ChapterAcceptance) ?? "chapter"],
        );
        lines.push(
          a["lock_joining"]
            ? "Chapters must use your grace period"
            : "Chapters may set their own grace period",
        );
      }
      lines.push(
        a["chapter_logo_allowed"] === false
          ? "Chapters use your logo"
          : "Chapters may upload their own logo",
      );
      if (!home(ctx))
        lines.push(
          a["child_levels_allowed"] === false
            ? "Chapters use your membership levels"
            : "Chapters may create their own membership levels",
        );
      if (twoLevel(ctx)) {
        lines.push(
          a["national_dues_required"]
            ? "Chapter members also pay your dues (two payments when they join a chapter)"
            : "Chapter members don't need a membership with your organization",
        );
        if (chaptersCharge(a)) {
          const min = toMinor(a["chapter_dues_min"]);
          const max = toMinor(a["chapter_dues_max"]);
          if (a["chapter_dues_required"]) lines.push("Every chapter must charge its own dues");
          if (min || max)
            lines.push(
              `Chapter prices: ${min ? `at least ${formatPrice(min)}` : "no minimum"}, ${
                max ? `at most ${formatPrice(max)}` : "no maximum"
              }`,
            );
        }
      }
    }
    return lines;
  },
  plan: (a, ctx) => {
    const graceMode = isParent(ctx) && !home(ctx) && a["lock_joining"] ? "locked" : "override";
    // A chapter under a home-chapter national has no joining rules of its own (D-184).
    const settings: MembershipPlan["settings"] = homeSub(ctx)
      ? []
      : [{ key: "membership.grace_days", value: Number(a["grace_days"] ?? 0), mode: graceMode }];
    // The org's own approval choice; a parent's acceptance rule overrides it when set (D-130).
    if (!ctx.parentApproval && !homeSub(ctx))
      settings.unshift({
        key: "membership.approval_required",
        value: Boolean(a["approval_required"]),
        mode: "override",
      });
    if (isParent(ctx)) {
      if (!home(ctx))
        settings.push({
          key: "membership.child_approval",
          value: ((a["chapter_acceptance"] as ChapterAcceptance) ?? "chapter") as string,
          mode: "locked",
        });
      settings.push({
        key: "branding.chapter_logo_allowed",
        value: a["chapter_logo_allowed"] !== false,
        mode: "locked",
      });
      if (!home(ctx))
        settings.push({
          key: "membership.child_levels_allowed",
          value: a["child_levels_allowed"] !== false,
          mode: "locked",
        });
      if (twoLevel(ctx)) {
        const charge = chaptersCharge(a);
        settings.push(
          {
            key: "membership.national_dues_required",
            value: a["national_dues_required"] === true,
            mode: "locked",
          },
          {
            key: "membership.chapter_dues",
            value: !charge ? "none" : a["chapter_dues_required"] ? "required" : "optional",
            mode: "locked",
          },
          {
            key: "membership.chapter_dues_min_minor",
            value: charge ? toMinor(a["chapter_dues_min"]) : 0,
            mode: "locked",
          },
          {
            key: "membership.chapter_dues_max_minor",
            value: charge ? toMinor(a["chapter_dues_max"]) : 0,
            mode: "locked",
          },
        );
      }
    }
    return {
      tax: {
        legal_name: String(a["legal_name"] ?? "").trim(),
        ein: String(a["ein"] ?? "").trim(),
        tax_status: String(a["tax_status"] ?? ""),
      },
      attributes: [
        ...((a["attributes"] as AttributeInput[] | undefined) ?? []).map((x) => ({
          ...x,
          applies_to: "member" as const,
        })),
        ...(isParent(ctx)
          ? ((a["chapter_attributes"] as AttributeInput[] | undefined) ?? [])
          : []
        ).map((x) => ({ ...forSubject(x, "chapter"), applies_to: "chapter" as const })),
      ],
      settings,
      // Left out entirely when a parent manages levels, so setup never touches them.
      ...(ownsLevels(ctx)
        ? { tiers: ((a["tiers"] as Tier[] | undefined) ?? []).map(toTierPlan) }
        : {}),
      ...(pricingStep(ctx)
        ? { pricing_rules: pricingPlan((a["pricing_rules"] as PricingRuleAnswer[]) ?? [], a) }
        : {}),
    };
  },
};

/** Rules for terms that are still in the plan, numbered in order within each term. */
export function pricingPlan(rules: readonly PricingRuleAnswer[], a: Answers) {
  const terms = new Set(
    ((a["tiers"] as Tier[] | undefined) ?? []).flatMap((t) =>
      t.terms.filter((x) => x.active !== false).map((x) => `${t.key}/${x.key}`),
    ),
  );
  const seen = new Map<string, number>();
  return rules
    .filter((r) => terms.has(`${r.tier_key}/${r.term_key}`) && r.label.trim())
    .map((r) => {
      const k = `${r.tier_key}/${r.term_key}`;
      const n = (seen.get(k) ?? 0) + 1;
      seen.set(k, n);
      return { ...r, label: r.label.trim(), sort_order: n };
    });
}

function toTierPlan(t: Tier): TierPlan {
  return {
    key: t.key,
    name: t.name.trim(),
    description: t.description.trim(),
    tax_treatment: t.tax_treatment,
    terms: t.terms
      .filter((x) => x.active !== false)
      .map((x) => ({
        key: x.key,
        label: x.label,
        length_count: x.length_count,
        length_unit: x.length_unit,
        price_minor: x.price_minor,
        currency: x.currency,
      })),
  };
}

export function initialAnswers(saved: Answers | null | undefined, ctx: FlowContext): Answers {
  const answers = { ...membershipFlow.defaults(ctx), ...(saved ?? {}) };
  // Before v3, "lock joining rules" also locked approval for chapters. Keep that meaning.
  if (saved && !("chapter_acceptance" in saved) && saved["lock_joining"] === true)
    answers["chapter_acceptance"] = saved["approval_required"] ? "review" : "auto";
  return answers;
}
