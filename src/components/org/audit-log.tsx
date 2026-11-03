import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useFeatureReady } from "@/lib/db/readiness";
import {
  groupEvents,
  sentence,
  type AuditEntry,
  type DescribedEvent,
} from "@/modules/audit/describe";
import { AUDIT_PAGE, auditLogQuery } from "@/modules/audit/queries";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "__all";

/**
 * Settings → Audit log (D-191): who did what, when, with each changed field's previous and
 * current value. Only this organization's own events.
 */
export function AuditLogTab({ orgId, orgName }: { orgId: string; orgName: string }) {
  const readable = useFeatureReady("readable_audit") === true;
  const log = useInfiniteQuery(auditLogQuery(orgId, readable));
  const [person, setPerson] = useState(ALL);
  const [area, setArea] = useState(ALL);

  const events = useMemo(() => (log.data?.pages ?? []).flat(), [log.data]);
  const entries = useMemo(() => groupEvents(events), [events]);
  const people = [...new Set(entries.map((e) => e.who))].sort();
  const areas = [...new Set(entries.flatMap((e) => [e.area, ...e.more.map((m) => m.area)]))].sort();
  const shown = entries.filter(
    (e) =>
      (person === ALL || e.who === person) &&
      (area === ALL || e.area === area || e.more.some((m) => m.area === area)),
  );
  const days = groupByDay(shown);
  const lastPage = log.data?.pages.at(-1);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Audit log</h2>
        <p className="text-sm text-muted-foreground">
          Every change made in {orgName}: who made it, when, and what it was before and after.
          Changes made in other organizations (above or below) appear in their own logs.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Select value={person} onValueChange={setPerson}>
          <SelectTrigger className="w-56" aria-label="Person">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Everyone</SelectItem>
            {people.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={area} onValueChange={setArea}>
          <SelectTrigger className="w-56" aria-label="Area">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All areas</SelectItem>
            {areas.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {log.isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : log.isError ? (
        <p className="text-destructive">Couldn&apos;t load the audit log.</p>
      ) : shown.length === 0 ? (
        <p className="text-muted-foreground">Nothing to show.</p>
      ) : (
        days.map(([day, list]) => (
          <div key={day} className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">{day}</h3>
            <ul className="divide-y rounded-md border bg-card">
              {list.map((e) => (
                <EntryRow key={e.id} entry={e} />
              ))}
            </ul>
          </div>
        ))
      )}
      {log.hasNextPage && (lastPage?.length ?? 0) >= AUDIT_PAGE && (
        <Button
          variant="outline"
          onClick={() => void log.fetchNextPage()}
          disabled={log.isFetchingNextPage}
        >
          {log.isFetchingNextPage ? "Loading…" : "Show older changes"}
        </Button>
      )}
    </section>
  );
}

function groupByDay(entries: readonly AuditEntry[]): [string, AuditEntry[]][] {
  const out = new Map<string, AuditEntry[]>();
  for (const e of entries) {
    const day = e.at.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    out.set(day, [...(out.get(day) ?? []), e]);
  }
  return [...out];
}

function EntryRow({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="space-y-2 px-4 py-3 text-sm">
      <p>
        <time dateTime={entry.at.toISOString()} className="font-mono text-muted-foreground">
          {entry.at.toLocaleTimeString()}
        </time>
        , {sentence(entry)}
      </p>
      <Changes event={entry} />
      {entry.more.length > 0 && (
        <div>
          <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? "Hide" : "Show"} {entry.more.length} more change
            {entry.more.length === 1 ? "" : "s"} in this save
          </Button>
          {open && (
            <ul className="mt-2 space-y-2 border-l pl-4">
              {entry.more.map((m) => (
                <li key={m.id} className="space-y-1">
                  <p>{sentence(m)}</p>
                  <Changes event={m} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function Changes({ event }: { event: DescribedEvent }) {
  if (event.changes.length === 0) return null;
  return (
    <table className="w-full max-w-2xl text-xs">
      <caption className="sr-only">Changes</caption>
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="w-1/4 py-1 pr-2 font-medium">Field</th>
          <th className="w-3/8 py-1 pr-2 font-medium">Previous</th>
          <th className="w-3/8 py-1 font-medium">Current</th>
        </tr>
      </thead>
      <tbody>
        {event.changes.map((c) => (
          <tr key={c.field} className="align-top">
            <td className="py-0.5 pr-2">{c.field}</td>
            <td className="break-words py-0.5 pr-2 text-muted-foreground">{c.previous}</td>
            <td className="break-words py-0.5">{c.current}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
