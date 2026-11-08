#!/usr/bin/env node
// Prints the public VITE_* values of one wrangler.jsonc environment as KEY=value lines, for the
// build step of staging.yml and release.yml (D-219). wrangler.jsonc stays the one place these
// public settings live; secrets are never in it.
//   node scripts/worker-env.mjs staging >> "$GITHUB_ENV"
//   node scripts/worker-env.mjs production --check   (exit 3 if a value is still a placeholder)
import { readFileSync } from "node:fs";
import ts from "typescript";

export function workerVars(text, envName) {
  const { config, error } = ts.parseConfigFileTextToJson("wrangler.jsonc", text);
  if (error)
    throw new Error(`wrangler.jsonc: ${ts.flattenDiagnosticMessageText(error.messageText, "\n")}`);
  const vars = envName === "top" ? config.vars : config.env?.[envName]?.vars;
  if (!vars) throw new Error(`wrangler.jsonc has no vars for environment "${envName}"`);
  return vars;
}

export function viteLines(vars) {
  return Object.entries(vars)
    .filter(([key]) => key.startsWith("VITE_"))
    .map(([key, value]) => {
      if (/[\r\n]/.test(String(value))) throw new Error(`${key} must be a single line`);
      return `${key}=${value}`;
    });
}

export const isPlaceholder = (vars) =>
  Object.values(vars).some((v) =>
    /REPLACE_WITH_|your-project-ref|sb_publishable_your_key/.test(String(v)),
  );

if (import.meta.url === `file://${process.argv[1]}`) {
  const [envName = "", flag] = process.argv.slice(2);
  if (!envName) {
    console.error("usage: node scripts/worker-env.mjs <staging|production|top> [--check]");
    process.exit(2);
  }
  const vars = workerVars(readFileSync("wrangler.jsonc", "utf8"), envName);
  if (flag === "--check") process.exit(isPlaceholder(vars) ? 3 : 0);
  console.log(viteLines(vars).join("\n"));
}
