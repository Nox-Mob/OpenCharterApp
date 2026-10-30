import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { myOrgsQuery, myPermissionsQuery } from "@/lib/orgs";
import { hasPermission } from "@/lib/policy";
import { diffByKey, pruneAnswers, validateStep, visibleSteps, type Answers, type FlowContext, type Question } from "@/engines/setup";
import { attributeInputSchema, STARTER_ATTRIBUTES, type AttributeInput } from "@/engines/attributes";
import { initialAnswers, membershipFlow } from "@/modules/membership/setup-flow";
import { applyFlow, saveDraft, setupStateQuery } from "@/modules/setup/drafts";
import { attributeDefsQuery } from "@/modules/attributes/queries";
import { AttributeForm, EMPTY_ATTRIBUTE } from "@/components/attributes/attribute-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/orgs/$orgId_/setup")({
  head: () => ({ meta: [{ title: "Membership setup — OpenCharterApp" }] }),
  loader: async ({ context }) => {
    await Promise.all([context.queryClient.ensureQueryData(myOrgsQuery()), context.queryClient.ensureQueryData(myPermissionsQuery())]);
  },
  component: SetupPage,
});

function SetupPage() {
  const { orgId } = Route.useParams();
  const { data: orgs } = useSuspenseQuery(myOrgsQuery());
  const { data: grants } = useSuspenseQuery(myPermissionsQuery());
  const org = orgs.find((o) => o.id === orgId);
  if (!org) throw notFound();
  if (!hasPermission(grants, "setup.run", org)) return <p className="text-muted-foreground">You don't have access to setup for this organization.</p>;
  return <Wizard key={org.id} org={org} />;
}

