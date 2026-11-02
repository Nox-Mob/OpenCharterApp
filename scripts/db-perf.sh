#!/usr/bin/env bash
# Performance check (R6): applies every migration to a throwaway Postgres, seeds a large roster
# (db/perf/large-roster.sql: 20 chapters, 5,000 members) and prints how long the heavy reads take.
# Requires TEST_DATABASE_URL, like test:db. Never point this at the real project database.
set -euo pipefail
: "${TEST_DATABASE_URL:?Set TEST_DATABASE_URL, e.g. postgres://postgres:postgres@localhost:5432/postgres}"
DB="oc_perf_test"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
admin() { psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"; }
run() { psql "${TEST_DATABASE_URL%/*}/$DB" -v ON_ERROR_STOP=1 -q -X "$@"; }

admin -c "drop database if exists $DB" -c "create database $DB"
run -f "$ROOT/db/ci/supabase-stub.sql"
for f in $(ls "$ROOT"/drizzle/migrations/*.sql | sort); do run -f "$f"; done
run -f "$ROOT/db/tests/00_helpers.sql"
run -f "$ROOT/db/perf/large-roster.sql"
[ -n "${KEEP_DB:-}" ] || admin -c "drop database if exists $DB"
