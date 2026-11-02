import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import type { Org } from "@/lib/orgs";
import { attributeDefsQuery, memberValuesQuery } from "@/modules/attributes/queries";
import { firstValueError, saveAttributeValues } from "@/modules/attributes/values";
import { boardContactsQuery, boardQuery, type BoardContact } from "@/modules/governance/seats";
import { useFeatureReady } from "@/lib/db/readiness";
import { graceDaysQuery, myMembershipQuery } from "@/modules/membership/memberships";
import { today } from "@/modules/membership/standing";
import {
  contactEmailQuery,
  formatFieldValue,
  memberActions,
  missingRequiredFields,
  myProfileQuery,
  myRolesQuery,
  mySeats,
  officers,
  type ActionTone,
} from "@/modules/members/my-overview";
import { AttributeValueInput } from "@/components/attributes/attribute-value-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  chapterChoices,
  homeChapterErrorMessage,
  homeChapterInfoQuery,
  myHomeChapterQuery,
  setHomeChapter,
} from "@/modules/membership/home-chapter";

const NO_CHAPTER = "__none";

const card = "rounded-md border bg-card p-5";

/**
 * A member's own view of an org on its Overview (D-153): actions needed, their profile, their
 * roles and seats, and who to contact. Shown to everyone with a member record here, admins
 * included (it's about them, not the org).
 */
export function MemberOverview({ org, orgs }: { org: Org; orgs: readonly Org[] }) {
  const profile = useQuery(myProfileQuery(org.id));
  if (profile.isLoading) return null;
  const me = profile.data;
  return (
    <div className="space-y-6">
      {me && <ActionsNeeded org={org} profileId={me.id} />}
      <div className="grid gap-6 lg:grid-cols-2">
        {me && <YourChapterCard org={org} />}
        {me && (
          <MyProfileCard org={org} profileId={me.id} name={me.display_name} email={me.email} />
        )}
        {me && <MyRolesCard org={org} profileId={me.id} />}
        <WhoToContact org={org} orgs={orgs} />
      </div>
    </div>
  );
}

const TONE: Record<
  ActionTone,
  { label: string; variant: "destructive" | "default" | "secondary" }
> = {
  urgent: { label: "Now", variant: "destructive" },
  soon: { label: "Soon", variant: "default" },
  info: { label: "Note", variant: "secondary" },
};

