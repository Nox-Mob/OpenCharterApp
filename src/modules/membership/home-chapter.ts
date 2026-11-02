import { queryOptions } from "@tanstack/react-query";
import { db } from "@/lib/db/pending-schema";

/**
 * Membership model (A8, D-166, migration 0030). A national chooses once, for its whole tree:
 * - "separate": the national and each chapter have their own memberships (the default);
 * - "home_chapter": one membership at the national, and the member picks one chapter (or none)
 *   they belong to, changing it whenever they like.
 * In the home-chapter model the chosen chapter gets a member record that stands for the national
 * membership, so its Members page, directory, board and reports keep working; standing comes
 * from the national membership.
 */
export type MembershipModel = "separate" | "home_chapter";

/** Plain-language comparison shown wherever the model is chosen (org creation, Settings). */
export type ModelGuide = {
  value: MembershipModel;
  label: string;
  explanation: string;
  /** Short rows for the side-by-side comparison. */
  facts: { joining: string; dues: string; chapters: string; moving: string };
  goodFit: readonly string[];
  example: string;
};

export const MODEL_CHOICES: readonly ModelGuide[] = [
  {
    value: "separate",
    label: "Separate memberships",
    explanation:
      "Your national organization and each chapter have their own memberships. A person can be a member of both, each with its own level, dues and standing, and chapters can charge their own dues.",
    facts: {
      joining: "People join the national, a chapter, or both, on each one's own join page.",
      dues: "Each organization sets and collects its own dues; a member of both pays twice, one receipt each. You can require national membership for chapter members.",
      chapters: "Each chapter has its own members, levels, prices and standing.",
      moving: "Changing chapter means leaving one chapter's membership and joining another's.",
    },
    goodFit: [
      "Chapters are separate legal or tax entities that run their own finances",
      "Some people belong to a chapter without joining the national, or the other way round",
      "Chapters want their own membership levels and prices",
    ],
    example: "A federation of local clubs that each collect their own dues.",
  },
  {
    value: "home_chapter",
    label: "National membership with a home chapter",
    explanation:
      "People join the national organization only, with one membership and one payment. Each member picks the chapter they belong to (or none) and can change it whenever they like. Chapters see and serve the members who chose them, but don't sell memberships.",
    facts: {
      joining:
        "People join the national and pick their chapter on the same page (or none for now).",
      dues: "One membership and one payment, to the national. Chapters may bill optional local dues themselves (coming with invoicing).",
      chapters:
        "A chapter's members are the national members who chose it; their standing comes from the national membership.",
      moving: "Members switch chapter themselves, any time; the history is kept.",
    },
    goodFit: [
      "Membership is really in the national, and chapters are where members meet locally",
      "You want one price, one renewal date and one standing for everyone",
      "Members move around (for example military or professional associations) and should keep their membership",
    ],
    example:
      "The Signal Corps Regimental Association: members belong to the national and choose a local chapter, or the online chapter.",
  },
];

/** The choice when creating an organization: a model, or decide later (separate until then). */
export type ModelChoice = MembershipModel | "later";

export type ChapterOption = { id: string; name: string; slug: string };

export type HomeChapterInfo = {
  model: MembershipModel;
  org: { id: string; name: string; slug: string; type: string };
  national: { id: string; name: string; slug: string };
  at_large_chapter: string | null;
  chapters: ChapterOption[];
};

/** What a join page needs: the model, the national, its chapters and the at-large chapter. */
export const homeChapterInfoQuery = (slug: string) =>
  queryOptions({
    queryKey: ["home-chapter-info", slug],
    queryFn: async (): Promise<HomeChapterInfo | null> => {
      const { data, error } = await db.rpc("public_home_chapter_info", { _slug: slug });
      if (error) throw error;
      const v = data as Partial<HomeChapterInfo> | null;
      return v && typeof v === "object" && typeof v.model === "string" && Array.isArray(v.chapters)
        ? (v as HomeChapterInfo)
        : null;
    },
  });

