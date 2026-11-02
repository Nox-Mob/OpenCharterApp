import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Org } from "@/lib/orgs";
import {
  flowVersion,
  pruneAnswers,
  validateStep,
  visibleQuestions,
  visibleSteps,
  type Answers,
  type Flow,
  type FlowContext,
  type Question,
} from "@/engines/setup";
import { applyFlow, saveDraft } from "@/modules/setup/drafts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { SetupStepFrame } from "@/components/setup/step-frame";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Renders a flow-specific question type (attributes, tiers, seats…); null = not handled. */
export type CustomQuestion = (
  q: Question,
  value: unknown,
  onChange: (v: unknown) => void,
  answers: Answers,
) => ReactNode | null;

/**
 * The setup wizard for any flow (E-10): steps, drafts saved on "Save and continue",
 * a review page, and one-transaction apply through apply_setup.
 */
export function FlowWizard<P>({
  org,
  flow,
  ctx,
  initial,
  renderCustom,
  reviewExtra,
  applyErrorMessage,
}: {
  org: Org;
  flow: Flow<P>;
  ctx: FlowContext;
  initial: Answers;
  renderCustom?: CustomQuestion;
  reviewExtra?: (answers: Answers, steps: string[]) => ReactNode;
  applyErrorMessage?: (message: string) => string | null;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<Answers>(initial);
  const [stepIdx, setStepIdx] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const steps = visibleSteps(flow as Flow<unknown>, answers, ctx);
  const onReview = stepIdx >= steps.length;
  const step = steps[stepIdx];
  const set = (id: string, v: unknown) => setAnswers({ ...answers, [id]: v });

  async function next() {
    if (step) {
      const errs = validateStep(step, answers, ctx);
      setErrors(errs);
      if (Object.keys(errs).length) return;
      const custom = flow.validate?.(answers, ctx);
      if (custom) return void toast.error(custom);
    }
    try {
      await saveDraft(org.id, flow.id, pruneAnswers(flow as Flow<unknown>, answers, ctx));
      qc.invalidateQueries({ queryKey: ["setup-state", org.id] });
    } catch {
      toast.error("Couldn't save your progress");
      return;
    }
    setStepIdx(stepIdx + 1);
  }

  async function apply() {
    const final = pruneAnswers(flow as Flow<unknown>, answers, ctx);
    for (const s of steps) {
      if (Object.keys(validateStep(s, final, ctx)).length)
        return void toast.error(`Please finish "${s.title}"`);
    }
    const custom = flow.validate?.(final, ctx);
    if (custom) return void toast.error(custom);
    setBusy(true);
    try {
      await applyFlow(
        org.id,
        flow.id,
        final,
        flow.plan(final, ctx),
        flowVersion(flow as Flow<unknown>, ctx),
      );
      toast.success("Setup applied");
      await qc.invalidateQueries();
      navigate({ to: "/orgs/$orgId", params: { orgId: org.id } });
    } catch (e) {
      const msg = String((e as Error).message);
      toast.error(
        applyErrorMessage?.(msg) ??
          (msg.includes("locked")
            ? "A rule here is locked by your parent organization"
            : "Setup couldn't be applied. Nothing was changed."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        to="/orgs/$orgId"
        params={{ orgId: org.id }}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← {org.name}
      </Link>
      <h1 className="mt-2 text-3xl font-semibold">{flow.title}</h1>
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
              {flow.summarize(answers, ctx).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            {reviewExtra?.(
              answers,
              steps.map((s) => s.id),
            )}
          </>
        ) : (
          <div className="space-y-5">
            {visibleQuestions(step!, answers, ctx).map((q) => (
              <QuestionField
                key={q.id}
                q={q}
                value={answers[q.id]}
                error={errors[q.id]}
                onChange={(v) => set(q.id, v)}
                custom={renderCustom ? (v, change) => renderCustom(q, v, change, answers) : null}
              />
            ))}
          </div>
        )}
      </SetupStepFrame>
    </div>
  );
}

/** Question types that render their own label and layout. */
const SELF_LABELED = new Set(["attributes", "tiers", "seats", "seat_terms"]);

function QuestionField({
  q,
  value,
  error,
  onChange,
  custom,
}: {
  q: Question;
  value: unknown;
  error?: string | undefined;
  onChange: (v: unknown) => void;
  custom: ((value: unknown, onChange: (v: unknown) => void) => ReactNode | null) | null;
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
      default:
        return custom?.(value, onChange) ?? null;
    }
  })();
  return (
    <div className="space-y-2">
      {!SELF_LABELED.has(q.type) && <Label htmlFor={id}>{q.label}</Label>}
      {q.help && <p className="text-sm text-muted-foreground">{q.help}</p>}
      {body}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
