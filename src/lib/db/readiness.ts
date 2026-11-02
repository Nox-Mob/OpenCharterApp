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
  },
  reports: {
    migration: "0019_rollups",
    label: "Reports",
    rpc: "org_rollup_governance",
    args: { _org: "00000000-0000-0000-0000-000000000000" },
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
