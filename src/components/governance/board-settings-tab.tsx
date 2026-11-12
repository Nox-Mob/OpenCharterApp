import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Org } from "@/lib/orgs";
import { ChapterBoardSettings } from "./chapter-board";
import type { Grant } from "@/lib/policy";
import { useFeatureReady } from "@/lib/db/readiness";
import { SettingRules } from "@/components/org/settings-tab";
import { canGrantRole, rolesForOrg } from "@/modules/roles";
import { rolesQuery } from "@/modules/roles/queries";
import { today } from "@/modules/membership/standing";
import {
  applyTermToCurrentOfficers,
  boardErrorMessage,
  boardQuery,
  defineSeat,
  ownSeatsQuery,
  scopeLabel,
  SEAT_SCOPES,
  roleEmailSchema,
  seatContactLine,
  seatContactsQuery,
  boardContactsQuery,
  seatInputSchema,
  seatKey,
  seatTermLabel,
  setSeatActive,
  setSeatContact,
  setSeatScope,
  setSeatTerm,
  setSeatTitle,
  termInputSchema,
  termSummary,
  updateSeat,
  type Seat,
  type SeatInput,
  type SeatScope,
  type SeatTemplate,
  type SeatTerm,
} from "@/modules/governance/seats";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const NONE = "__none";

/**
 * Settings → Board (D-185): how this org's board is set up. Each seat's term from the by-laws,
 * how members contact the officer, the org's own title for an inherited seat, the seats this org
 * defines, and the board rules. The Board page only shows the board and appoints officers.
 */
