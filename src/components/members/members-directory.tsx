import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { directoryQuery, directoryText } from "@/modules/members/privacy";
import { Input } from "@/components/ui/input";

/**
 * The member directory (E-14, D-139): current members who are listed, with the fields the org
 * shows in its directory. No emails; members choose whether they appear.
 */
export function MembersDirectory({ orgId }: { orgId: string }) {
  const dir = useQuery(directoryQuery(orgId));
  const [q, setQ] = useState("");
  if (dir.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (dir.error)
    return <p className="text-muted-foreground">The directory isn't available to you.</p>;
  const needle = q.trim().toLowerCase();
  const people = (dir.data ?? []).filter(
    (p) =>
      !needle ||
      p.display_name.toLowerCase().includes(needle) ||
      Object.values(p.fields).some((v) => directoryText(v).toLowerCase().includes(needle)),
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Current members who chose to be listed. You can change your own listing on the Overview
          tab.
        </p>
        <Input
          aria-label="Search the directory"
          placeholder="Search"
          className="w-56"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {people.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          {dir.data?.length ? "Nobody matches that search." : "Nobody is listed yet."}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {people.map((p) => (
            <li key={p.profile_id} className="rounded-md border bg-card p-4">
              <p className="font-medium">{p.display_name || "Member"}</p>
              {Object.entries(p.fields).map(([label, v]) => (
                <p key={label} className="text-sm">
                  <span className="text-muted-foreground">{label}:</span> {directoryText(v)}
                </p>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
