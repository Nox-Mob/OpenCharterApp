import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { myOrgsQuery, myPermissionsQuery, type Org } from "@/lib/orgs";
import { hasPermission } from "@/lib/policy";
import {
  diffByKey,
  pruneAnswers,
  validateStep,
  visibleSteps,
  type Answers,
  type FlowContext,
  type Question,
} from "@/engines/setup";
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
import { applyFlow, saveDraft, setupStateQuery } from "@/modules/setup/drafts";
import { attributeDefsQuery } from "@/modules/attributes/queries";
import { childLevelsAllowedQuery, tiersQuery } from "@/modules/membership/queries";
import { describeTier, tierInputSchema, type Tier } from "@/modules/membership/tiers";
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
  head: () => ({ meta: [{ title: "Membership setup — OpenCharterApp" }] }),
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
  const { data: orgs } = useSuspenseQuery(myOrgsQuery());
  const { data: grants } = useSuspenseQuery(myPermissionsQuery());
  const org = orgs.find((o) => o.id === orgId);
  if (!org) throw notFound();
  if (!hasPermission(grants, "setup.run", org))
    return (
      <p className="text-muted-foreground">You don't have access to setup for this organization.</p>
    );
  return <Wizard key={org.id} org={org} />;
}

function Wizard({ org }: { org: Org }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const state = useQuery(setupStateQuery(org.id, membershipFlow.id));
  const defs = useQuery(attributeDefsQuery(org.id, org.ancestor_ids));
  const tiers = useQuery(tiersQuery(org.id, org.ancestor_ids));
  const levelsAllowed = useQuery(childLevelsAllowedQuery(org.id, org.ancestor_ids));
  const ctx: FlowContext = useMemo(
    () => ({
      orgType: org.type,
      orgName: org.name,
      childLevelsAllowed: levelsAllowed.data !== false,
    }),
    [org, levelsAllowed.data],
  );
  const [answers, setAnswers] = useState<Answers | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

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

  useEffect(() => {
    if (answers || state.isLoading || defs.isLoading || tiers.isLoading || levelsAllowed.isLoading)
      return;
    const base = initialAnswers(state.data?.answers, ctx);
    // Re-running pre-fills from current configuration (setup-engine.md §4)
    if (!state.data?.answers?.["attributes"]) base["attributes"] = existingOwn.map(toInput);
    if (!state.data?.answers?.["chapter_attributes"])
      base["chapter_attributes"] = existingChapter.map(toInput);
    if (!state.data?.answers?.["tiers"]) base["tiers"] = existingTiers;
    setAnswers(base);
  }, [
    answers,
    state.isLoading,
    state.data,
    defs.isLoading,
    tiers.isLoading,
    levelsAllowed.isLoading,
    existingOwn,
    existingChapter,
    existingTiers,
    ctx,
  ]);

  if (!answers) return <p className="text-muted-foreground">Loading…</p>;
  const steps = visibleSteps(membershipFlow, answers, ctx);
  const onReview = stepIdx >= steps.length;
  const step = steps[stepIdx];
  const set = (id: string, v: unknown) => setAnswers({ ...answers, [id]: v });

  async function next() {
    if (step) {
      const errs = validateStep(step, answers!);
      setErrors(errs);
      if (Object.keys(errs).length) return;
    }
    try {
      await saveDraft(org.id, membershipFlow.id, pruneAnswers(membershipFlow, answers!, ctx));
      qc.invalidateQueries({ queryKey: ["setup-state", org.id] });
    } catch {
      toast.error("Couldn't save your progress");
      return;
    }
    setStepIdx(stepIdx + 1);
  }

  async function apply() {
    const final = pruneAnswers(membershipFlow, answers!, ctx);
    for (const s of steps) {
      if (Object.keys(validateStep(s, final)).length)
        return void toast.error(`Please finish "${s.title}"`);
    }
    setBusy(true);
    try {
      await applyFlow(
        org.id,
        membershipFlow.id,
        final,
        membershipFlow.plan(final, ctx),
        membershipFlow.version,
      );
      toast.success("Setup applied");
      await qc.invalidateQueries();
      navigate({ to: "/orgs/$orgId", params: { orgId: org.id } });
    } catch (e) {
      toast.error(
        String((e as Error).message).includes("locked")
          ? "A rule here is locked by your parent organization"
          : "Setup couldn't be applied. Nothing was changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  const plannedAttrs = (answers["attributes"] as AttributeInput[]) ?? [];
  const plannedChapter = steps.some((s) => s.id === "chapter_fields")
    ? ((answers["chapter_attributes"] as AttributeInput[]) ?? [])
    : [];
  const plannedTiers = steps.some((s) => s.id === "levels")
    ? ((answers["tiers"] as Tier[]) ?? [])
    : [];
  return (
    <div className="mx-auto max-w-2xl">
      <Link
        to="/orgs/$orgId"
        params={{ orgId: org.id }}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← {org.name}
      </Link>
      <h1 className="mt-2 text-3xl font-semibold">{membershipFlow.title}</h1>
      <Progress
        className="mt-4"
        value={(Math.min(stepIdx, steps.length) / steps.length) * 100}
        aria-label="Setup progress"
      />
      <p className="mt-2 text-sm text-muted-foreground">
        {onReview ? "Review" : `Step ${stepIdx + 1} of ${steps.length}`}
      </p>

      <SetupStepFrame
        scrollKey={stepIdx}
        header={
          onReview ? (
            <h2 className="text-xl font-semibold">Review and apply</h2>
          ) : (
            <>
              <h2 className="text-xl font-semibold">{step!.title}</h2>
              {step!.description && (
                <p className="mt-1 text-muted-foreground">{step!.description}</p>
              )}
            </>
          )
        }
        footer={
          <>
            <Button
              variant="ghost"
              disabled={stepIdx === 0}
              onClick={() => setStepIdx(stepIdx - 1)}
            >
              Back
            </Button>
            {onReview ? (
              <Button onClick={apply} disabled={busy}>
                {busy ? "Applying…" : "Apply setup"}
              </Button>
            ) : (
              <Button onClick={next}>Save and continue</Button>
            )}
          </>
        }
      >
        {onReview ? (
          <>
            <ul className="list-disc space-y-1 pl-5">
              {membershipFlow.summarize(answers, ctx).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <FieldDiff title="Member fields" planned={plannedAttrs} existing={existingOwn} />
            <FieldDiff
              title="Chapter fields"
              planned={plannedChapter}
              existing={existingChapter}
              tab="Chapter fields"
            />
            <LevelDiff planned={plannedTiers} existing={existingTiers} />
          </>
        ) : (
          <div className="space-y-5">
            {step!.questions.map((q) => (
              <QuestionField
                key={q.id}
                q={q}
                value={answers[q.id]}
                error={errors[q.id]}
                onChange={(v) => set(q.id, v)}
              />
            ))}
          </div>
        )}
      </SetupStepFrame>
    </div>
  );
}

function QuestionField({
  q,
  value,
  error,
  onChange,
}: {
  q: Question;
  value: unknown;
  error?: string | undefined;
  onChange: (v: unknown) => void;
}) {
  const id = `q-${q.id}`;
  const body = (() => {
    switch (q.type) {
      case "text":
        return (
          <Input id={id} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
        );
      case "number":
        return (
          <Input
            id={id}
            type="number"
            className="w-32"
            value={value === null || value === undefined ? "" : String(value)}
            onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          />
        );
      case "boolean":
        return (
          <Switch
            id={id}
            aria-label={q.label}
            checked={value === true}
            onCheckedChange={(c) => onChange(c)}
          />
        );
      case "choice":
        return (
          <Select value={String(value ?? "")} onValueChange={onChange}>
            <SelectTrigger id={id} aria-label={q.label}>
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              {q.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "attributes":
        return (
          <AttributesQuestion
            value={(value as AttributeInput[]) ?? []}
            onChange={onChange}
            subject={q.subject ?? "member"}
          />
        );
      case "tiers":
        return <TiersQuestion value={(value as Tier[]) ?? []} onChange={onChange} />;
    }
  })();
  return (
    <div className="space-y-2">
      {q.type !== "attributes" && q.type !== "tiers" && <Label htmlFor={id}>{q.label}</Label>}
      {q.help && <p className="text-sm text-muted-foreground">{q.help}</p>}
      {body}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
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
  function saveEdit() {
    if (!editing) return;
    const parsed = tierInputSchema.safeParse(editing.input);
    if (!parsed.success)
      return void toast.error(parsed.error.issues[0]?.message ?? "Check the level");
    if (value.some((t, i) => t.key === parsed.data.key && i !== editing.index))
      return void toast.error("You already have a level with that name");
    const next = [...value];
    const tier = { ...editing.input, ...parsed.data };
    if (editing.index === null) next.push(tier);
    else next[editing.index] = tier;
    onChange(next);
    setEditing(null);
  }
  return (
    <div className="space-y-4">
      {value.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No levels yet. Most organizations start with one, such as "Regular".
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
