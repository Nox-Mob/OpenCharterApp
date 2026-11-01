import type { ReactNode } from "react";
import { FEATURES, useFeatureReady, type Feature } from "@/lib/db/readiness";

/** Explains that a feature is waiting for a database update (D-135). */
export function DatabaseUpdateNotice({ feature }: { feature: Feature }) {
  const f = FEATURES[feature];
  return (
    <p
      role="status"
      className="rounded-md border border-dashed bg-muted/40 p-4 text-sm text-muted-foreground"
    >
      {f.label} need a database update (migration {f.migration}) that hasn't been applied yet. Ask
      Lovable to apply the pending migrations listed in the roadmap.
    </p>
  );
}

/**
 * Renders children only once the database has what they need. While checking it renders
 * nothing; when the migration is missing it shows the notice, or `fallback` if given.
 */
export function RequiresDatabase({
  feature,
  fallback,
  children,
}: {
  feature: Feature;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const ready = useFeatureReady(feature);
  if (ready === undefined) return null;
  if (!ready)
    return <>{fallback === undefined ? <DatabaseUpdateNotice feature={feature} /> : fallback}</>;
  return <>{children}</>;
}
