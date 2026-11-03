import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { Org } from "@/lib/orgs";
import type { SettingRow } from "@/engines/settings";
import { membershipModelQuery } from "@/modules/membership/home-chapter";
import { membershipSummary } from "@/modules/membership/summary";

/**
 * "How membership works here" above a national's or standalone organization's levels (D-203):
 * the joining rules Membership setup asks about, with where to change them.
 */
export function MembershipRulesCard({ org, orgs }: { org: Org; orgs: readonly Org[] }) {
  const model = useQuery(membershipModelQuery(org.id));
  const settings = useQuery({
    queryKey: ["own-settings", org.id],
    queryFn: async (): Promise<SettingRow[]> => {
      const { data, error } = await supabase.rpc("lineage_settings", { _org: org.id });
      if (error) throw error;
      return (data ?? []) as SettingRow[];
    },
  });
  if (!model.data || !settings.data) return null;
  const lines = membershipSummary({
    orgId: org.id,
    orgType: org.type,
    model: model.data,
    settings: settings.data,
    nameOf: (id) => orgs.find((o) => o.id === id)?.name,
  });
  return (
    <section aria-labelledby="membership-rules" className="space-y-2 rounded-md border bg-card p-5">
      <h2 id="membership-rules" className="text-lg font-semibold">
        How membership works here
      </h2>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        Change these in{" "}
        <Link
          to="/orgs/$orgId"
          params={{ orgId: org.id }}
          search={{ tab: "settings" }}
          className="underline"
        >
          Settings → General
        </Link>{" "}
        or by running{" "}
        <Link to="/orgs/$orgId/setup" params={{ orgId: org.id }} className="underline">
          Membership setup
        </Link>{" "}
        again.
      </p>
    </section>
  );
}
