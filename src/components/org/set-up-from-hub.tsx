// Hosted: an organization made in OpenAppHub opens in OpenCharterApp once someone sets it up here
// (charter.ensure_top_unit): as a standalone association, or as a national with chapters. The
// owner or an admin does it once, and becomes the organization's Charter admin.
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { canSetUp, useHubOrgs, type HubOrg } from "@/lib/hub-orgs";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

/** The two choices for one organization. */
export function SetUpChoice({ org, size = "sm" }: { org: HubOrg; size?: "sm" | "default" }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function setUp(type: "standalone" | "national") {
    setBusy(true);
    const { error } = await supabase.rpc("ensure_top_unit", { p_org: org.id, p_type: type });
    setBusy(false);
    if (error) return void toast.error(error.message);
    await qc.invalidateQueries();
    navigate({ to: "/orgs/$orgId", params: { orgId: org.id } });
  }

  if (!canSetUp(org))
    return (
      <p className="text-sm text-muted-foreground">
        The organization's owner or an admin sets it up in OpenCharterApp first. Ask them, then come
        back here.
      </p>
    );
  return (
    <span className="flex flex-wrap gap-2">
      <Button size={size} disabled={busy} onClick={() => void setUp("standalone")}>
        Set up as an association
      </Button>
      <Button size={size} variant="outline" disabled={busy} onClick={() => void setUp("national")}>
        Set up as a national with chapters
      </Button>
    </span>
  );
}

/** Shown when the hub links to an organization that isn't set up in OpenCharterApp yet. */
export function SetUpThisOrg({ orgId }: { orgId: string }) {
  const hubOrgs = useHubOrgs();
  if (hubOrgs.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  const org = hubOrgs.data?.find((o) => o.id === orgId);
  if (!org)
    return <p className="text-muted-foreground">Organization not found or not visible to you.</p>;
  return (
    <section className="mx-auto mt-10 max-w-xl rounded-md border bg-card p-6">
      <h1 className="text-2xl font-semibold">Set up {org.name} in OpenCharterApp</h1>
      <p className="mt-2 text-muted-foreground">
        How is {org.name} organized? A single association runs its own members and dues. A national
        has chapters (and regions, if you like), each with its own members, board and money.
      </p>
      <div className="mt-5">
        <SetUpChoice org={org} size="default" />
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        A standalone association can't add chapters later, so choose national if you might.
      </p>
    </section>
  );
}
