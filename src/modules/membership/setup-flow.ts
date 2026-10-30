import type { AttributeInput } from "@/engines/attributes";
import type { Answers, Flow, FlowContext } from "@/engines/setup";

/**
 * Membership setup flow v1 (setup-engine.md §6.1 basics, §6.2, §6.3 joining/grace).
 * Tier and price questions are added with E-11.
 */
export type MembershipPlan = {
  tax: { legal_name: string; ein: string; tax_status: string };
  attributes: (AttributeInput & { applies_to: "member" })[];
  settings: { key: string; value: unknown; mode: "override" | "locked" }[];
};

const isParent = (ctx: FlowContext) => ctx.orgType === "national" || ctx.orgType === "region";

export const TAX_STATUSES = [
  { value: "501(c)(3)", label: "501(c)(3) charity" },
  { value: "501(c)(19)", label: "501(c)(19) veterans organization" },
  { value: "501(c)(6)", label: "501(c)(6) business league" },
  { value: "other", label: "Other / not sure" },
];

export const membershipFlow: Flow<MembershipPlan> = {
  id: "membership",
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
      id: "joining",
      title: "Joining and renewals",
      questions: [
        {
          id: "approval_required",
          type: "boolean",
          label: "Must an admin approve new members before they join?",
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
          id: "lock_joining",
          type: "boolean",
          label: "Require every chapter to use these joining and grace rules?",
        },
        {
          id: "chapter_logo_allowed",
          type: "boolean",
          label: "May chapters upload their own logo?",
        },
      ],
    },
  ],
  defaults: (ctx) => ({
    legal_name: ctx.orgName,
    ein: "",
    tax_status: "",
    attributes: [],
    approval_required: false,
    grace_days: 30,
    lock_joining: false,
    chapter_logo_allowed: true,
  }),
  summarize: (a, ctx) => {
    const attrs = (a["attributes"] as AttributeInput[] | undefined) ?? [];
    const lines = [
      `Legal name: ${String(a["legal_name"] ?? "")}${a["ein"] ? ` (EIN ${String(a["ein"])})` : ""}`,
      `Tax status: ${TAX_STATUSES.find((t) => t.value === a["tax_status"])?.label ?? "not set"}`,
      attrs.length
        ? `Track ${attrs.length} member field${attrs.length === 1 ? "" : "s"}: ${attrs.map((x) => x.label).join(", ")}`
        : "No custom member fields yet",
      a["approval_required"]
        ? "New members need admin approval"
        : "New members join without approval",
      `Grace period: ${Number(a["grace_days"] ?? 0)} days`,
    ];
    if (isParent(ctx)) {
      lines.push(
        a["lock_joining"]
          ? "Chapters must use these joining rules"
          : "Chapters may set their own joining rules",
      );
      lines.push(
        a["chapter_logo_allowed"] === false
          ? "Chapters use your logo"
          : "Chapters may upload their own logo",
      );
    }
    return lines;
  },
  plan: (a, ctx) => {
    const mode = isParent(ctx) && a["lock_joining"] ? "locked" : "override";
    const settings: MembershipPlan["settings"] = [
      { key: "membership.approval_required", value: Boolean(a["approval_required"]), mode },
      { key: "membership.grace_days", value: Number(a["grace_days"] ?? 0), mode },
    ];
    if (isParent(ctx)) {
      settings.push({
        key: "branding.chapter_logo_allowed",
        value: a["chapter_logo_allowed"] !== false,
        mode: "locked",
      });
    }
    return {
      tax: {
        legal_name: String(a["legal_name"] ?? "").trim(),
        ein: String(a["ein"] ?? "").trim(),
        tax_status: String(a["tax_status"] ?? ""),
      },
      attributes: ((a["attributes"] as AttributeInput[] | undefined) ?? []).map((x) => ({
        ...x,
        applies_to: "member" as const,
      })),
      settings,
    };
  },
};

export function initialAnswers(saved: Answers | null | undefined, ctx: FlowContext): Answers {
  return { ...membershipFlow.defaults(ctx), ...(saved ?? {}) };
}
