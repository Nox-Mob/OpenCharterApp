import { queryOptions, useQuery } from "@tanstack/react-query";
import { db } from "./pending-schema";

/**
 * Readiness guard (D-135). Features that need a migration Lovable hasn't applied yet check
 * the live database first and show a notice instead of failing. Each feature names the
 * migration that enables it and a cheap probe: a table that migration creates, or a function.
 */
export const FEATURES = {
  memberships: { migration: "0008_memberships", label: "Memberships", table: "memberships" },
  payments: { migration: "0009_payments_gateway", label: "Payments", table: "gateway_connections" },
  joining: {
    migration: "0010_joining",
    label: "Online joining and renewal",
    rpc: "public_join_info",
    args: { _slug: "" },
  },
} as const satisfies Record<
  string,
  { migration: string; label: string; table?: string; rpc?: string; args?: object }
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

/** Probed once per session; any other error counts as ready so real problems still surface. */
export const featureReadyQuery = (feature: Feature) =>
  queryOptions({
    queryKey: ["db-ready", feature],
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    queryFn: async (): Promise<boolean> => {
      const f: { table?: string; rpc?: string; args?: object } = FEATURES[feature];
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
    },
  });

/** undefined while checking, then true / false. */
export function useFeatureReady(feature: Feature): boolean | undefined {
  return useQuery(featureReadyQuery(feature)).data;
}
