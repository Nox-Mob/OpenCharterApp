import { Check } from "lucide-react";
import { MODEL_CHOICES, type ModelChoice } from "@/modules/membership/home-chapter";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

const FACT_LABELS = {
  joining: "Joining",
  dues: "Dues",
  chapters: "Chapters",
  moving: "Changing chapter",
} as const;

/**
 * The two membership models side by side (A8, D-166), with what each means in practice, who it
 * suits and an example, so an organization can pick the one that matches its by-laws. Used when
 * creating a national and on Settings → General.
 */
export function ModelComparison({
  value,
  onChange,
  allowLater = false,
}: {
  value: ModelChoice | null;
  onChange: (v: ModelChoice) => void;
  allowLater?: boolean;
}) {
  return (
    <RadioGroup
      value={value ?? ""}
      onValueChange={(v) => onChange(v as ModelChoice)}
      className="space-y-3"
      aria-label="How membership works"
    >
      <div className="grid gap-3 md:grid-cols-2">
        {MODEL_CHOICES.map((m) => (
          <label
            key={m.value}
            className={cn(
              "flex cursor-pointer flex-col gap-2 rounded-md border p-4 text-sm",
              value === m.value ? "border-primary bg-primary/5" : "bg-card",
            )}
          >
            <span className="flex items-start gap-2">
              <RadioGroupItem value={m.value} aria-label={m.label} className="mt-0.5" />
              <span className="font-medium">{m.label}</span>
            </span>
            <span className="text-muted-foreground">{m.explanation}</span>
            <dl className="space-y-1">
              {(Object.keys(FACT_LABELS) as (keyof typeof FACT_LABELS)[]).map((k) => (
                <div key={k}>
                  <dt className="inline font-medium">{FACT_LABELS[k]}: </dt>
                  <dd className="inline">{m.facts[k]}</dd>
                </div>
              ))}
            </dl>
            <span className="font-medium">A good fit if:</span>
            <ul className="space-y-1">
              {m.goodFit.map((f) => (
                <li key={f} className="flex gap-1.5">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
            <span className="text-muted-foreground">Example: {m.example}</span>
          </label>
        ))}
      </div>
      {allowLater && (
        <label className="flex items-start gap-2 text-sm">
          <RadioGroupItem value="later" aria-label="Decide later" className="mt-0.5" />
          <span>
            <span className="font-medium">Decide later</span>
            <span className="block text-muted-foreground">
              Memberships are separate until you choose on Settings → General. Choose before people
              join if you want a home chapter: the choice can&apos;t be changed afterwards.
            </span>
          </span>
        </label>
      )}
    </RadioGroup>
  );
}
