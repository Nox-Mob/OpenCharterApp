import { queryOptions, useQuery } from "@tanstack/react-query";
import { db } from "./pending-schema";

/**
 * Readiness guard (D-135). Features that need a migration Lovable hasn't applied yet check
 * the live database first and show a notice instead of failing. Each feature names the
 * migration that enables it and a cheap probe: a table that migration creates, or a function.
 * Once Lovable applies the migration, mark the feature `applied: true` (no more probing).
 */
export const FEATURES = {
  memberships: {
    migration: "0008_memberships",
    label: "Memberships",
    table: "memberships",
    applied: true,
  },
  payments: {
    migration: "0009_payments_gateway",
    label: "Payments",
    table: "gateway_connections",
    applied: true,
  },
  directory: {
    migration: "0012_member_privacy",
    label: "The member directory and privacy choices",
    rpc: "member_directory",
    args: { _org: "00000000-0000-0000-0000-000000000000" },
    applied: true,
  },
  receipts: { migration: "0013_receipts", label: "Receipts", table: "receipts", applied: true },
  board: {
    migration: "0014_board_seats",
    label: "Board and officers",
    table: "seat_templates",
    applied: true,
  },
  board_setup: {
    migration: "0018_setup_governance",
    label: "Board setup",
    rpc: "apply_setup_sections",
    args: {},
    applied: true,
  },
  reports: {
    migration: "0019_rollups",
    label: "Reports",
    rpc: "org_rollup_governance",
    args: { _org: "00000000-0000-0000-0000-000000000000" },
    applied: true,
  },
  two_level_dues: {
    migration: "0020_two_level_dues",
    label: "Two-level dues",
    rpc: "join_requirements",
    args: { _org: "00000000-0000-0000-0000-000000000000" },
    applied: true,
  },
  pricing_rules: {
    migration: "0021_pricing_rules",
    label: "Pricing rules",
    table: "pricing_rules",
    applied: true,
  },
  demo_orgs: {
    migration: "0022_demo_orgs",
    label: "Demo organizations",
    rpc: "is_platform_operator",
    args: {},
    applied: true,
  },
  overview: {
    migration: "0024_board_scope_and_overview",
    label: "Overview numbers",
    rpc: "org_overview_stats",
    args: { _org: "00000000-0000-0000-0000-000000000000" },
    applied: true,
  },
  seat_contacts: {
    migration: "0026_seat_contacts",
    label: "Board contact emails",
    table: "seat_contacts",
    applied: true,
  },
  home_chapter: {
    migration: "0030_home_chapter",
    label: "Choosing a home chapter",
    rpc: "public_home_chapter_info",
    args: { _slug: "" },
    applied: true,
  },
  payments_export: {
    migration: "0029_payments_export",
    label: "Payment exports",
    rpc: "export_payments",
    args: {
      _org: "00000000-0000-0000-0000-000000000000",
      _from: "2000-01-01",
      _to: "2000-01-01",
    },
    applied: true,
  },
  national_standing: {
    migration: "0032_levels_standing_pricing_setup",
    label: "National standing for chapters",
    rpc: "chapter_national_standing",
    args: { _chapter: "00000000-0000-0000-0000-000000000000" },
  },
  suggested_levels: {
    migration: "0032_levels_standing_pricing_setup",
    label: "Suggested levels",
    rpc: "make_level_own",
    args: { _tier: "00000000-0000-0000-0000-000000000000" },
  },
  setup_pricing: {
    migration: "0032_levels_standing_pricing_setup",
    label: "Pricing step in Membership setup",
    rpc: "chapter_national_standing",
    args: { _chapter: "00000000-0000-0000-0000-000000000000" },
  },
  exports: {
    migration: "0011_member_exports",
    label: "Member exports and saved views",
    table: "member_segments",
    applied: true,
  },
  joining: {
    migration: "0010_joining",
    label: "Online joining and renewal",
    rpc: "public_join_info",
    args: { _slug: "" },
    applied: true,
  },
} as const satisfies Record<
  string,
  {
    migration: string;
    label: string;
    table?: string;
    rpc?: string;
    args?: object;
    /** Lovable applied it to the live database: no probe, always ready. */
    applied?: boolean;
  }
>;
export type Feature = keyof typeof FEATURES;

type MaybeError = { code?: string; message?: string } | null | undefined;

/** True when PostgREST / Postgres says the table or function doesn't exist (not yet migrated). */
export function isMissingSchemaError(error: MaybeError): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  if (["PGRST205", "PGRST202", "42P01", "42883"].includes(code)) return true;
  const msg = (error.message ?? "").toLowerCase();
  return (
    msg.includes("could not find the table") ||
    msg.includes("could not find the function") ||
    (msg.includes("relation") && msg.includes("does not exist"))
  );
}

/** Probes the live database for a feature's table or function. */
export async function probeReady(f: {
  table?: string;
  rpc?: string;
  args?: object;
}): Promise<boolean> {
  // Untyped on purpose: the probe must work whether or not the generated types know the table.
  const client = db as unknown as {
    from: (t: string) => {
      select: (
        c: string,
        o: { head: boolean },
      ) => { limit: (n: number) => Promise<{ error: MaybeError }> };
    };
    rpc: (fn: string, args: object) => Promise<{ error: MaybeError }>;
  };
  const { error } = f.table
    ? await client.from(f.table).select("id", { head: true }).limit(1)
    : await client.rpc(f.rpc!, f.args ?? {});
  return !isMissingSchemaError(error);
}

const isApplied = (feature: Feature) =>
  (FEATURES[feature] as { applied?: boolean }).applied === true;

/**
 * Probed once per session; any other error counts as ready so real problems still surface.
 * Features whose migration is applied skip the probe.
 */
export const featureReadyQuery = (feature: Feature) =>
  queryOptions({
    queryKey: ["db-ready", feature],
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    ...(isApplied(feature) ? { initialData: true } : {}),
    queryFn: async (): Promise<boolean> =>
      isApplied(feature) ? true : probeReady(FEATURES[feature]),
  });

/** undefined while checking, then true / false. */
export function useFeatureReady(feature: Feature): boolean | undefined {
  return useQuery(featureReadyQuery(feature)).data;
}
