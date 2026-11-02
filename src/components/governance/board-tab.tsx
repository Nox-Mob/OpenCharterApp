import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Org } from "@/lib/orgs";
import { useFeatureReady } from "@/lib/db/readiness";
import { membersQuery } from "@/modules/membership/memberships";
import { today } from "@/modules/membership/standing";
import {
  appointOfficer,
  boardErrorMessage,
  boardHistoryQuery,
  boardQuery,
  endAppointment,
  openSeats,
  plannedEnd,
  seatContactsQuery,
  seatTermLabel,
  termRulesQuery,
  termSummary,
  vacantRequired,
  type Seat,
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

/**
 * Board page (E-17): the seats used here, who holds them, each seat's term and history, and
 * appointing or ending terms. How the board is set up lives in Settings → Board (D-185).
 */
export function BoardTab({
  org,
  canManage,
  onOpenSettings,
}: {
  org: Org;
  canManage: boolean;
  /** Set when the viewer may configure the board: opens Settings → Board. */
  onOpenSettings?: () => void;
}) {
  const qc = useQueryClient();
  const board = useQuery(boardQuery(org.id));
  const history = useQuery(boardHistoryQuery(org.id));
  const rules = useQuery(termRulesQuery(org.id));
  const [appointing, setAppointing] = useState<Seat | null>(null);
  // Contact emails need migration 0026 (D-135, D-156).
  const contactsReady = useFeatureReady("seat_contacts") === true;
  const contacts = useQuery({ ...seatContactsQuery(org.id), enabled: contactsReady });
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  const refresh = () => {
    for (const k of [
      "board",
      "board-history",
      "seat-terms",
      "seat-templates",
      "seat-contacts",
      "board-contacts",
    ])
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
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Board and officers</h2>
            <p className="text-sm text-muted-foreground">
              Seats come from {org.name} and the organizations above it. Terms follow {org.name}
              &apos;s own by-laws.
            </p>
          </div>
          {onOpenSettings && (
            <Button size="sm" variant="outline" onClick={onOpenSettings}>
              Change board settings
            </Button>
          )}
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
            No board seats yet.{onOpenSettings ? " Add them in Settings → Board." : ""}
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {seats.map((s) => {
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
                  {contactsReady && (
                    <p className="text-sm">
                      Contact:{" "}
                      {contacts.data?.[s.template_id] ? (
                        <>
                          <span>{contacts.data[s.template_id]}</span>{" "}
                          <span className="text-muted-foreground">(role email)</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">the officer&apos;s own email</span>
                      )}
                    </p>
                  )}
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