export function BoardSettingsTab({
  org,
  grants,
  canManage,
  canDefine,
  canManageRules,
}: {
  org: Org;
  grants: readonly Grant[];
  canManage: boolean;
  canDefine: boolean;
  canManageRules: boolean;
}) {
  const qc = useQueryClient();
  const board = useQuery(boardQuery(org.id));
  const contactsReady = useFeatureReady("seat_contacts") === true;
  const contacts = useQuery({ ...seatContactsQuery(org.id), enabled: contactsReady });
  const officerContacts = useQuery({ ...boardContactsQuery(org.id), enabled: contactsReady });
  const [termFor, setTermFor] = useState<Seat | null>(null);
  const [contactFor, setContactFor] = useState<Seat | null>(null);
  const refresh = () => {
    for (const k of ["board", "seat-terms", "seat-templates", "seat-contacts", "board-contacts"])
      qc.invalidateQueries({ queryKey: [k, org.id] });
  };
  async function run(action: () => Promise<unknown>, done: string) {
    try {
      await action();
      toast.success(done);
      refresh();
    } catch (e) {
      toast.error(boardErrorMessage(String((e as Error).message)));
    }
  }
  const seats = board.data ?? [];

  return (
    <div className="space-y-8">
      <ChapterBoardSettings org={org} canManage={canManageRules} />
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Seats used here</h2>
          <p className="text-sm text-muted-foreground">
            Each seat&apos;s term follows {org.name}&apos;s by-laws. Appointing and ending terms
            happens on the Board page.
          </p>
        </div>
        {board.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : seats.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No board seats yet.{canDefine ? " Add one below." : ""}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Seat</TableHead>
                <TableHead>Term</TableHead>
                {contactsReady && <TableHead>Contact</TableHead>}
                {canManage && <TableHead className="sr-only">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {seats.map((s) => {
                const inherited = s.owner_org_id !== org.id;
                return (
                  <TableRow key={s.template_id}>
                    <TableCell>
                      <span className="font-medium">{s.title}</span>
                      {s.title !== s.default_title && (
                        <span className="text-xs text-muted-foreground"> ({s.default_title})</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{termSummary(s)}</TableCell>
                    {contactsReady && (
                      <TableCell className="text-sm">
                        {contacts.data?.[s.template_id] ? (
                          <>
                            {contacts.data[s.template_id]}{" "}
                            <span className="text-muted-foreground">(role email)</span>
                          </>
                        ) : (
                          (() => {
                            const own = seatContactLine(
                              s.template_id,
                              undefined,
                              officerContacts.data,
                            );
                            return own.length > 0 ? (
                              own.map((l) => l.email).join(", ")
                            ) : (
                              <span className="text-muted-foreground">
                                {s.holders.length === 0 ? "nobody yet" : "no email on record"}
                              </span>
                            );
                          })()
                        )}
                      </TableCell>
                    )}
                    {canManage && (
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => setTermFor(s)}>
                            Change term
                          </Button>
                          {contactsReady && (
                            <Button size="sm" variant="outline" onClick={() => setContactFor(s)}>
                              Contact email
                            </Button>
                          )}
                          {inherited && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const t = window.prompt(
                                  `What ${org.name} calls this seat (blank: "${s.default_title}")`,
                                  s.title === s.default_title ? "" : s.title,
                                );
                                if (t === null) return;
                                void run(
                                  () => setSeatTitle(org.id, s.template_id, t),
                                  "Title saved",
                                );
                              }}
                            >
                              Rename here
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      {canDefine && <SeatEditor org={org} grants={grants} onSaved={refresh} />}

      {canManageRules && <SettingRules org={org} page="board" title="Board rules" />}

      {contactFor && (
        <ContactDialog
          org={org}
          seat={contactFor}
          current={contacts.data?.[contactFor.template_id] ?? ""}
          onClose={() => setContactFor(null)}
          onDone={() => {
            setContactFor(null);
            refresh();
          }}
        />
      )}
      {termFor && (
        <TermDialog
          org={org}
          seat={termFor}
          onClose={() => setTermFor(null)}
          onDone={() => {
            setTermFor(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

export function TermFields({
  term,
  onChange,
}: {
  term: SeatTerm;
  onChange: (t: SeatTerm) => void;
}) {
  return (
    <div className="flex gap-2">
      <Input
        aria-label="Term length"
        type="number"
        min={1}
        max={100}
        className="w-24"
        disabled={!term}
        value={term?.count ?? ""}
        onChange={(e) => term && onChange({ ...term, count: Number(e.target.value) })}
      />
      <Select
        value={term?.unit ?? NONE}
        onValueChange={(v) =>
          onChange(v === NONE ? null : { count: term?.count ?? 1, unit: v as "month" | "year" })
        }
      >
        <SelectTrigger className="w-44" aria-label="Term unit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="month">Months</SelectItem>
          <SelectItem value="year">Years</SelectItem>
          <SelectItem value={NONE}>No fixed term</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * How members reach a seat's holder (D-156): either a role email for the seat, or each
 * officer's own email. Never both.
 */
function ContactDialog({
  org,
  seat,
  current,
  onClose,
  onDone,
}: {
  org: Org;
  seat: Seat;
  current: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"officer" | "role">(current ? "role" : "officer");
  const [email, setEmail] = useState(current);
  const [busy, setBusy] = useState(false);

  async function save() {
    const value = mode === "role" ? email.trim() : "";
    if (mode === "role") {
      const parsed = roleEmailSchema.safeParse(value);
      if (!parsed.success || value === "")
        return void toast.error("Enter the role email, e.g. president@example.org");
    }
    setBusy(true);
    try {
      await setSeatContact(org.id, seat.template_id, value);
      toast.success("Contact saved");
      onDone();
    } catch (e) {
      toast.error(boardErrorMessage(String((e as Error).message)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>How members reach the {seat.title}</DialogTitle>
        </DialogHeader>
        <RadioGroup
          value={mode}
          onValueChange={(v) => setMode(v as "officer" | "role")}
          className="space-y-3"
        >
          <label className="flex items-start gap-2 text-sm">
            <RadioGroupItem value="officer" aria-label="The officer's sign-in email" />
            <span>
              <span className="font-medium">The officer&apos;s sign-in email</span>
              <span className="block text-muted-foreground">
                Whoever holds the seat is listed with the email they sign in with (or, without a
                login, the email on their member record).
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <RadioGroupItem value="role" aria-label="A role email for this seat" />
            <span>
              <span className="font-medium">A role email for this seat</span>
              <span className="block text-muted-foreground">
                Stays the same when the officer changes. The officer&apos;s sign-in email isn&apos;t
                shown.
              </span>
            </span>
          </label>
        </RadioGroup>
        {mode === "role" && (
          <div className="space-y-2">
            <Label htmlFor="role-email">Role email</Label>
            <Input
              id="role-email"
              type="email"
              placeholder={`${seatKey(seat.default_title).replace(/_/g, "")}@example.org`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        )}
        <DialogFooter>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TermDialog({
  org,
  seat,
  onClose,
  onDone,
}: {
  org: Org;
  seat: Seat;
  onClose: () => void;
  onDone: () => void;
}) {
  const [term, setTerm] = useState<SeatTerm>(seat.term);
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [bylaw, setBylaw] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    const parsed = termInputSchema.safeParse({
      term,
      effective_from: effectiveFrom,
      bylaw_reference: bylaw,
      note,
    });
    if (!parsed.success)
      return void toast.error(parsed.error.issues[0]?.message ?? "Check the term");
    setBusy(true);
    try {
      await setSeatTerm(org.id, seat.template_id, parsed.data);
      toast.success("Term saved");
      if (
        seat.holders.length > 0 &&
        effectiveFrom <= today() &&
        window.confirm(
          `Apply the new term to the current ${seat.title}? Otherwise it applies to appointments starting on or after ${effectiveFrom}.`,
        )
      ) {
        const n = await applyTermToCurrentOfficers(org.id, seat.template_id);
        toast.success(`Updated ${n} current term${n === 1 ? "" : "s"}`);
      }
      onDone();
    } catch (e) {
      toast.error(boardErrorMessage(String((e as Error).message)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change the {seat.title} term</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Record the term your by-laws set. Earlier rules stay in the term history.
          </p>
          <div className="space-y-2">
            <Label>Term length</Label>
            <TermFields term={term} onChange={setTerm} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="term-from">Takes effect</Label>
            <Input
              id="term-from"
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="term-bylaw">By-law reference</Label>
            <Input
              id="term-bylaw"
              placeholder="Bylaws Art. IV §2, amended 2026-03"
              value={bylaw}
              onChange={(e) => setBylaw(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="term-note">Note (optional)</Label>
            <Input id="term-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save term"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const EMPTY_SEAT: SeatInput = {
  title: "",
  description: "",
  required: false,
  seat_count: 1,
  term: { count: 1, unit: "year" },
  role_id: null,
  scope: "self",
  sort_order: 0,
};

/** Seats this org defines: for itself, or (nationals and regions) for every org below it. */
function SeatEditor({
  org,
  grants,
  onSaved,
}: {
  org: Org;
  grants: readonly Grant[];
  onSaved: () => void;
}) {
  const own = useQuery(ownSeatsQuery(org.id));
  const roles = useQuery(rolesQuery());
  const [editing, setEditing] = useState<{
    id: string | null;
    input: SeatInput;
    savedScope?: SeatScope;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const canScopeChapters = org.type === "national" || org.type === "region";
  const usableRoles = rolesForOrg(roles.data ?? [], org).filter((r) =>
    canGrantRole(r, grants, org),
  );
  const roleName = (id: string | null) => roles.data?.find((r) => r.id === id)?.name;

  const edit = (t: SeatTemplate) =>
    setEditing({
      id: t.id,
      savedScope: t.scope,
      input: {
        title: t.title,
        description: t.description,
        required: t.required,
        seat_count: t.seat_count,
        term: t.default_term,
        role_id: t.role_id,
        scope: t.scope,
        sort_order: t.sort_order,
      },
    });

  async function save() {
    if (!editing) return;
    const parsed = seatInputSchema.safeParse(editing.input);
    if (!parsed.success)
      return void toast.error(parsed.error.issues[0]?.message ?? "Check the seat");
    setBusy(true);
    try {
      if (editing.id) {
        await updateSeat(editing.id, parsed.data);
        if (editing.savedScope && parsed.data.scope !== editing.savedScope)
          await setSeatScope(editing.id, parsed.data.scope);
      } else await defineSeat(org.id, parsed.data);
      toast.success("Seat saved");
      setEditing(null);
      onSaved();
    } catch (e) {
      toast.error(boardErrorMessage(String((e as Error).message)));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(t: SeatTemplate) {
    try {
      await setSeatActive(t.id, !t.active);
      toast.success(t.active ? "Seat retired" : "Seat restored");
      onSaved();
    } catch (e) {
      toast.error(boardErrorMessage(String((e as Error).message)));
    }
  }

  const set = (patch: Partial<SeatInput>) =>
    editing && setEditing({ ...editing, input: { ...editing.input, ...patch } });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Seats {org.name} defines</h2>
        <Button size="sm" onClick={() => setEditing({ id: null, input: EMPTY_SEAT })}>
          Add seat
        </Button>
      </div>
      {(own.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">None yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Seat</TableHead>
              <TableHead>Used by</TableHead>
              <TableHead>Suggested term</TableHead>
              <TableHead>Grants role</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {own.data!.map((t) => (
              <TableRow key={t.id} className={t.active ? "" : "opacity-60"}>
                <TableCell>
                  {t.title}
                  {t.required && <span className="text-xs text-muted-foreground"> · required</span>}
                  {t.seat_count > 1 && (
                    <span className="text-xs text-muted-foreground"> · {t.seat_count} seats</span>
                  )}
                  {!t.active && (
                    <Badge variant="outline" className="ml-2">
                      Retired
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{scopeLabel(t.scope, org.name)}</TableCell>
                <TableCell>{seatTermLabel(t.default_term)}</TableCell>
                <TableCell>{roleName(t.role_id) ?? "—"}</TableCell>
                <TableCell className="space-x-1 text-right">
                  {t.active && (
                    <Button size="sm" variant="ghost" onClick={() => edit(t)}>
                      Edit
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => toggle(t)}>
                    {t.active ? "Retire" : "Restore"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing.id ? "Edit seat" : "Add a seat"}</DialogTitle>
            </DialogHeader>
            <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
              <div className="space-y-2">
                <Label htmlFor="seat-title">Title</Label>
                <Input
                  id="seat-title"
                  placeholder="President"
                  value={editing.input.title}
                  onChange={(e) => set({ title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="seat-description">Description (optional)</Label>
                <Input
                  id="seat-description"
                  value={editing.input.description}
                  onChange={(e) => set({ description: e.target.value })}
                />
              </div>
              {canScopeChapters && (
                <div className="space-y-2">
                  <Label>Used by</Label>
                  <Select
                    value={editing.input.scope}
                    onValueChange={(v) => set({ scope: v as SeatInput["scope"] })}
                  >
                    <SelectTrigger aria-label="Used by">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEAT_SCOPES.map((sc) => (
                        <SelectItem key={sc} value={sc}>
                          {scopeLabel(sc, org.name)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Each organization fills its own seats. Choose “{org.name} and every chapter
                    below it” for a seat like President that every level has.
                  </p>
                </div>
              )}
              <div className="flex flex-wrap gap-4">
                <div className="space-y-2">
                  <Label htmlFor="seat-count">Number of seats</Label>
                  <Input
                    id="seat-count"
                    type="number"
                    min={1}
                    max={50}
                    className="w-24"
                    value={editing.input.seat_count}
                    onChange={(e) => set({ seat_count: Number(e.target.value) })}
                  />
                </div>
                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editing.input.required}
                    onChange={(e) => set({ required: e.target.checked })}
                  />
                  Required (shown as vacant when empty)
                </label>
              </div>
              <div className="space-y-2">
                <Label>Suggested term</Label>
                <TermFields term={editing.input.term} onChange={(term) => set({ term })} />
                <p className="text-xs text-muted-foreground">
                  A starting point. Each organization sets its own term to match its by-laws.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Role granted while holding the seat</Label>
                <Select
                  value={editing.input.role_id ?? NONE}
                  onValueChange={(v) => set({ role_id: v === NONE ? null : v })}
                >
                  <SelectTrigger aria-label="Role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No role</SelectItem>
                    {usableRoles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={save} disabled={busy}>
                {busy ? "Saving…" : "Save seat"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
