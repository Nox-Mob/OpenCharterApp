import { resolveSetting, SETTINGS, type SettingRow } from "@/engines/settings";
import { formatPrice } from "./tiers";
import type { MembershipModel } from "./home-chapter";

/**
 * "How membership works here" (D-203): for a national or standalone organization, the joining
 * rules that Membership setup asks about, in plain words, shown above its levels.
 */
export function membershipSummary(input: {
  orgId: string;
  orgType: string;
  model: MembershipModel;
  settings: readonly SettingRow[];
  /** Names of organizations by id, for the at-large chapter. */
  nameOf: (id: string) => string | undefined;
}): string[] {
  const { orgId, orgType, model, settings } = input;
  const ids = [orgId];
  const get = (key: string, fallback: unknown) =>
    resolveSetting(ids, settings, key, fallback).value;
  const hasChapters = orgType === "national" || orgType === "region";
  const lines: string[] = [];

  if (hasChapters)
    lines.push(
      model === "home_chapter"
        ? "Membership is held here, with a home chapter: members join this organization at one of the levels below and choose a chapter (or none). Chapters have no levels of their own."
        : "Separate memberships: this organization and each chapter have their own members and standing; people join here at the levels below.",
    );
  lines.push(
    get("membership.approval_required", false) === true
      ? "New members wait for an admin's approval."
      : "New members are accepted as soon as they've paid.",
  );
  const grace = Number(get("membership.grace_days", 30));
  lines.push(
    grace > 0
      ? `Members keep their standing for ${grace} day${grace === 1 ? "" : "s"} after their membership ends.`
      : "Standing ends the day the membership ends.",
  );

  if (hasChapters && model === "home_chapter") {
    const atLarge = get("membership.at_large_chapter", null);
    const name = typeof atLarge === "string" ? input.nameOf(atLarge) : undefined;
    if (name) lines.push(`Members without a local chapter are offered ${name}.`);
  }
  if (hasChapters && model === "separate") {
    const option = (key: string, value: unknown) =>
      SETTINGS.find((s) => s.key === key)?.options?.find((o) => o.value === value)?.label;
    const childLevels = get("membership.child_levels_allowed", true) !== false;
    const dues = String(get("membership.chapter_dues", "optional"));
    lines.push(
      !childLevels || dues === "none"
        ? "Chapters use these levels; they don't sell memberships of their own."
        : `Chapters may sell their own memberships too (${(option("membership.chapter_dues", dues) ?? dues).toLowerCase()}).`,
    );
    const min = Number(get("membership.chapter_dues_min_minor", 0));
    const max = Number(get("membership.chapter_dues_max_minor", 0));
    if (childLevels && dues !== "none" && (min || max))
      lines.push(
        `Chapter prices: ${min ? `at least ${formatPrice(min)}` : "no minimum"}, ${max ? `at most ${formatPrice(max)}` : "no maximum"}.`,
      );
    if (get("membership.national_dues_required", false) === true)
      lines.push(
        "Chapter members also need a membership here: two payments when they join a chapter.",
      );
    const acceptance = get("membership.child_approval", "chapter");
    lines.push(
      acceptance === "auto"
        ? "New chapter members are accepted automatically."
        : acceptance === "review"
          ? "New chapter members are always reviewed by an admin."
          : "Each chapter decides whether its new members need approval.",
    );
  }
  return lines;
}
