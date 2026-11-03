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
import { PricingRulesDialog } from "./pricing-rules-dialog";
import { useFeatureReady } from "@/lib/db/readiness";
import { homeChapterInfoQuery, membershipModelQuery } from "@/modules/membership/home-chapter";
import { MembershipRulesCard } from "./membership-rules-card";
import {
  describePriceRule,
  levelLinksQuery,
  linkErrorMessage,
  makeLevelOwn,
  setLevelSuggested,
} from "@/modules/membership/suggested-levels";
import { AdoptLevelDialog, LinkedPriceDialog } from "./suggested-level-dialogs";
import { pricingRulesQuery } from "@/modules/membership/pricing";
import type { Term } from "@/modules/membership/tiers";
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
  // Pricing rules per term (E-19); needs migration 0021.
  const pricingReady = useFeatureReady("pricing_rules") === true;
  const rules = useQuery({ ...pricingRulesQuery(org.id), enabled: pricingReady });
  const [pricingFor, setPricingFor] = useState<{
    term: Term & { id: string };
    level: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  // Suggested levels (A4, D-165): the national suggests, a chapter copies or links
  const linksReady = useFeatureReady("suggested_levels") === true;
  const links = useQuery({
    ...levelLinksQuery(org.id, org.ancestor_ids),
    enabled: linksReady,
  });
  const [adopting, setAdopting] = useState<SavedTier | null>(null);
  const [pricing, setPricing] = useState<{ tier: SavedTier; source: SavedTier } | null>(null);
  // Home-chapter model (A8, D-166): members join the national; chapters sell no memberships.
  const homeReady = useFeatureReady("home_chapter") === true;
  const home = useQuery({
    ...homeChapterInfoQuery(org.slug),
    enabled: homeReady && org.type !== "national",
  });
  // A national's own model, to leave out chapter-only actions in the home-chapter model
  const ownModel = useQuery({ ...membershipModelQuery(org.id), enabled: !org.parent_id });
  const homeNational = !org.parent_id && ownModel.data === "home_chapter";
  if (tiers.isLoading || allowed.isLoading)
    return <p className="text-muted-foreground">Loading…</p>;

  const own = (tiers.data ?? []).filter((t) => t.org_id === org.id);
  const inherited = (tiers.data ?? []).filter((t) => t.org_id !== org.id && t.active);
  const mayCreate = canManage && allowed.data !== false;
  const parentName = orgs.find((o) => o.id === org.parent_id)?.name ?? "Your parent organization";

  const link = (id: string) => links.data?.get(id);
  const byId = new Map((tiers.data ?? []).map((t) => [t.id, t]));
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? "your national";
  const range = { min: rule.data?.min ?? null, max: rule.data?.max ?? null };
  // In the home-chapter model chapters have no levels, so there's nothing to suggest (D-203)
  const hasBelow = (org.type === "national" || org.type === "region") && !homeNational;
  async function runLink(action: () => Promise<void>, done: string) {
    try {
      await action();
      toast.success(done);
      qc.invalidateQueries({ queryKey: ["tiers"] });
      qc.invalidateQueries({ queryKey: ["level-links"] });
    } catch (e) {
      toast.error(linkErrorMessage(String((e as Error).message)));
    }
  }
  const refreshLinks = () => {
    setAdopting(null);
    setPricing(null);
    qc.invalidateQueries({ queryKey: ["tiers"] });
    qc.invalidateQueries({ queryKey: ["level-links"] });
  };

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

  // only below the national: the query can be cached from another page at the national itself
  if (org.parent_id && home.data?.model === "home_chapter")
    return (
      <p className="rounded-md border bg-card p-5 text-sm">
        Members join {home.data.national.name} and choose {org.name} as their chapter, so {org.name}{" "}
        doesn&apos;t sell memberships of its own. Their levels and standing come from{" "}
        {home.data.national.name}. Local dues, billed by the chapter itself, will come with
        invoicing.
      </p>
    );

  return (
    <div className="space-y-6">
      {!org.parent_id && <MembershipRulesCard org={org} orgs={orgs} />}
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
        {own.map((t) => {
          const l = link(t.id);
          const linkedTo =
            l?.link_mode === "linked" && l.source_tier_id ? byId.get(l.source_tier_id) : undefined;
          return (
            <TierCard
              key={t.id}
              tier={t}
              note={
                linkedTo
                  ? `Linked to ${orgName(linkedTo.org_id)}'s ${linkedTo.name}: ${describePriceRule(l!.price_rule, l!.price_value, orgName(linkedTo.org_id))}`
                  : l?.suggested
                    ? "Suggested to the organizations below"
                    : undefined
              }
              ruleCount={(id) =>
                (rules.data ?? []).filter((r) => r.term_id === id && r.active).length
              }
              onTerm={
                canManage && pricingReady && t.active
                  ? (term) => setPricingFor({ term, level: t.name })
                  : undefined
              }
              actions={
                canManage && (
                  <>
                    {linkedTo ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setPricing({ tier: t, source: linkedTo })}
                        >
                          Price
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Make ${t.name} your own? It stops following ${orgName(linkedTo.org_id)}'s level, and you can't link it again.`,
                              )
                            )
                              void runLink(() => makeLevelOwn(t.id), "It's your own level now");
                          }}
                        >
                          Make it our own
                        </Button>
                      </>
                    ) : (
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
                    )}
                    {linksReady && hasBelow && t.active && !linkedTo && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void runLink(
                            () => setLevelSuggested(t.id, !l?.suggested),
                            l?.suggested
                              ? "No longer suggested"
                              : "Suggested to the organizations below",
                          )
                        }
                      >
                        {l?.suggested ? "Stop suggesting" : "Suggest to chapters"}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => toggle(t)}>
                      {t.active ? "Retire" : "Restore"}
                    </Button>
                  </>
                )
              }
            />
          );
        })}
        {inherited.map((t) => (
          <TierCard
            key={t.id}
            tier={t}
            badge={orgs.find((o) => o.id === t.org_id)?.name ?? "Parent organization"}
            note={link(t.id)?.suggested ? "Suggested for you" : undefined}
            actions={
              mayCreate &&
              linksReady &&
              link(t.id)?.suggested && (
                <Button size="sm" variant="outline" onClick={() => setAdopting(t)}>
                  Start from this level
                </Button>
              )
            }
          />
        ))}
      </ul>

      {adopting && (
        <AdoptLevelDialog
          orgId={org.id}
          level={adopting}
          sourceName={orgName(adopting.org_id)}
          range={range}
          onClose={() => setAdopting(null)}
          onDone={refreshLinks}
        />
      )}
      {pricing && (
        <LinkedPriceDialog
          tierId={pricing.tier.id}
          level={pricing.source}
          current={{
            rule: link(pricing.tier.id)?.price_rule ?? "same",
            value: link(pricing.tier.id)?.price_value ?? 0,
          }}
          range={range}
          onClose={() => setPricing(null)}
          onDone={refreshLinks}
        />
      )}
      {pricingFor && (
        <PricingRulesDialog
          org={org}
          term={pricingFor.term}
          levelName={pricingFor.level}
          onClose={() => setPricingFor(null)}
        />
      )}
      {canManage && pricingReady && own.some((t) => t.active) && (
        <p className="text-xs text-muted-foreground">
          Click a term to price it by member fields, for example by rank.
        </p>
      )}
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
  note,
  actions,
  onTerm,
  ruleCount,
}: {
  tier: SavedTier;
  badge?: string;
  /** a line under the name, e.g. what a linked level follows (A4) */
  note?: string | undefined;
  actions?: React.ReactNode;
  onTerm?: ((term: Term & { id: string }) => void) | undefined;
  ruleCount?: (termId: string) => number;
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
          {note && <p className="text-sm text-primary">{note}</p>}
          {tier.description && <p className="text-sm text-muted-foreground">{tier.description}</p>}
          <p className="text-xs text-muted-foreground">
            {TAX_TREATMENT_LABELS[tier.tax_treatment]}
          </p>
        </div>
        <div className="space-x-1 whitespace-nowrap">{actions}</div>
      </div>
      <ul className="mt-2 flex flex-wrap gap-2 text-sm">
        {terms.map((x) => {
          const label = `${termLabel(lengthOf(x))} · ${formatPrice(x.price_minor, x.currency)}`;
          const n = x.id ? (ruleCount?.(x.id) ?? 0) : 0;
          const extra = n ? ` · ${n} pricing rule${n === 1 ? "" : "s"}` : "";
          return (
            <li key={x.key}>
              {onTerm && x.id ? (
                <button
                  type="button"
                  className="rounded bg-muted px-2 py-1 hover:bg-accent"
                  onClick={() => onTerm({ ...x, id: x.id! })}
                >
                  {label}
                  {extra}
                </button>
              ) : (
                <span className="inline-block rounded bg-muted px-2 py-1">
                  {label}
                  {extra}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </li>
  );
}