function Wizard({ org }: { org: (ReturnType<typeof useSuspenseQuery<Awaited<ReturnType<NonNullable<ReturnType<typeof myOrgsQuery>["queryFn"]>>>>>)["data"][number] }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const ctx: FlowContext = useMemo(() => ({ orgType: org.type, orgName: org.name }), [org]);
  const state = useQuery(setupStateQuery(org.id, membershipFlow.id));
  const defs = useQuery(attributeDefsQuery(org.id, org.ancestor_ids));
  const [answers, setAnswers] = useState<Answers | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const existingOwn = useMemo(
    () =>
      (defs.data ?? [])
        .filter((d) => d.org_id === org.id && d.applies_to === "member" && d.active)
        .map((d) => ({ ...d, options: d.options.filter((o) => o.active).map((o) => ({ value: o.value, label: o.label })) })),
    [defs.data, org.id],
  );

  useEffect(() => {
    if (answers || state.isLoading || defs.isLoading) return;
    const base = initialAnswers(state.data?.answers, ctx);
    // Re-running pre-fills from current configuration (setup-engine.md §4)
    if (!state.data?.answers?.["attributes"]) base["attributes"] = existingOwn.map(({ id: _id, org_id: _o, sort_order: _s, active: _a, ...rest }) => rest);
    setAnswers(base);
  }, [answers, state.isLoading, state.data, defs.isLoading, existingOwn, ctx]);

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
      if (Object.keys(validateStep(s, final)).length) return void toast.error(`Please finish "${s.title}"`);
    }
    setBusy(true);
    try {
      await applyFlow(org.id, membershipFlow.id, final, membershipFlow.plan(final, ctx));
      toast.success("Setup applied");
      await qc.invalidateQueries();
      navigate({ to: "/orgs/$orgId", params: { orgId: org.id } });
    } catch (e) {
      toast.error(String((e as Error).message).includes("locked") ? "A rule here is locked by your parent organization" : "Setup couldn't be applied. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  const plannedAttrs = (answers["attributes"] as AttributeInput[]) ?? [];
  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/orgs/$orgId" params={{ orgId: org.id }} className="text-sm text-muted-foreground hover:underline">← {org.name}</Link>
      <h1 className="mt-2 text-3xl font-semibold">{membershipFlow.title}</h1>
      <Progress className="mt-4" value={(Math.min(stepIdx, steps.length) / steps.length) * 100} aria-label="Setup progress" />
      <p className="mt-2 text-sm text-muted-foreground">{onReview ? "Review" : `Step ${stepIdx + 1} of ${steps.length}`}</p>

      <section className="mt-6 rule-brass bg-card p-6">
        {onReview ? (
          <>
            <h2 className="text-xl font-semibold">Review and apply</h2>
            <ul className="mt-4 list-disc space-y-1 pl-5">
              {membershipFlow.summarize(answers, ctx).map((l) => <li key={l}>{l}</li>)}
            </ul>
            {plannedAttrs.length > 0 && (
              <div className="mt-4">
                <p className="font-medium">Member fields</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {diffByKey(plannedAttrs, existingOwn).map((d) => (
                    <li key={d.key} className="flex items-center gap-2">
                      <Badge variant={d.change === "same" ? "outline" : "default"}>{d.change === "add" ? "New" : d.change === "update" ? "Changed" : "No change"}</Badge>
                      {d.label}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">Fields you removed here are not deleted. Retire them from the Member fields tab.</p>
              </div>
            )}
          </>
        ) : (
          <>
            <h2 className="text-xl font-semibold">{step!.title}</h2>
            {step!.description && <p className="mt-1 text-muted-foreground">{step!.description}</p>}
            <div className="mt-6 space-y-5">
              {step!.questions.map((q) => (
                <QuestionField key={q.id} q={q} value={answers[q.id]} error={errors[q.id]} onChange={(v) => set(q.id, v)} />
              ))}
            </div>
          </>
        )}
        <div className="mt-8 flex justify-between">
          <Button variant="ghost" disabled={stepIdx === 0} onClick={() => setStepIdx(stepIdx - 1)}>Back</Button>
          {onReview ? (
            <Button onClick={apply} disabled={busy}>{busy ? "Applying…" : "Apply setup"}</Button>
          ) : (
            <Button onClick={next}>Save and continue</Button>
          )}
        </div>
      </section>
    </div>
  );
}

function QuestionField({ q, value, error, onChange }: { q: Question; value: unknown; error?: string; onChange: (v: unknown) => void }) {
  const id = `q-${q.id}`;
  const body = (() => {
    switch (q.type) {
      case "text":
        return <Input id={id} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
      case "number":
        return <Input id={id} type="number" className="w-32" value={value === null || value === undefined ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />;
      case "boolean":
        return <Switch id={id} aria-label={q.label} checked={value === true} onCheckedChange={(c) => onChange(c)} />;
      case "choice":
        return (
          <Select value={String(value ?? "")} onValueChange={onChange}>
            <SelectTrigger id={id} aria-label={q.label}><SelectValue placeholder="Choose…" /></SelectTrigger>
            <SelectContent>{q.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        );
      case "attributes":
        return <AttributesQuestion value={(value as AttributeInput[]) ?? []} onChange={onChange} />;
    }
  })();
  return (
    <div className="space-y-2">
      {q.type !== "attributes" && <Label htmlFor={id}>{q.label}</Label>}
      {q.help && <p className="text-sm text-muted-foreground">{q.help}</p>}
      {body}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function AttributesQuestion({ value, onChange }: { value: AttributeInput[]; onChange: (v: AttributeInput[]) => void }) {
  const [editing, setEditing] = useState<{ index: number | null; input: AttributeInput } | null>(null);
  const keys = new Set(value.map((v) => v.key));
  function saveEdit() {
    if (!editing) return;
    const parsed = attributeInputSchema.safeParse(editing.input);
    if (!parsed.success) return void toast.error(parsed.error.issues[0]?.message ?? "Check the field");
    if (editing.index === null && keys.has(parsed.data.key)) return void toast.error("You already have a field with that name");
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
          {STARTER_ATTRIBUTES.map((s) => (
            <label key={s.key} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={keys.has(s.key)}
                onCheckedChange={(c) => onChange(c ? [...value, { ...s, options: [...s.options] }] : value.filter((v) => v.key !== s.key))}
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
              <span>{a.label} <span className="text-muted-foreground">· {a.options.length ? `${a.options.length} choices` : a.data_type}</span></span>
              <span className="space-x-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing({ index: i, input: a })}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => onChange(value.filter((_, j) => j !== i))}>Remove</Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Button type="button" variant="outline" onClick={() => setEditing({ index: null, input: EMPTY_ATTRIBUTE })}>Create your own field</Button>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing?.index === null ? "New member field" : "Edit field"}</DialogTitle></DialogHeader>
          {editing && <AttributeForm value={editing.input} onChange={(input) => setEditing({ ...editing, input })} />}
          <Button onClick={saveEdit}>Done</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
