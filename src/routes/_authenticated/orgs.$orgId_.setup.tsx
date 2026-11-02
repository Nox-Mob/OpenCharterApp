import { useMemo, useState } from "react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { myOrgsQuery, myPermissionsQuery, type Org } from "@/lib/orgs";
import { hasPermission } from "@/lib/policy";
import { diffByKey, type Answers, type FlowContext } from "@/engines/setup";
import { FlowWizard } from "@/components/setup/flow-wizard";
import { BoardSetup } from "@/components/governance/board-setup";
import { RequiresDatabase } from "@/components/db/requires-database";
import { useFeatureReady } from "@/lib/db/readiness";
import { isSetupFlowId, type SetupFlowId } from "@/modules/setup/flows";
import {
  attributeInputSchema,
  forSubject,
  STARTER_ATTRIBUTES,
  STARTER_CHAPTER_ATTRIBUTES,
  type AttributeInput,
  type AttributeSubject,
} from "@/engines/attributes";
import type { DefWithOptions } from "@/modules/attributes/queries";
import { initialAnswers, membershipFlow } from "@/modules/membership/setup-flow";
import { setupStateQuery } from "@/modules/setup/drafts";
import { attributeDefsQuery } from "@/modules/attributes/queries";
import {
  childLevelsAllowedQuery,
  parentApprovalQuery,
  tiersQuery,
} from "@/modules/membership/queries";
import {
  DEFAULT_LEVEL_NAME,
  describeTier,
  normalizeTier,
  tierInputSchema,
  type Tier,
} from "@/modules/membership/tiers";
import { EMPTY_TIER } from "@/modules/membership/tiers";
import { TierDialog } from "@/components/membership/tier-editor";
import { EMPTY_ATTRIBUTE } from "@/components/attributes/attribute-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { AttributeFieldDialog } from "@/components/attributes/attribute-field-dialog";
import { SetupStepFrame } from "@/components/setup/step-frame";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/orgs/$orgId_/setup")({
  head: () => ({ meta: [{ title: "Setup — OpenCharterApp" }] }),
  // ?flow=board opens Board setup; no flow (old links) opens Membership setup.
  validateSearch: (s: Record<string, unknown>): { flow?: SetupFlowId } =>
    isSetupFlowId(s["flow"]) && s["flow"] !== "membership" ? { flow: s["flow"] } : {},
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(myOrgsQuery()),
      context.queryClient.ensureQueryData(myPermissionsQuery()),
    ]);
  },
  component: SetupPage,
});

function SetupPage() {
  const { orgId } = Route.useParams();
  const { flow = "membership" } = Route.useSearch();
  const { data: orgs } = useSuspenseQuery(myOrgsQuery());
  const { data: grants } = useSuspenseQuery(myPermissionsQuery());
  const org = orgs.find((o) => o.id === orgId);
  if (!org) throw notFound();
  if (!hasPermission(grants, "setup.run", org))
    return (
      <p className="text-muted-foreground">You don't have access to setup for this organization.</p>
    );
  return flow === "board" ? (
    <RequiresDatabase feature="board_setup">
      <BoardSetup key={org.id} org={org} />
    </RequiresDatabase>
  ) : (
    <MembershipSetup key={org.id} org={org} />
  );
}

