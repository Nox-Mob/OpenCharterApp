#!/usr/bin/env bash
# Validates database rules: applies every migration to a throwaway Postgres
# (with a stub of the managed auth/storage schemas) and runs db/tests/*.sql.
# Requires TEST_DATABASE_URL pointing at a server where the user may create databases.
# Never point this at the real project database.
set -euo pipefail
: "${TEST_DATABASE_URL:?Set TEST_DATABASE_URL, e.g. postgres://postgres:postgres@localhost:5432/postgres}"
DB="oc_rules_test"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
admin() { psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"; }
target_url() { echo "${TEST_DATABASE_URL%/*}/$DB"; }
run() { psql "$(target_url)" -v ON_ERROR_STOP=1 -q -X "$@"; }

admin -c "drop database if exists $DB" -c "create database $DB"
run -f "$ROOT/db/ci/supabase-stub.sql"
for f in $(ls "$ROOT"/drizzle/migrations/*.sql | sort); do
  echo "migrate $(basename "$f")"
  run -f "$f"
done
fail=0
for f in $(ls "$ROOT"/db/tests/*.sql | sort); do
  if run -f "$f" >/dev/null; then echo "ok   $(basename "$f")"; else echo "FAIL $(basename "$f")"; fail=1; fi
done
admin -c "drop database if exists $DB"
exit $fail
