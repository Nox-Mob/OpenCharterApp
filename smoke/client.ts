import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import ts from "typescript";

/**
 * The live smoke test runs against STAGING (openapphub-staging) and the suite demo
 * (OpenAppHub db/seed/0002_suite_demo.sql, reset every 12 hours). The project URL and
 * publishable key are public and come from wrangler.jsonc `env.staging`; SMOKE_SUPABASE_URL
 * and SMOKE_SUPABASE_PUBLISHABLE_KEY override them (for example a local Supabase).
 */
export function stagingSetting(
  name: "VITE_SUPABASE_URL" | "VITE_SUPABASE_PUBLISHABLE_KEY",
): string {
  const override = process.env[name.replace("VITE_", "SMOKE_")];
  if (override) return override;
  const config = ts.parseConfigFileTextToJson(
    "wrangler.jsonc",
    readFileSync("wrangler.jsonc", "utf8"),
  ).config as { env?: { staging?: { vars?: Record<string, string> } } };
  const value = config.env?.staging?.vars?.[name];
  if (!value) throw new Error(`wrangler.jsonc env.staging has no ${name}`);
  return String(value);
}

/** The suite demo: the same accounts in the hub and every app. The password is public by design. */
export const DEMO = {
  password: "OpenAppHubDemo2026",
  owner: "demo@demo.openapphub.org",
  empty: "test@demo.openapphub.org",
  org: "de000000-0000-4000-8000-0000000000a1",
  slug: "riverside-community-association",
} as const;

// The smoke tests target tables whose types may lag behind; keep the client untyped.
export type Db = SupabaseClient<any, "charter">; // eslint-disable-line @typescript-eslint/no-explicit-any

export function anonClient(): Db {
  return createClient(
    stagingSetting("VITE_SUPABASE_URL"),
    stagingSetting("VITE_SUPABASE_PUBLISHABLE_KEY"),
    {
      db: { schema: "charter" },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export async function signIn(email: string): Promise<Db> {
  const db = anonClient();
  const { error } = await db.auth.signInWithPassword({ email, password: DEMO.password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return db;
}

/** Calls an RPC and returns its data, throwing with the database message on error. */
export async function rpc<T = unknown>(
  db: Db,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

/** Expects an RPC to fail; returns the error message. */
export async function rpcFails(
  db: Db,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<string> {
  const { error } = await db.rpc(fn, args);
  if (!error) throw new Error(`${fn} was expected to fail but succeeded`);
  return error.message;
}

/** Rows visible to this client (security rules applied), or the error message. */
export async function count(db: Db, table: string, filter?: [string, unknown]): Promise<number> {
  let q = db.from(table).select("*", { count: "exact", head: true });
  if (filter) q = q.eq(filter[0], filter[1] as string);
  const { count: n, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return n ?? 0;
}

export const runId = Date.now().toString(36);