function MembershipSetup({ org }: { org: Org }) {
  const state = useQuery(setupStateQuery(org.id, membershipFlow.id));
  const defs = useQuery(attributeDefsQuery(org.id, org.ancestor_ids));
  const tiers = useQuery(tiersQuery(org.id, org.ancestor_ids));
  const levelsAllowed = useQuery(childLevelsAllowedQuery(org.id, org.ancestor_ids));
  const parentApproval = useQuery(parentApprovalQuery(org.id, org.ancestor_ids));
  const twoLevelDues = useFeatureReady("two_level_dues");
  const ctx: FlowContext = useMemo(
    () => ({
      orgType: org.type,
      orgName: org.name,
      childLevelsAllowed: levelsAllowed.data !== false,
      twoLevelDues: twoLevelDues === true,
      ...(parentApproval.data ? { parentApproval: parentApproval.data } : {}),
    }),
    [org, levelsAllowed.data, parentApproval.data, twoLevelDues],
  );

  const existingOwn = useMemo(() => ownFields(defs.data, org.id, "member"), [defs.data, org.id]);
  const existingChapter = useMemo(
    () => ownFields(defs.data, org.id, "chapter"),
    [defs.data, org.id],
  );
  const existingTiers = useMemo(
    () =>
      (tiers.data ?? [])
        .filter((t) => t.org_id === org.id && t.active)
        .map((t) => ({ ...t, terms: t.terms.filter((x) => x.active !== false) })),
    [tiers.data, org.id],
  );

  const loading =
    state.isLoading ||
    defs.isLoading ||
    tiers.isLoading ||
    levelsAllowed.isLoading ||
    parentApproval.isLoading ||
    twoLevelDues === undefined;
  // Computed once when loading finishes, so later refetches don't reset the wizard.
  const [initial, setInitial] = useState<Answers | null>(null);
  if (!initial && !loading) {
    const base = initialAnswers(state.data?.answers, ctx);
    // Re-running pre-fills from current configuration (setup-engine.md §4)
    if (!state.data?.answers?.["attributes"]) base["attributes"] = existingOwn.map(toInput);
    if (!state.data?.answers?.["chapter_attributes"])
      base["chapter_attributes"] = existingChapter.map(toInput);
    if (!state.data?.answers?.["tiers"]) base["tiers"] = existingTiers;
    setInitial(base);
  }

  if (!initial) return <p className="text-muted-foreground">Loading…</p>;
  return (
    <FlowWizard
      org={org}
      flow={membershipFlow}
      ctx={ctx}
      initial={initial}
      renderCustom={(q, value, onChange) =>
        q.type === "attributes" ? (
          <AttributesQuestion
            value={(value as AttributeInput[]) ?? []}
            onChange={onChange}
            subject={q.subject ?? "member"}
          />
        ) : q.type === "tiers" ? (
          <TiersQuestion value={(value as Tier[]) ?? []} onChange={onChange} />
        ) : null
      }
      reviewExtra={(answers, stepIds) => (
        <>
          <FieldDiff
            title="Member fields"
            planned={(answers["attributes"] as AttributeInput[]) ?? []}
            existing={existingOwn}
          />
          <FieldDiff
            title="Chapter fields"
            planned={
              stepIds.includes("chapter_fields")
                ? ((answers["chapter_attributes"] as AttributeInput[]) ?? [])
                : []
            }
            existing={existingChapter}
            tab="Chapter fields"
          />
          <LevelDiff
            planned={stepIds.includes("levels") ? ((answers["tiers"] as Tier[]) ?? []) : []}
            existing={existingTiers}
          />
        </>
      )}
    />
  );
}

type OwnField = Omit<DefWithOptions, "options"> & { options: { value: string; label: string }[] };

/** This org's active fields of one subject, shaped like setup answers. */
function ownFields(
  defs: DefWithOptions[] | undefined,
  orgId: string,
  subject: AttributeSubject,
): OwnField[] {
  return (defs ?? [])
    .filter((d) => d.org_id === orgId && d.applies_to === subject && d.active)
    .map((d) => ({
      ...d,
      options: d.options.filter((o) => o.active).map((o) => ({ value: o.value, label: o.label })),
    }));
}

function toInput({
  id: _id,
  org_id: _o,
  sort_order: _s,
  active: _a,
  applies_to: _t,
  ...rest
}: OwnField): AttributeInput {
  return rest;
}

