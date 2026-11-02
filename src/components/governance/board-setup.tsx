import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Org } from "@/lib/orgs";
import type { Answers, FlowContext } from "@/engines/setup";
import { setupStateQuery } from "@/modules/setup/drafts";
import {
  boardErrorMessage,
  boardQuery,
  extraSeatsAllowedQuery,
  ownSeatsQuery,
  seatTermLabel,
} from "@/modules/governance/seats";
import {
  boardFlow,
  newSeat,
  SEAT_PRESETS,
  seatsUsedHere,
  termKeyOf,
  type SeatAnswer,
  type SeatTermAnswer,
} from "@/modules/governance/setup-flow";
import { today } from "@/modules/membership/standing";
import { FlowWizard } from "@/components/setup/flow-wizard";
import { TermFields } from "@/components/governance/board-tab";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Board setup (D-143): loads what applies here, then runs the generic setup wizard. */
export function BoardSetup({ org }: { org: Org }) {
  const state = useQuery(setupStateQuery(org.id, boardFlow.id));
  const board = useQuery(boardQuery(org.id));
  const own = useQuery(ownSeatsQuery(org.id));
  const extraAllowed = useQuery(extraSeatsAllowedQuery(org.id, org.ancestor_ids));
  const [setup, setSetup] = useState<{ ctx: FlowContext; initial: Answers } | null>(null);

  const loading = state.isLoading || board.isLoading || own.isLoading || extraAllowed.isLoading;
  if (!setup && !loading) {
    const seats = board.data ?? [];
    const ctx: FlowContext = {
      orgType: org.type,
      orgName: org.name,
      board: {
        extraSeatsAllowed: extraAllowed.data !== false,
        inherited: seats
          .filter((s) => s.owner_org_id !== org.id)
          .map((s) => ({
            owner_org_id: s.owner_org_id,
            key: s.key,
            title: s.title,
            term: s.term_source === "default" ? s.term : null,
          })),
      },
    };
    const saved = state.data?.answers;
    const initial: Answers = { ...boardFlow.defaults(ctx), ...(saved ?? {}) };
    // Re-running pre-fills from the current board (setup-engine.md §4).
    if (!saved?.["seats"])
      initial["seats"] = (own.data ?? [])
        .filter((t) => t.active)
        .map((t): SeatAnswer => ({
          key: t.key,
          title: t.title,
          description: t.description,
          required: t.required,
          seat_count: t.seat_count,
          term: t.default_term,
          scope: t.scope,
        }));
    if (!saved?.["seat_terms"])
      initial["seat_terms"] = Object.fromEntries(
        seats
          .filter((s) => s.term_source === "org")
          .map((s) => [
            termKeyOf(s.owner_org_id, s.key),
            {
              term: s.term,
              effective_from: s.term_since ?? today(),
              bylaw_reference: s.bylaw_reference,
            } satisfies SeatTermAnswer,
          ]),
      );
    setSetup({ ctx, initial });
  }

  if (!setup) return <p className="text-muted-foreground">Loading…</p>;
  return (
    <FlowWizard
      org={org}
      flow={boardFlow}
      ctx={setup.ctx}
      initial={setup.initial}
      applyErrorMessage={(m) => (m.includes("locked") ? null : boardErrorMessage(m))}
      renderCustom={(q, value, onChange, answers) =>
        q.type === "seats" ? (
          <SeatsQuestion
            value={(value as SeatAnswer[]) ?? []}
            onChange={onChange}
            canScopeChapters={org.type === "national" || org.type === "region"}
            orgName={org.name}
          />
        ) : q.type === "seat_terms" ? (
          <SeatTermsQuestion
            seats={seatsUsedHere(answers, setup.ctx, org.id)}
            value={(value as Record<string, SeatTermAnswer>) ?? {}}
            onChange={onChange}
          />
        ) : null
      }
    />
  );
}

