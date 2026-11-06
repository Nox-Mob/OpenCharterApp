#!/usr/bin/env bash
# The smoke test (smoke/live.smoke.test.ts, vitest in Node) against the local Supabase stack, one
# file at a time (replay job, .github/workflows/supabase-db.yml). Needs the demo fixtures
# (supabase/ci/fixtures.sql) loaded with the same SMOKE_DEMO_PASSWORD.
# Refuses any backend that isn't on this machine, and refuses to run while the Lovable .env is
# in place (the smoke client falls back to it).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
: "${SMOKE_DEMO_PASSWORD:?Set SMOKE_DEMO_PASSWORD to the password the fixtures were loaded with}"
if [ -f .env ]; then
  echo "smoke-local: move .env aside first (it points at the hosted project)" >&2
  exit 2
fi
# Local API URL and key from the running stack unless given.
if [ -z "${VITE_SUPABASE_URL:-}" ] || [ -z "${VITE_SUPABASE_PUBLISHABLE_KEY:-}" ]; then
  eval "$(supabase status -o env | grep -E '^(API_URL|ANON_KEY)=')"
  export VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-$API_URL}"
  export VITE_SUPABASE_PUBLISHABLE_KEY="${VITE_SUPABASE_PUBLISHABLE_KEY:-$ANON_KEY}"
fi
host=$(python3 -c 'import sys, urllib.parse; print(urllib.parse.urlsplit(sys.argv[1]).hostname or "")' "$VITE_SUPABASE_URL")
case "$host" in
  127.0.0.1 | localhost | ::1) ;;
  *)
    echo "smoke-local: refusing to run against '$host': only a local stack is allowed" >&2
    exit 2
    ;;
esac
# The smoke test's cleanup (purge_smoke_data) removes what was created from 5 seconds before it
# started; fixtures loaded just before would count as the run's own and be purged. Wait it out.
sleep 6
fail=0
for f in smoke/*.smoke.test.ts; do
  echo "== $f"
  bunx vitest run --config vitest.smoke.config.ts --environment node "$f" || fail=1
done
exit $fail
