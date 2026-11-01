import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

/** Reads VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY from the environment or .env. */
function env(name: string): string {
  if (process.env[name]) return process.env[name] as string;
  if (existsSync(".env")) {
    const line = readFileSync(".env", "utf8")
      .split("\n")
      .find((l) => l.startsWith(`${name}=`));
    if (line) return line.slice(name.length + 1).replace(/^"|"$/g, "");
  }
  throw new Error(`${name} is not set`);
}

export const DEMO = {
  password: process.env["SMOKE_DEMO_PASSWORD"] ?? "OpenCharterDemo!2026",
  national: "demo-national@opencharter.test",
  chapter: "demo-chapter@opencharter.test",
  member: "demo-member@opencharter.test",
  orgs: {
    national: "d1000000-0000-4000-8000-000000000001",
    austin: "d1000000-0000-4000-8000-000000000002",
    dallas: "d1000000-0000-4000-8000-000000000003",
  },
} as const;

// The smoke tests target tables whose types may lag behind; keep the client untyped.
export type Db = SupabaseClient;

export function anonClient(): Db {
  return createClient(env("VITE_SUPABASE_URL"), env("VITE_SUPABASE_PUBLISHABLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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

export const runId = Date.now().toString(36);
