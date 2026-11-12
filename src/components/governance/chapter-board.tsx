// Chapters on OpenBoardApp (0006_chapter_board.sql):
//   ChapterBoardCard      on a chapter's Board page: ask, wait, or open its board
//   ChapterBoardSettings  on the national's Board settings: allow it, and approve requests
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { appOrgUrl } from "@shared/apps";
import { formatDate } from "@shared/format";
import { suiteUrls } from "@shared/supabase/hosted";
import { db } from "@/lib/db/pending-schema";
import type { Org } from "@/lib/orgs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Policy = "off" | "approval" | "open";

const POLICY_TEXT: Record<Policy, string> = {
  off: "Chapters can't use OpenBoardApp",
  approval: "Chapters ask, and you approve (default)",
  open: "Any chapter can turn it on",
};

function boardLink(boardOrgId: string): string {
  const base = suiteUrls().board;
  return base ? appOrgUrl("board", base, boardOrgId) : `/board?org=${boardOrgId}`;
}

const isChapter = (org: Org) => org.parent_id !== null && (org.org_id ?? org.id) !== org.id;

export function ChapterBoardCard({ org }: { org: Org }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const status = useQuery({
    queryKey: ["chapter-board", org.id],
    enabled: isChapter(org),
    queryFn: async () => {
      const { data, error } = await db.rpc("chapter_board_status", { p_unit: org.id });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
  if (!isChapter(org) || !status.data) return null;
  const s = status.data;
  const refresh = () => qc.invalidateQueries({ queryKey: ["chapter-board", org.id] });

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success(ok);
      await refresh();
    }
  }

  let body;
  if (s.board_org_id) {
    body = (
      <>
        <p className="text-sm text-muted-foreground">
          {org.name} runs its board in OpenBoardApp. Officers appointed here appear there.
        </p>
        <Button asChild size="sm">
          <a href={boardLink(s.board_org_id)}>Open OpenBoardApp</a>
        </Button>
      </>
    );
  } else if (s.status === "pending") {
    body = (
      <>
        <p className="text-sm text-muted-foreground">
          Asked. Your national will approve or decline it, and you&apos;ll get an email.
        </p>
        {s.can_request && s.request_id ? (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(
                () => db.rpc("cancel_chapter_board_request", { p_request: s.request_id! }),
                "Request withdrawn",
              )
            }
          >
            Withdraw the request
          </Button>
        ) : null}
      </>
    );
  } else if (s.policy === "off") {
    body = (
      <p className="text-sm text-muted-foreground">
        Your national doesn&apos;t offer OpenBoardApp to chapters.
      </p>
    );
  } else {
    body = (
      <>
        <p className="text-sm text-muted-foreground">
          Meetings, agendas, minutes, votes and action items for {org.name}, with your officers
          already on the board.
          {s.policy === "approval" ? " Your national approves it first." : ""}
        </p>
        {s.status === "declined" ? (
          <p className="text-sm">Your last request was declined{s.note ? `: ${s.note}` : "."}</p>
        ) : null}
        {s.can_request ? (
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(
                () => db.rpc("request_chapter_board", { p_unit: org.id }),
                s.policy === "open" ? "OpenBoardApp is ready" : "Request sent to your national",
              )
            }
          >
            {s.policy === "open" ? "Use OpenBoardApp" : "Ask to use OpenBoardApp"}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">The chapter&apos;s admins can ask for it.</p>
        )}
      </>
    );
  }

  return (
    <section className="space-y-3 rounded-md border bg-card p-4" aria-label="OpenBoardApp">
      <h3 className="font-semibold">Run this chapter&apos;s board in OpenBoardApp</h3>
      {body}
    </section>
  );
}

export function ChapterBoardSettings({ org, canManage }: { org: Org; canManage: boolean }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  // The request being declined, and the note for the chapter.
  const [declining, setDeclining] = useState<{ id: string; note: string } | null>(null);
  const isTop = (org.org_id ?? org.id) === org.id && org.type !== "standalone";
  const policy = useQuery({
    queryKey: ["chapter-board-policy", org.id],
    enabled: isTop,
    queryFn: async () => {
      const { data, error } = await db
        .from("org_settings")
        .select("value")
        .eq("unit_id", org.id)
        .eq("key", "board.chapters")
        .maybeSingle();
      if (error) throw error;
      return ((data?.value as string | undefined) ?? "approval") as Policy;
    },
  });
  const requests = useQuery({
    queryKey: ["chapter-board-requests", org.id],
    enabled: isTop && canManage,
    queryFn: async () => {
      const { data, error } = await db.rpc("chapter_board_requests_for", { p_org: org.id });
      if (error) throw error;
      return data ?? [];
    },
  });
  if (!isTop) return null;

  async function setPolicy(value: Policy) {
    setBusy("policy");
    const { error } = await db
      .from("org_settings")
      .upsert({ unit_id: org.id, key: "board.chapters", value, mode: "override" });
    setBusy(null);
    if (error) toast.error(error.message);
    else {
      toast.success("Saved");
      await qc.invalidateQueries({ queryKey: ["chapter-board-policy", org.id] });
    }
  }

  async function decide(id: string, approve: boolean, note: string | null = null) {
    setBusy(id);
    const { error } = await db.rpc("decide_chapter_board", {
      p_request: id,
      p_approve: approve,
      p_note: note,
    });
    setBusy(null);
    if (error) toast.error(error.message);
    else {
      toast.success(approve ? "Approved: the chapter can use OpenBoardApp" : "Declined");
      setDeclining(null);
      await qc.invalidateQueries({ queryKey: ["chapter-board-requests", org.id] });
    }
  }

  const list = requests.data ?? [];
  return (
    <section className="space-y-3" aria-label="Chapters on OpenBoardApp">
      <div>
        <h2 className="text-lg font-semibold">Chapters on OpenBoardApp</h2>
        <p className="text-sm text-muted-foreground">
          A chapter that uses OpenBoardApp gets its own board there, with its officers from here.
          It&apos;s covered by {org.name}&apos;s plan.
        </p>
      </div>
      <label className="block text-sm">
        <span className="font-medium">Chapters</span>
        <select
          className="mt-1 block h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={policy.data ?? "approval"}
          disabled={!canManage || busy === "policy" || policy.isLoading}
          onChange={(e) => void setPolicy(e.target.value as Policy)}
        >
          {(Object.keys(POLICY_TEXT) as Policy[]).map((p) => (
            <option key={p} value={p}>
              {POLICY_TEXT[p]}
            </option>
          ))}
        </select>
      </label>
      {canManage && list.length > 0 ? (
        <ul className="divide-y rounded-md border bg-card">
          {list.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
            >
              <div>
                <span className="font-medium">{r.chapter}</span>{" "}
                <Badge variant={r.status === "pending" ? "default" : "secondary"}>
                  {r.status === "pending" ? "Waiting for you" : r.status}
                </Badge>
                <span className="block text-muted-foreground">
                  {r.requested_by_name ? `${r.requested_by_name}, ` : ""}
                  {formatDate(r.requested_at)}
                  {r.note ? ` · ${r.note}` : ""}
                </span>
              </div>
              {r.status === "pending" ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={busy === r.id}
                    onClick={() => void decide(r.id, true)}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === r.id}
                    onClick={() => void decide(r.id, false)}
                  >
                    Decline
                  </Button>
                </div>
              ) : r.board_org_id ? (
                <a className="text-primary hover:underline" href={boardLink(r.board_org_id)}>
                  Open its board
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
