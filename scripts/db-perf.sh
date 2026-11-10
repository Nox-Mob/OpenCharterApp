#!/usr/bin/env bash
# Performance check (R6, D-181, D-209): builds a throwaway database with the migration runner
# (OpenAppHub core, then db/migrations; scripts/migrate.mjs), then grows
# one roster through PERF_SIZES (default 5,000, 10,000 and 20,000 members; 250 per chapter, each
# with a membership and a payment; db/perf/large-roster.sql). At each size it prints how long the
# heavy reads take and fails if one is over PERF_BUDGET_MS (default 1000 ms).
# Requires TEST_DATABASE_URL, like test:db. Never point this at the real project database.
set -euo pipefail
: "${TEST_DATABASE_URL:?Set TEST_DATABASE_URL, e.g. postgres://postgres:postgres@localhost:5432/postgres}"
DB="oc_perf_test"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SIZES="${PERF_SIZES:-5000 10000 20000}"
admin() { psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"; }
run() { psql "${TEST_DATABASE_URL%/*}/$DB" -v ON_ERROR_STOP=1 -q -X "$@"; }

admin -c "drop database if exists $DB" -c "create database $DB"
run -f "$ROOT/db/ci/supabase-stub.sql"
(cd "$ROOT" && DATABASE_URL="${TEST_DATABASE_URL%/*}/$DB" node scripts/migrate.mjs >/dev/null)
run -f "$ROOT/db/tests/00_helpers.sql"
run -f "$ROOT/db/perf/setup.sql"
for n in $SIZES; do
  run -v budget_ms="${PERF_BUDGET_MS:-1000}" -v members="$n" -f "$ROOT/db/perf/large-roster.sql"
done
run -f "$ROOT/db/perf/catalogue.sql"
[ -n "${KEEP_DB:-}" ] || admin -c "drop database if exists $DB"
