import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Org } from "@/lib/orgs";
import {
  formatPrice,
  lengthOf,
  TAX_TREATMENT_LABELS,
  termLabel,
  tierInputSchema,
  normalizeTier,
  DEFAULT_LEVEL_NAME,
  type Tier,
} from "@/modules/membership/tiers";
import {
  chapterDuesRuleQuery,
  childLevelsAllowedQuery,
  saveTier,
  setTierActive,
  tierErrorMessage,
  tiersQuery,
} from "@/modules/membership/queries";
import { EMPTY_TIER } from "@/modules/membership/tiers";
import { TierDialog } from "./tier-editor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type SavedTier = Tier & { id: string; org_id: string; active: boolean };

/** Membership levels tab (E-11): this org's levels, plus its parents' levels read-only. */
export function LevelsTab({
  org,
  orgs,
  canManage,
}: {
  org: Org;
  orgs: readonly Org[];
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const tiers = useQuery(tiersQuery(org.id, org.ancestor_ids));
  const allowed = useQuery(childLevelsAllowedQuery(org.id, org.ancestor_ids));
  const rule = useQuery({
    ...chapterDuesRuleQuery(org.id, org.ancestor_ids),
    enabled: !!org.parent_id,
  });
  const [editing, setEditing] = useState<{ tier: SavedTier | null; input: Tier } | null>(null);
  const [busy, setBusy] = useState(false);
  if (tiers.isLoading || allowed.isLoading)
    return <p className="text-muted-foreground">Loading…</p>;

  const own = (tiers.data ?? []).filter((t) => t.org_id === org.id);
  const inherited = (tiers.data ?? []).filter((t) => t.org_id !== org.id && t.active);
  const mayCreate = canManage && allowed.data !== false;
  const parentName = orgs.find((o) => o.id === org.parent_id)?.name ?? "Your parent organization";

  // Other active levels of this org (the parent's levels don't count, D-126).
  const others = own.filter((t) => t.active && t.id !== editing?.tier?.id);
  const onlyLevel = others.length === 0;

  async function save() {
    if (!editing) return;
    const normalized = normalizeTier(editing.input, { onlyLevel });
    if ("error" in normalized) return void toast.error(normalized.error);
    const parsed = tierInputSchema.safeParse(normalized.tier);
    if (!parsed.success)
      return void toast.error(parsed.error.issues[0]?.message ?? "Check the level");
    setBusy(true);
    try {
      await saveTier(org.id, parsed.data, editing.tier);
      toast.success("Level saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["tiers"] });
    } catch (e) {
      toast.error(tierErrorMessage(String((e as Error).message)));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(t: SavedTier) {
    try {
      await setTierActive(t.id, !t.active);
      qc.invalidateQueries({ queryKey: ["tiers"] });
    } catch (e) {
      toast.error(tierErrorMessage(String((e as Error).message)));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-muted-foreground">
          The membership levels you offer, how long each lasts, and what it costs.
        </p>
        {mayCreate && (
          <Button onClick={() => setEditing({ tier: null, input: EMPTY_TIER })}>Add level</Button>
        )}
      </div>
      {allowed.data === false && org.parent_id && (
        <p className="rounded-md bg-muted p-3 text-sm">
          {parentName} manages membership levels, so this organization uses theirs.
        </p>
      )}

      {allowed.data !== false && rule.data?.mode === "required" && !own.some((t) => t.active) && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {parentName} requires every chapter to charge its own dues. Add a level so people can join
          here.
        </p>
      )}
      {allowed.data !== false && (rule.data?.min || rule.data?.max) && (
        <p className="text-sm text-muted-foreground">
          {parentName} sets the price range for chapter dues:{" "}
          {rule.data!.min ? `at least ${formatPrice(rule.data!.min)}` : "no minimum"},{" "}
          {rule.data!.max ? `at most ${formatPrice(rule.data!.max)}` : "no maximum"}.
        </p>
      )}
      {own.length === 0 && inherited.length === 0 && (
        <p className="rounded-md border border-dashed p-8 text-center text-muted-foreground">
          No membership levels yet.
        </p>
      )}
      <ul className="space-y-3">
        {own.map((t) => (
          <TierCard
            key={t.id}
            tier={t}
            actions={
              canManage && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setEditing({
                        tier: t,
                        input: { ...t, terms: t.terms.filter((x) => x.active !== false) },
                      })
                    }
                  >
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggle(t)}>
                    {t.active ? "Retire" : "Restore"}
                  </Button>
                </>
              )
            }
          />
        ))}
        {inherited.map((t) => (
          <TierCard
            key={t.id}
            tier={t}
            badge={orgs.find((o) => o.id === t.org_id)?.name ?? "Parent organization"}
          />
        ))}
      </ul>

      <TierDialog
        open={!!editing}
        title={editing?.tier ? `Edit ${editing.tier.name}` : "Add a membership level"}
        value={editing?.input ?? null}
        keyLocked={!!editing?.tier}
        nameOptional={onlyLevel}
        renameHint={!onlyLevel && others.some((t) => t.name === DEFAULT_LEVEL_NAME)}
        onChange={(input) => editing && setEditing({ ...editing, input })}
        onClose={() => setEditing(null)}
        primaryLabel={busy ? "Saving…" : "Save level"}
        onPrimary={save}
        busy={busy}
      />
    </div>
  );
}

function TierCard({
  tier,
  badge,
  actions,
}: {
  tier: SavedTier;
  badge?: string;
  actions?: React.ReactNode;
}) {
  const terms = tier.terms.filter((x) => x.active !== false);
  return (
    <li className={`rounded-md border bg-card p-4 ${tier.active ? "" : "opacity-60"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            {tier.name}
            {badge && (
              <Badge variant="secondary" className="ml-2">
                From {badge}
              </Badge>
            )}
            {!tier.active && (
              <Badge variant="secondary" className="ml-2">
                Retired
              </Badge>
            )}
          </p>
          {tier.description && <p className="text-sm text-muted-foreground">{tier.description}</p>}
          <p className="text-xs text-muted-foreground">
            {TAX_TREATMENT_LABELS[tier.tax_treatment]}
          </p>
        </div>
        <div className="space-x-1 whitespace-nowrap">{actions}</div>
      </div>
      <ul className="mt-2 flex flex-wrap gap-2 text-sm">
        {terms.map((x) => (
          <li key={x.key} className="rounded bg-muted px-2 py-1">
            {termLabel(lengthOf(x))} · {formatPrice(x.price_minor, x.currency)}
          </li>
        ))}
      </ul>
    </li>
  );
}