function ActionsNeeded({ org, profileId }: { org: Org; profileId: string }) {
  const mine = useQuery(myMembershipQuery(org.id));
  const grace = useQuery(graceDaysQuery(org.id));
  const defs = useQuery(attributeDefsQuery(org.id, org.ancestor_ids));
  const values = useQuery(memberValuesQuery(profileId));
  const board = useQuery(boardQuery(org.id));
  const home = useHomeChapter(org);
  if (mine.isLoading || grace.isLoading || defs.isLoading || values.isLoading) return null;
  const memberDefs = (defs.data ?? []).filter((d) => d.applies_to === "member" && d.active);
  const actions = memberActions({
    hasProfile: true,
    membership: mine.data ?? null,
    graceDays: grace.data ?? 30,
    on: today(),
    missingRequired: missingRequiredFields(memberDefs, values.data ?? {}),
    seats: mySeats(board.data ?? [], profileId),
    noChapter: home.applies && home.mine !== null && home.mine.homeOrgId === null,
  });
  return (
    <section className={card} aria-labelledby="actions-heading">
      <h2 id="actions-heading" className="text-lg font-semibold">
        Actions needed
      </h2>
      {actions.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">You're all set. Nothing needs doing.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {actions.map((a) => (
            <li key={a.key} className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={TONE[a.tone].variant}>{TONE[a.tone].label}</Badge>
              <span className="flex-1">{a.text}</span>
              {a.cta === "join" && (
                <Button asChild size="sm" variant="outline">
                  <Link to="/join/$orgSlug" params={{ orgSlug: org.slug }}>
                    Join
                  </Link>
                </Button>
              )}
              {a.cta === "renew" && (
                <Button asChild size="sm" variant="outline">
                  <a href="#my-membership">Renew</a>
                </Button>
              )}
              {a.cta === "chapter" && (
                <Button asChild size="sm" variant="outline">
                  <a href="#my-chapter">Choose a chapter</a>
                </Button>
              )}
              {a.cta === "profile" && (
                <Button asChild size="sm" variant="outline">
                  <a href="#my-profile">Update profile</a>
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MyProfileCard({
  org,
  profileId,
  name,
  email,
}: {
  org: Org;
  profileId: string;
  name: string;
  email: string;
}) {
  const qc = useQueryClient();
  const defs = useQuery(attributeDefsQuery(org.id, org.ancestor_ids));
  const values = useQuery(memberValuesQuery(profileId));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(values.data ?? {}), [values.data]);
  // Admin-only fields are hidden from members by RLS; don't show them as empty.
  const shown = (defs.data ?? []).filter(
    (d) => d.applies_to === "member" && d.active && d.visibility !== "admins",
  );
  const editable = shown.filter((d) => d.member_editable);

  async function save() {
    const err = firstValueError(editable, draft);
    if (err) return void toast.error(err);
    setBusy(true);
    try {
      await saveAttributeValues(editable, profileId, draft, values.data);
      toast.success("Profile saved");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["attribute-values", profileId] });
    } catch {
      toast.error("Couldn't save your profile");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="my-profile" className={card} aria-labelledby="profile-heading">
      <div className="flex items-center justify-between gap-2">
        <h2 id="profile-heading" className="text-lg font-semibold">
          Your profile
        </h2>
        {editable.length > 0 && !editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Name</dt>
        <dd>{name || "—"}</dd>
        <dt className="text-muted-foreground">Email</dt>
        <dd className="break-words">{email || "—"}</dd>
        {!editing &&
          shown.map((d) => (
            <div key={d.id} className="contents">
              <dt className="text-muted-foreground">{d.label}</dt>
              <dd>{formatFieldValue(d, values.data?.[d.id])}</dd>
            </div>
          ))}
      </dl>
      {editing && (
        <div className="mt-4 space-y-3">
          {editable.map((d) => (
            <div key={d.id} className="space-y-1">
              <Label>
                {d.label}
                {d.required ? " *" : ""}
              </Label>
              <AttributeValueInput
                def={d}
                value={draft[d.id]}
                onChange={(v) => setDraft({ ...draft, [d.id]: v })}
              />
            </div>
          ))}
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(values.data ?? {});
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {shown.length > editable.length && (
        <p className="mt-3 text-xs text-muted-foreground">
          Some fields are kept by the organization. Ask an admin to change them.
        </p>
      )}
    </section>
  );
}

function MyRolesCard({ org, profileId }: { org: Org; profileId: string }) {
  const roles = useQuery(myRolesQuery(org.id));
  const board = useQuery(boardQuery(org.id));
  const seats = mySeats(board.data ?? [], profileId);
  // "Member" is everyone's baseline role; list it only when it's all they have.
  const named = (roles.data ?? []).filter((r) => r.name);
  const extra = named.filter((r) => r.name.toLowerCase() !== "member");
  return (
    <section className={card} aria-labelledby="roles-heading">
      <h2 id="roles-heading" className="text-lg font-semibold">
        Your roles and seats
      </h2>
      <div className="mt-3 space-y-3 text-sm">
        <div>
          <p className="text-muted-foreground">Board seats</p>
          {seats.length === 0 ? (
            <p>You don't hold a seat on the board.</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {seats.map((s) => (
                <li key={`${s.title}:${s.seat_number}`}>
                  <span className="font-medium">{s.title}</span>
                  {s.seat_count > 1 && ` (seat ${s.seat_number})`}
                  <span className="text-muted-foreground">
                    {" "}
                    · since {s.starts_on}
                    {s.planned_end ? `, until ${s.planned_end}` : ", no fixed end"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-muted-foreground">Roles</p>
          {named.length === 0 ? (
            <p>None in {org.name}.</p>
          ) : (
            <div className="mt-1 flex flex-wrap gap-1">
              {(extra.length ? extra : named).map((r) => (
                <Badge key={r.id} variant="secondary">
                  {r.name}
                  {r.source === "seat" && " (from a seat)"}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Officers and how to reach them (D-156): each seat shows its role email if the org set one,
 * otherwise the officer's own email. Before migration 0026 it lists names only.
 */
function WhoToContact({ org, orgs }: { org: Org; orgs: readonly Org[] }) {
  const contactsReady = useFeatureReady("seat_contacts") === true;
  const board = useQuery({ ...boardQuery(org.id), enabled: !contactsReady });
  const contacts = useQuery({ ...boardContactsQuery(org.id), enabled: contactsReady });
  const contact = useQuery(contactEmailQuery(org.id, org.ancestor_ids));
  const list: BoardContact[] = contactsReady
    ? (contacts.data ?? [])
    : officers(board.data ?? []).map((o) => ({ ...o, email: null, source: "none" as const }));
  const loading = contactsReady ? contacts.isLoading : board.isLoading;
  const from = contact.data?.fromOrgId
    ? orgs.find((o) => o.id === contact.data!.fromOrgId)
    : undefined;
  return (
    <section className={card} aria-labelledby="contact-heading">
      <h2 id="contact-heading" className="text-lg font-semibold">
        Board and who to contact
      </h2>
      {contact.data?.email && (
        <p className="mt-2 text-sm">
          General email{" "}
          <a className="text-primary hover:underline" href={`mailto:${contact.data.email}`}>
            {contact.data.email}
          </a>
          {from && from.id !== org.id && (
            <span className="text-muted-foreground"> ({from.name})</span>
          )}
        </p>
      )}
      {loading ? null : list.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No officers are listed yet.</p>
      ) : (
        <dl className="mt-3 grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          {list.map((o) => (
            <div key={o.key} className="contents">
              <dt className="text-muted-foreground">{o.title}</dt>
              <dd className="min-w-0">
                {o.name ?? <span className="text-muted-foreground">Vacant</span>}
                {o.email && (
                  <a
                    className="block break-words text-primary hover:underline"
                    href={`mailto:${o.email}`}
                  >
                    {o.email}
                  </a>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/** Home-chapter model state for a national's overview (A8): does it apply, and my choice. */
function useHomeChapter(org: Org) {
  const ready = useFeatureReady("home_chapter") === true;
  const topNational = org.type === "national" && !org.parent_id;
  const info = useQuery({ ...homeChapterInfoQuery(org.slug), enabled: ready && topNational });
  const applies = topNational && info.data?.model === "home_chapter";
  const mine = useQuery({ ...myHomeChapterQuery(org.id), enabled: applies });
  return { applies, info: info.data ?? null, mine: mine.data ?? null, loading: mine.isLoading };
}

/** "Your chapter" with "Change chapter" (A8, D-166): members change it whenever they like. */
function YourChapterCard({ org }: { org: Org }) {
  const qc = useQueryClient();
  const home = useHomeChapter(org);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!home.applies || !home.info || !home.mine) return null;
  const choices = chapterChoices(home.info);
  const current = home.mine.homeOrgId ?? NO_CHAPTER;
  const value = pick ?? current;
  const currentName = choices.find((c) => c.id === home.mine!.homeOrgId)?.name;

  async function save() {
    setBusy(true);
    try {
      await setHomeChapter(org.id, value === NO_CHAPTER ? null : value);
      toast.success("Chapter saved");
      setPick(null);
      await qc.invalidateQueries();
    } catch (e) {
      toast.error(homeChapterErrorMessage(String((e as Error).message)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="my-chapter" className={card} aria-labelledby="chapter-heading">
      <h2 id="chapter-heading" className="text-lg font-semibold">
        Your chapter
      </h2>
      <p className="mt-2 text-sm">
        {currentName ? (
          <>
            You belong to <span className="font-medium">{currentName}</span>.
          </>
        ) : (
          "You haven't picked a chapter; you're a member at large."
        )}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Your membership is with {org.name}. You can change your chapter whenever you like; any
        officer seat you hold in your current chapter ends when you move.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select value={value} onValueChange={setPick}>
          <SelectTrigger className="w-72" aria-label="Change chapter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {choices.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
            <SelectItem value={NO_CHAPTER}>No chapter (member at large)</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" onClick={save} disabled={busy || value === current}>
          {busy ? "Saving…" : "Change chapter"}
        </Button>
      </div>
    </section>
  );
}