function SeatsQuestion({
  value,
  onChange,
  canScopeChapters,
  orgName,
}: {
  value: SeatAnswer[];
  onChange: (v: SeatAnswer[]) => void;
  canScopeChapters: boolean;
  orgName: string;
}) {
  const [title, setTitle] = useState("");
  const defaultScope = canScopeChapters ? "chapters" : "self";
  const keys = new Set(value.map((s) => s.key));
  const update = (i: number, patch: Partial<SeatAnswer>) =>
    onChange(value.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium">Common seats</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {SEAT_PRESETS.map((p) => (
            <label key={p.key} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={keys.has(p.key)}
                onCheckedChange={(c) =>
                  onChange(
                    c
                      ? [...value, { ...p, scope: defaultScope }]
                      : value.filter((s) => s.key !== p.key),
                  )
                }
              />
              {p.title}
            </label>
          ))}
        </div>
      </div>
      {value.length > 0 && (
        <ul className="divide-y rounded-md border">
          {value.map((s, i) => (
            <li key={s.key} className="space-y-2 px-3 py-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <Input
                  aria-label="Seat title"
                  className="max-w-xs"
                  value={s.title}
                  onChange={(e) => update(i, { title: e.target.value })}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {canScopeChapters && (
                  <Select
                    value={s.scope}
                    onValueChange={(v) => update(i, { scope: v as SeatAnswer["scope"] })}
                  >
                    <SelectTrigger className="w-52" aria-label={`${s.title} used by`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="chapters">Every chapter</SelectItem>
                      <SelectItem value="self">{orgName} itself</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <label className="flex items-center gap-1">
                  <Checkbox
                    checked={s.required}
                    onCheckedChange={(c) => update(i, { required: c === true })}
                  />
                  Required
                </label>
                <label className="flex items-center gap-1">
                  Seats
                  <Input
                    aria-label={`${s.title} number of seats`}
                    type="number"
                    min={1}
                    max={50}
                    className="w-20"
                    value={s.seat_count}
                    onChange={(e) => update(i, { seat_count: Number(e.target.value) })}
                  />
                </label>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Suggested term</span>
                <TermFields term={s.term} onChange={(term) => update(i, { term })} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          aria-label="New seat title"
          placeholder="Another seat, e.g. Chaplain"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          disabled={!title.trim()}
          onClick={() => {
            onChange([...value, newSeat(title, defaultScope)]);
            setTitle("");
          }}
        >
          Add seat
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Seats you remove here aren't deleted. Retire them from the Board tab. Link a seat to a role
        on the Board tab.
      </p>
    </div>
  );
}

function SeatTermsQuestion({
  seats,
  value,
  onChange,
}: {
  seats: ReturnType<typeof seatsUsedHere>;
  value: Record<string, SeatTermAnswer>;
  onChange: (v: Record<string, SeatTermAnswer>) => void;
}) {
  if (seats.length === 0)
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        No seats are used here yet.
      </p>
    );
  return (
    <ul className="divide-y rounded-md border">
      {seats.map((s) => {
        const k = termKeyOf(s.owner_org_id, s.key);
        const own = value[k];
        const set = (patch: Partial<SeatTermAnswer>) =>
          onChange({ ...value, [k]: { ...own!, ...patch } });
        return (
          <li key={k} className="space-y-2 px-3 py-3 text-sm">
            <label className="flex items-center gap-2 font-medium">
              <Checkbox
                checked={!!own}
                onCheckedChange={(c) => {
                  const next = { ...value };
                  if (c) next[k] = { term: s.term, effective_from: today(), bylaw_reference: "" };
                  else delete next[k];
                  onChange(next);
                }}
              />
              {s.title}: set our own term
            </label>
            {!own ? (
              <p className="pl-6 text-muted-foreground">
                Uses the suggested term ({seatTermLabel(s.term).toLowerCase()}).
              </p>
            ) : (
              <div className="space-y-2 pl-6">
                <TermFields term={own.term} onChange={(term) => set({ term })} />
                <div className="flex flex-wrap gap-2">
                  <div className="space-y-1">
                    <Label htmlFor={`${k}-from`}>Takes effect</Label>
                    <Input
                      id={`${k}-from`}
                      type="date"
                      value={own.effective_from}
                      onChange={(e) => set({ effective_from: e.target.value })}
                    />
                  </div>
                  <div className="min-w-56 flex-1 space-y-1">
                    <Label htmlFor={`${k}-bylaw`}>By-law reference</Label>
                    <Input
                      id={`${k}-bylaw`}
                      placeholder="Bylaws Art. IV §2"
                      value={own.bylaw_reference}
                      onChange={(e) => set({ bylaw_reference: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
