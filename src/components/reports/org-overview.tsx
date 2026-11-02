import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { Org } from "@/lib/orgs";
import { useFeatureReady } from "@/lib/db/readiness";
import { formatPrice } from "@/modules/membership/tiers";
import { today } from "@/modules/membership/standing";
import {
  averagePerChapter,
  lifetimeSplit,
  overviewStatsQuery,
  percent,
} from "@/modules/reports/overview";
import {
  governanceRollupQuery,
  revenueRollupQuery,
  revenueTotals,
  yearToDate,
} from "@/modules/reports/rollups";

function Tile({
  label,
  value,
  detail,
  children,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-md border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
      {children}
    </div>
  );
}

/**
 * Overview numbers for admins (D-152): the org and every org below it for a national or region,
 * only the chapter itself for a chapter. Revenue and board vacancies appear only with their own
 * permissions (payments.view, org.view), as on the Reports page.
 */
export function OrgOverview({
  org,
  canSeeRevenue,
  canSeeBoards,
}: {
  org: Org;
  canSeeRevenue: boolean;
  canSeeBoards: boolean;
}) {
  const hasChapters = org.type === "national" || org.type === "region";
  const stats = useQuery(overviewStatsQuery(org.id));
  const rollupsReady = useFeatureReady("reports") === true;
  const ytd = yearToDate(today());
  const revenue = useQuery({
    ...revenueRollupQuery(org.id, ytd.from, ytd.to),
    enabled: canSeeRevenue && rollupsReady,
  });
  const board = useQuery({
    ...governanceRollupQuery(org.id),
    enabled: canSeeBoards && rollupsReady,
  });

  if (stats.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (stats.isError || !stats.data)
    return <p className="text-sm text-destructive">Couldn't load the overview.</p>;
  const s = stats.data;
  const avg = averagePerChapter(s);
  const split = lifetimeSplit(s);
  const money = revenueTotals(revenue.data ?? []);
  const vacant = (board.data ?? []).reduce((n, r) => n + r.vacant_required, 0);
  const pastEnd = (board.data ?? []).reduce((n, r) => n + r.terms_past_end, 0);
  const scope = hasChapters ? `${org.name} and every organization below it` : org.name;

  return (
    <section className="space-y-3" aria-labelledby="overview-heading">
      <div>
        <h2 id="overview-heading" className="text-lg font-semibold">
          At a glance
        </h2>
        <p className="text-sm text-muted-foreground">
          {scope}, as of today. People who belong to more than one organization are counted once.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Current members"
          value={s.current_members}
          detail={`${s.roster} people on the roster`}
        />
        {hasChapters && (
          <Tile
            label="Chapters"
            value={s.chapters}
            detail={
              s.orgs_below > s.chapters
                ? `${s.orgs_below - s.chapters} regions as well`
                : "Directly or through regions"
            }
          />
        )}
        {hasChapters && (
          <Tile
            label="Average members per chapter"
            value={avg ?? "—"}
            detail="Current members of each chapter"
          />
        )}
        <Tile
          label="Lifetime members"
          value={split.lifetime}
          detail={`${split.other} other current members · ${percent(split.share)} lifetime`}
        >
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={`${percent(split.share)} of current members are lifetime members`}
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: percent(split.share) }}
            />
          </div>
        </Tile>
        <Tile label="New in the last 30 days" value={s.joined_30d} />
        <Tile
          label="Waiting for approval"
          value={s.pending_members}
          detail={s.pending_members > 0 ? "Review them on the Members page" : undefined}
        />
        <Tile
          label="Renewals due in 30 days"
          value={s.expiring_30}
          detail="Good standing, term ending soon"
        />
        {canSeeRevenue && rollupsReady && (
          <Tile
            label="Revenue this year"
            value={
              money.length === 0
                ? formatPrice(0, "USD")
                : money.map((m) => formatPrice(m.net, m.currency)).join(" · ")
            }
            detail="After refunds; test payments left out"
          />
        )}
        {canSeeBoards && rollupsReady && (
          <Tile
            label="Vacant required seats"
            value={vacant}
            detail={pastEnd > 0 ? `${pastEnd} terms past their planned end` : undefined}
          />
        )}
      </div>
      {hasChapters && (
        <p className="text-sm">
          <Link
            to="/orgs/$orgId"
            params={{ orgId: org.id }}
            search={{ tab: "reports" }}
            className="text-primary hover:underline"
          >
            See each chapter on the Reports page →
          </Link>
        </p>
      )}
    </section>
  );
}