/** Levels compared by key and content (terms and prices included). */
function LevelDiff({ planned, existing }: { planned: Tier[]; existing: Tier[] }) {
  if (planned.length === 0) return null;
  const sig = (t: Tier) => describeTier(t) + t.description + t.tax_treatment;
  const items = diffByKey(
    planned.map((t) => ({ key: t.key, label: sig(t) })),
    existing.map((t) => ({ key: t.key, label: sig(t) })),
  );
  return (
    <div className="mt-4">
      <p className="font-medium">Membership levels</p>
      <ul className="mt-2 space-y-1 text-sm">
        {items.map((d, i) => (
          <li key={d.key} className="flex items-center gap-2">
            <Badge variant={d.change === "same" ? "outline" : "default"}>
              {d.change === "add" ? "New" : d.change === "update" ? "Changed" : "No change"}
            </Badge>
            {describeTier(planned[i]!)}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Levels or terms you removed here are not deleted. Retire them from the Membership levels
        tab.
      </p>
    </div>
  );
}

function TiersQuestion({ value, onChange }: { value: Tier[]; onChange: (v: Tier[]) => void }) {
  const [editing, setEditing] = useState<{ index: number | null; input: Tier } | null>(null);
  // Other levels in these answers; with none, this one may go unnamed (D-126).
  const others = value.filter((_, i) => i !== editing?.index);
  const onlyLevel = others.length === 0;
  function saveEdit() {
    if (!editing) return;
    const normalized = normalizeTier(editing.input, { onlyLevel });
    if ("error" in normalized) return void toast.error(normalized.error);
    const parsed = tierInputSchema.safeParse(normalized.tier);
    if (!parsed.success)
      return void toast.error(parsed.error.issues[0]?.message ?? "Check the level");
    if (value.some((t, i) => t.key === parsed.data.key && i !== editing.index))
      return void toast.error("You already have a level with that name");
    const next = [...value];
    const tier = { ...normalized.tier, ...parsed.data };
    if (editing.index === null) next.push(tier);
    else next[editing.index] = tier;
    onChange(next);
    setEditing(null);
  }
  return (
    <div className="space-y-4">
      {value.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No levels yet. If you only offer one kind of membership, you don't need to name it.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {value.map((t, i) => (
            <li key={t.key} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span>{describeTier(t)}</span>
              <span className="space-x-1 whitespace-nowrap">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing({ index: i, input: t })}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Button
        type="button"
        variant="outline"
        onClick={() => setEditing({ index: null, input: EMPTY_TIER })}
      >
        Add a level
      </Button>
      <TierDialog
        open={!!editing}
        title={editing?.index === null ? "New membership level" : "Edit level"}
        value={editing?.input ?? null}
        keyLocked={editing?.index !== null && !!editing?.input.id}
        nameOptional={onlyLevel}
        renameHint={!onlyLevel && others.some((t) => t.name === DEFAULT_LEVEL_NAME)}
        onChange={(input) => editing && setEditing({ ...editing, input })}
        onClose={() => setEditing(null)}
        primaryLabel="Done"
        onPrimary={saveEdit}
      />
    </div>
  );
}

function FieldDiff({
  title,
  planned,
  existing,
  tab = "Member fields",
}: {
  title: string;
  planned: AttributeInput[];
  existing: OwnField[];
  tab?: string;
}) {
  if (planned.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="font-medium">{title}</p>
      <ul className="mt-2 space-y-1 text-sm">
        {diffByKey(planned, existing).map((d) => (
          <li key={d.key} className="flex items-center gap-2">
            <Badge variant={d.change === "same" ? "outline" : "default"}>
              {d.change === "add" ? "New" : d.change === "update" ? "Changed" : "No change"}
            </Badge>
            {d.label}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Fields you removed here are not deleted. Retire them from the {tab} tab.
      </p>
    </div>
  );
}

function AttributesQuestion({
  value,
  onChange,
  subject,
}: {
  value: AttributeInput[];
  onChange: (v: AttributeInput[]) => void;
  subject: AttributeSubject;
}) {
  const starters = subject === "chapter" ? STARTER_CHAPTER_ATTRIBUTES : STARTER_ATTRIBUTES;
  const [editing, setEditing] = useState<{ index: number | null; input: AttributeInput } | null>(
    null,
  );
  const keys = new Set(value.map((v) => v.key));
  function saveEdit() {
    if (!editing) return;
    const parsed = attributeInputSchema.safeParse(forSubject(editing.input, subject));
    if (!parsed.success)
      return void toast.error(parsed.error.issues[0]?.message ?? "Check the field");
    if (editing.index === null && keys.has(parsed.data.key))
      return void toast.error("You already have a field with that name");
    const next = [...value];
    if (editing.index === null) next.push(parsed.data);
    else next[editing.index] = parsed.data;
    onChange(next);
    setEditing(null);
  }
  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium">Common fields</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {starters.map((s) => (
            <label key={s.key} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={keys.has(s.key)}
                onCheckedChange={(c) =>
                  onChange(
                    c
                      ? [...value, { ...s, options: [...s.options] }]
                      : value.filter((v) => v.key !== s.key),
                  )
                }
              />
              {s.label}
            </label>
          ))}
        </div>
      </div>
      {value.length > 0 && (
        <ul className="divide-y rounded-md border">
          {value.map((a, i) => (
            <li key={a.key} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>
                {a.label}{" "}
                <span className="text-muted-foreground">
                  · {a.options.length ? `${a.options.length} choices` : a.data_type}
                </span>
              </span>
              <span className="space-x-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing({ index: i, input: a })}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Button
        type="button"
        variant="outline"
        onClick={() => setEditing({ index: null, input: EMPTY_ATTRIBUTE })}
      >
        Create your own field
      </Button>
      <AttributeFieldDialog
        open={!!editing}
        title={
          editing?.index === null
            ? subject === "chapter"
              ? "New chapter field"
              : "New member field"
            : "Edit field"
        }
        value={editing?.input ?? null}
        onChange={(input) => editing && setEditing({ ...editing, input })}
        onClose={() => setEditing(null)}
        primaryLabel="Done"
        onPrimary={saveEdit}
        subject={subject}
      />
    </div>
  );
}