/** The signed-in member's national membership and its home chapter (null = none). */
export const myHomeChapterQuery = (nationalId: string) =>
  queryOptions({
    queryKey: ["my-home-chapter", nationalId],
    queryFn: async (): Promise<{ membershipId: string; homeOrgId: string | null } | null> => {
      const { data: u } = await db.auth.getUser();
      if (!u.user) return null;
      const { data, error } = await db
        .from("memberships")
        .select(
          "id,home_org_id,status,org_member_profiles!memberships_profile_id_fkey!inner(user_id)",
        )
        .eq("org_id", nationalId)
        .eq("org_member_profiles.user_id", u.user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data || (data.status !== "active" && data.status !== "pending")) return null;
      return { membershipId: data.id, homeOrgId: data.home_org_id };
    },
  });

/** Chapters to offer, with the at-large chapter first and marked. */
export function chapterChoices(info: Pick<HomeChapterInfo, "chapters" | "at_large_chapter">) {
  const atLarge = info.chapters.find((c) => c.id === info.at_large_chapter);
  const rest = info.chapters.filter((c) => c.id !== info.at_large_chapter);
  return [
    ...(atLarge ? [{ ...atLarge, name: `${atLarge.name} (members at large)` }] : []),
    ...rest,
  ];
}

// ----- writes -----

/** The national's one-time choice (a trigger refuses any later change). */
export async function chooseMembershipModel(orgId: string, model: MembershipModel) {
  const { error } = await db
    .from("org_settings")
    .insert({ org_id: orgId, key: "membership.model", value: model, mode: "locked" });
  if (error) throw error;
}

export async function setAtLargeChapter(orgId: string, chapterId: string | null) {
  const { error } = await db.from("org_settings").upsert({
    org_id: orgId,
    key: "membership.at_large_chapter",
    value: chapterId ?? "",
    mode: "locked",
  });
  if (error) throw error;
}

export async function setHomeChapter(nationalId: string, chapterId: string | null) {
  const { error } = await db.rpc("set_home_chapter", {
    _national: nationalId,
    _chapter: sqlNull(chapterId),
  });
  if (error) throw error;
}

export async function setMemberHomeChapter(membershipId: string, chapterId: string | null) {
  const { error } = await db.rpc("set_member_home_chapter", {
    _membership: membershipId,
    _chapter: sqlNull(chapterId),
  });
  if (error) throw error;
}

/** SQL null for an argument the generated types mark as a plain string ("no chapter"). */
function sqlNull<T>(v: T | null): T {
  return v as T;
}

// The chapter picked on the join page, applied once the payment has created the membership.
const KEY = "opencharter.home-chapter";

export function rememberHomeChapter(nationalSlug: string, chapterId: string | null) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ nationalSlug, chapterId }));
  } catch {
    // private mode: the member picks the chapter on their overview instead
  }
}

export function takeRememberedHomeChapter(
  nationalSlug: string,
): { chapterId: string | null } | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { nationalSlug: string; chapterId: string | null };
    if (v.nationalSlug !== nationalSlug) return null;
    sessionStorage.removeItem(KEY);
    return { chapterId: v.chapterId };
  } catch {
    return null;
  }
}

export function homeChapterErrorMessage(message: string): string {
  const known: [string, string][] = [
    ["can't be changed once chosen", "The membership model can't be changed once chosen"],
    ["only a national", "Only a national organization chooses the membership model"],
    ["one of your chapters", "Pick one of your chapters"],
    ["isn't one of this organization's chapters", "Pick one of this organization's chapters"],
    ["join first", "Join first, then pick your chapter"],
    ["don't choose a chapter here", "Members don't choose a chapter in this organization"],
  ];
  return known.find(([k]) => message.includes(k))?.[1] ?? "Couldn't save the change";
}
