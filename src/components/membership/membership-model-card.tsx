import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Org } from "@/lib/orgs";
import { useFeatureReady } from "@/lib/db/readiness";
import type { SettingRow } from "@/engines/settings";
import {
  chooseMembershipModel,
  homeChapterErrorMessage,
  homeChapterInfoQuery,
  MODEL_CHOICES,
  setAtLargeChapter,
  type MembershipModel,
} from "@/modules/membership/home-chapter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModelComparison } from "./model-comparison";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NONE = "__none";

/**
 * Settings → General for a national (A8, D-166): how membership works across the tree, chosen
 * once and never changed, and (home-chapter model) the chapter for members at large.
 */
export function MembershipModelCard({
  org,
  settings,
}: {
  org: Org;
  settings: readonly SettingRow[];
}) {
  const qc = useQueryClient();
  const ready = useFeatureReady("home_chapter") === true;
  const info = useQuery({ ...homeChapterInfoQuery(org.slug), enabled: ready });
  const own = (key: string) => settings.find((s) => s.org_id === org.id && s.key === key)?.value;
  const chosen = own("membership.model") as MembershipModel | undefined;
  const [pick, setPick] = useState<MembershipModel>("separate");
  const atLarge = (own("membership.at_large_chapter") as string | undefined) || "";
  const [busy, setBusy] = useState(false);
  if (!ready || org.type !== "national" || org.parent_id) return null;

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true);
    try {
      await action();
      toast.success(done);
      await qc.invalidateQueries();
    } catch (e) {
      toast.error(homeChapterErrorMessage(String((e as Error).message)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="rounded-md border bg-card p-5 lg:col-span-2"
      aria-labelledby="model-heading"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="model-heading" className="text-lg font-semibold">
          How membership works
        </h2>
        {chosen && <Badge variant="secondary">Chosen; can&apos;t be changed</Badge>}
      </div>
      {chosen ? (
        <div className="mt-3 space-y-4 text-sm">
          <p>
            <span className="font-medium">
              {MODEL_CHOICES.find((c) => c.value === chosen)?.label}.
            </span>{" "}
            {MODEL_CHOICES.find((c) => c.value === chosen)?.explanation}
          </p>
          {chosen === "home_chapter" && (
            <div className="space-y-1">
              <p className="font-medium">Chapter for members at large (optional)</p>
              <p className="text-muted-foreground">
                For example an online chapter. People without a local chapter are offered it first.
                Members can also choose no chapter.
              </p>
              <Select
                value={atLarge || NONE}
                disabled={busy}
                onValueChange={(v) =>
                  void run(
                    () => setAtLargeChapter(org.id, v === NONE ? null : v),
                    "At-large chapter saved",
                  )
                }
              >
                <SelectTrigger className="w-72" aria-label="Chapter for members at large">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No at-large chapter</SelectItem>
                  {(info.data?.chapters ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          <p className="text-sm text-muted-foreground">
            Choose once for {org.name} and every chapter. This can&apos;t be changed later, so check
            your by-laws first. Until you choose, memberships are separate.
          </p>
          <ModelComparison value={pick} onChange={(v) => setPick(v as MembershipModel)} />
          <Button
            disabled={busy}
            onClick={() => {
              const label = MODEL_CHOICES.find((c) => c.value === pick)?.label;
              if (
                !window.confirm(
                  `Use "${label}" for ${org.name} and all its chapters? This can't be changed later.`,
                )
              )
                return;
              void run(() => chooseMembershipModel(org.id, pick), "Membership model chosen");
            }}
          >
            Choose this model
          </Button>
        </div>
      )}
    </section>
  );
}
