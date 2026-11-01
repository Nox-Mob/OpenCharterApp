import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Org } from "@/lib/orgs";
import type { Grant } from "@/lib/policy";
import { canGrantRole, rolesForOrg } from "@/modules/roles";
import { rolesQuery } from "@/modules/roles/queries";
import { membersQuery } from "@/modules/membership/memberships";
import { today } from "@/modules/membership/standing";
import {
  applyTermToCurrentOfficers,
  appointOfficer,
  boardErrorMessage,
  boardHistoryQuery,
  boardQuery,
  defineSeat,
  endAppointment,
  openSeats,
  ownSeatsQuery,
  plannedEnd,
  seatInputSchema,
  seatTermLabel,
  setSeatActive,
  setSeatTerm,
  setSeatTitle,
  termInputSchema,
  termRulesQuery,
  termSummary,
  updateSeat,
  vacantRequired,
  type Seat,
  type SeatInput,
  type SeatTemplate,
  type SeatTerm,
} from "@/modules/governance/seats";
import { Badge } from "@/components/ui/badge";
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

/** Board tab (E-17): the seats used here, who holds them, each seat's term and history. */
export function BoardTab({
  org,
  grants,
  canManage,
  canDefine,
}: {
  org: Org;
  grants: readonly Grant[];
  canManage: boolean;
  canDefine: boolean;
}) {
  const qc = useQueryClient();
  const board = useQuery(boardQuery(org.id));
  const history = useQuery(boardHistoryQuery(org.id));
  const rules = useQuery(termRulesQuery(org.id));
  const [appointing, setAppointing] = useState<Seat | null>(null);
  const [termFor, setTermFor] = useState<Seat | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  const refresh = () => {
    for (const k of ["board", "board-history", "seat-terms", "seat-templates"])
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
  const vacant = vacantRequired(seats);
  const seatTitle = (id: string) => seats.find((s) => s.template_id === id)?.title ?? "Seat";

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Board and officers</h2>
          <p className="text-sm text-muted-foreground">
            Seats come from {org.name} and the organizations above it. Terms follow {org.name}'s own
            by-laws.
          </p>
        </div>
        {vacant.length > 0 && (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            Required seats with nobody in them: {vacant.map((s) => s.title).join(", ")}.
          </p>
        )}
        {board.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : seats.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No board seats yet.{canDefine ? " Add one below." : ""}
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {seats.map((s) => {
              const inherited = s.owner_org_id !== org.id;
              const seatRules = (rules.data ?? []).filter((r) => r.template_id === s.template_id);
              return (
                <div key={s.template_id} className="space-y-3 rounded-md border bg-card p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{s.title}</h3>
                    {s.title !== s.default_title && (
                      <span className="text-xs text-muted-foreground">({s.default_title})</span>
                    )}
                    {s.required && s.holders.length === 0 && (
                      <Badge variant="destructive">Vacant</Badge>
                    )}
                    {s.seat_count > 1 && (
                      <Badge variant="secondary">
                        {s.holders.length} of {s.seat_count} filled
                      </Badge>
                    )}
                  </div>
                  {s.description && (
                    <p className="text-sm text-muted-foreground">{s.description}</p>
                  )}
                  <p className="text-sm">{termSummary(s)}</p>
                  {s.holders.length > 0 ? (
                    <ul className="space-y-1 text-sm">
                      {s.holders.map((h) => (
                        <li
                          key={h.appointment_id}
                          className="flex items-center justify-between gap-2"
                        >
                          <span>
                            <strong>{h.display_name}</strong>{" "}
                            <span className="text-muted-foreground">
                              since {h.starts_on}
                              {h.planned_end ? `, term ends ${h.planned_end}` : ""}
                            </span>
                          </span>
                          {canManage && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                const reason = window.prompt(
                                  `End ${h.display_name}'s term as ${s.title}? Reason (optional)`,
                                );
                                if (reason === null) return;
                                void run(
                                  () => endAppointment(h.appointment_id, reason, today()),
                                  "Term ended",
                                );
                              }}
                            >
                              End term
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nobody holds this seat.</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {canManage && openSeats(s) > 0 && (
                      <Button size="sm" onClick={() => setAppointing(s)}>
                        Appoint
                      </Button>
                    )}
                    {canManage && (
                      <Button size="sm" variant="outline" onClick={() => setTermFor(s)}>
                        Change term
                      </Button>
                    )}
                    {canManage && inherited && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const t = window.prompt(
                            `What ${org.name} calls this seat (blank: "${s.default_title}")`,
                            s.title === s.default_title ? "" : s.title,
                          );
                          if (t === null) return;
                          void run(() => setSeatTitle(org.id, s.template_id, t), "Title saved");
                        }}
                      >
                        Rename here
                      </Button>
                    )}
                    {seatRules.length > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setHistoryFor(historyFor === s.template_id ? null : s.template_id)
                        }
                      >
                        Term history
                      </Button>
                    )}
                  </div>
                  {historyFor === s.template_id && (
                    <ul className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
                      {seatRules.map((r) => (
                        <li key={r.id}>
                          From {r.effective_from}: {seatTermLabel(r.term)}
                          {r.bylaw_reference ? ` · ${r.bylaw_reference}` : ""}
                          {r.note ? ` · ${r.note}` : ""}
                        </li>
                      ))}
                      <li>Before the earliest rule: the suggested default.</li>
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {canDefine && <SeatEditor org={org} grants={grants} onSaved={refresh} />}

      <section>
        <h2 className="mb-2 text-lg font-semibold">Past officers</h2>
        {(history.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No past officers yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Seat</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.data!.map((h) => (
                <TableRow key={h.appointment_id}>
                  <TableCell>{seatTitle(h.template_id)}</TableCell>
                  <TableCell>{h.display_name}</TableCell>
                  <TableCell>{h.starts_on}</TableCell>
                  <TableCell>{h.ended_on}</TableCell>
                  <TableCell>{h.end_reason || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {appointing && (
        <AppointDialog
          org={org}
          seat={appointing}
          onClose={() => setAppointing(null)}
          onDone={() => {
            setAppointing(null);
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

function TermFields({ term, onChange }: { term: SeatTerm; onChange: (t: SeatTerm) => void }) {
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

function AppointDialog({
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
  const members = useQuery(membersQuery(org.id));
  const [profileId, setProfileId] = useState("");
  const [startsOn, setStartsOn] = useState(today());
  const [busy, setBusy] = useState(false);
  const holders = new Set(seat.holders.map((h) => h.profile_id));
  const end = /^\d{4}-\d{2}-\d{2}$/.test(startsOn) ? plannedEnd(startsOn, seat.term) : null;

  async function save() {
    if (!profileId) return void toast.error("Pick a member");
    setBusy(true);
    try {
      await appointOfficer(org.id, seat.template_id, profileId, startsOn);
      toast.success(`Appointed ${seat.title}`);
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
          <DialogTitle>Appoint {seat.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Member</Label>
            <Select value={profileId} onValueChange={setProfileId}>
              <SelectTrigger aria-label="Member">
                <SelectValue placeholder="Pick a member" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {(members.data ?? [])
                  .filter((m) => !holders.has(m.id))
                  .map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.display_name || m.email || "Unnamed member"}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="appoint-start">Term starts</Label>
            <Input
              id="appoint-start"
              type="date"
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              {end ? `The term in force ends it on ${end}.` : "No fixed end date."}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={busy}>
            {busy ? "Appointing…" : "Appoint"}
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
  const [editing, setEditing] = useState<{ id: string | null; input: SeatInput } | null>(null);
  const [busy, setBusy] = useState(false);
  const canScopeChapters = org.type === "national" || org.type === "region";
  const usableRoles = rolesForOrg(roles.data ?? [], org).filter((r) =>
    canGrantRole(r, grants, org),
  );
  const roleName = (id: string | null) => roles.data?.find((r) => r.id === id)?.name;

  const edit = (t: SeatTemplate) =>
    setEditing({
      id: t.id,
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
      if (editing.id) await updateSeat(editing.id, parsed.data);
      else await defineSeat(org.id, parsed.data);
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
                <TableCell>{t.scope === "chapters" ? "Every chapter" : org.name}</TableCell>
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
              {canScopeChapters && !editing.id && (
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
                      <SelectItem value="self">{org.name} itself</SelectItem>
                      <SelectItem value="chapters">Every chapter below {org.name}</SelectItem>
                    </SelectContent>
                  </Select>
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
