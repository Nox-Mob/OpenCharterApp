#!/usr/bin/env bash
# Database tests on the replayed local Supabase stack (replay job, .github/workflows/supabase-db.yml):
# loads db/tests/00_helpers.sql, then runs every other db/tests/*.sql file one at a time against
# the real Supabase auth and storage schemas (scripts/db-test.sh runs the same files on plain
# Postgres with a stub). Each test file works inside its own transaction and rolls back.
# Refuses any database that isn't on this machine.
set -euo pipefail
URL="${1:-${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

host=$(python3 -c 'import sys, urllib.parse; print(urllib.parse.urlsplit(sys.argv[1]).hostname or "")' "$URL")
case "$host" in
  127.0.0.1 | localhost | ::1) ;;
  *)
    echo "db-tests: refusing to run against '$host': only a local database (127.0.0.1, localhost) is allowed" >&2
    exit 2
    ;;
esac

run() { psql "$URL" -v ON_ERROR_STOP=1 -q -X "$@"; }

# The helpers create schema "tests"; start from a clean copy so the script can run twice.
run -c "drop schema if exists tests cascade"
run -f "$ROOT/db/tests/00_helpers.sql"

fail=0
for f in $(ls "$ROOT"/db/tests/*.sql | sort); do
  [ "$(basename "$f")" = "00_helpers.sql" ] && continue
  if out=$(run -f "$f" 2>&1 >/dev/null); then
    echo "ok   $(basename "$f")"
  else
    echo "FAIL $(basename "$f")"
    echo "$out" | sed 's/^/     /'
    fail=1
  fi
done
exit $fail
