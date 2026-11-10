#!/usr/bin/env node
// Prints the public VITE_* values of one wrangler.jsonc environment as KEY=value lines, for the
// hosted builds (`bun run build:hosted`, `build:hosted:staging`). wrangler.jsonc stays the one
// place the hosted public settings live; secrets are never in it. The top level is production.
//   node scripts/worker-env.mjs production > .env.production.local
//   node scripts/worker-env.mjs staging --check   (exit 3 if a value is still a placeholder)
import { readFileSync } from "node:fs";
import ts from "typescript";

/**
 * "auto" picks the environment from the branch Cloudflare's Workers Builds is building
 * (WORKERS_CI_BRANCH): `main` and local builds are production, any other branch is staging,
 * so its preview (<branch>.<app>.staging.openapphub.org) uses the staging database.
 */
export function resolveTarget(arg, env = process.env) {
  if (arg !== "auto") return arg;
  const branch = env.WORKERS_CI_BRANCH;
  return branch && branch !== "main" ? "staging" : "production";
}

export function workerVars(text, envName) {
  const { config, error } = ts.parseConfigFileTextToJson("wrangler.jsonc", text);
  if (error)
    throw new Error(`wrangler.jsonc: ${ts.flattenDiagnosticMessageText(error.messageText, "\n")}`);
  const vars = envName === "production" ? config.vars : config.env?.[envName]?.vars;
  if (!vars) throw new Error(`wrangler.jsonc has no vars for environment "${envName}"`);
  return vars;
}

export function viteLines(vars) {
  return Object.entries(vars)
    .filter(([key]) => key.startsWith("VITE_"))
    .map(([key, value]) => {
      if (/[\r\n]/.test(String(value))) throw new Error(`${key} must be a single line`);
      // JSON values are single-quoted for the .env file.
      return /^[\w:/.@-]*$/.test(String(value)) ? `${key}=${value}` : `${key}='${value}'`;
    });
}

export const isPlaceholder = (vars) =>
  Object.values(vars).some((v) =>
    /REPLACE_WITH_|your-project-ref|sb_publishable_your_key/.test(String(v)),
  );

if (import.meta.url === `file://${process.argv[1]}`) {
  const [arg = "", flag] = process.argv.slice(2);
  const envName = resolveTarget(arg);
  if (envName) console.error(`build env: ${envName}`);
  if (!envName) {
    console.error("usage: node scripts/worker-env.mjs <production|staging|auto> [--check]");
    process.exit(2);
  }
  const vars = workerVars(readFileSync("wrangler.jsonc", "utf8"), envName);
  if (flag === "--check") process.exit(isPlaceholder(vars) ? 3 : 0);
  console.log(viteLines(vars).join("\n"));
}
