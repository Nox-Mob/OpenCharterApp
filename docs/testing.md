# Testing and CI

Every change must keep all of these green (instructions.md §3). CI runs them on every push to any branch and on every pull request (`.github/workflows/ci.yml`).

| Check | Command | What it covers |
|---|---|---|
| Lint | `bun run lint` | ESLint, including formatting through eslint-plugin-prettier |
| Formatting | `bun run format:check` | Prettier. Planning docs and generated files are excluded (`.prettierignore`) |
| Types | `bun run typecheck` | `tsc --noEmit`, in strict mode |
| Unit tests | `bun run test` | Vitest. Pure rules live next to their code (`*.test.ts`) |
| Database rules | `TEST_DATABASE_URL=… bun run test:db` | Applies every migration to a throwaway Postgres and runs `db/tests/*.sql` |
| Build | `bun run build` | Production build |

## Database rule tests

`scripts/db-test.sh` creates a fresh database named `oc_rules_test`, then:

1. Loads `db/ci/supabase-stub.sql`, a small stand-in for the managed `auth`, `storage` and `extensions` schemas and the `anon`, `authenticated` and `service_role` roles.
2. Applies every migration in `drizzle/migrations`, in order.
3. Runs each test file in `db/tests`. Each file runs inside one transaction that is rolled back at the end.

Helpers live in `db/tests/00_helpers.sql`:

- `tests.fixture()` builds a national with chapters A and B, a national admin, a chapter A admin, a chapter A member, and an outsider.
- `tests.as_user(uuid)` runs the next statements as that signed-in user, so RLS applies.
- `tests.throws(sql, text)` checks that a statement fails with the given message.
- `tests.eq(got, want, label)` compares two values.

**Never** point `TEST_DATABASE_URL` at the real project database. The script drops and recreates its own test database.

Current coverage:

| File | What it checks |
|---|---|
| `10_tenant_isolation` | Who can read what, downward-only inheritance |
| `20_write_rules` | Column grants, append-only audit, org creation rules |
| `30_invitations` | Single-use, email-bound, expiring invitations |
| `40_settings` | National locks |
| `50_roles` | Role assignment, last-admin protection |
| `60_attributes` | Typed validation, inheritance, member self-edit, chapter fields, locked chapter fields |
| `70_setup` | Permission checks, transactional apply, re-run, locks, chapter fields |
| `80_custom_roles` | Custom roles: inheritance, no permission escalation, retire not delete |

## Adding a test

- Put a new business rule as a pure function under `src/engines` or `src/modules`, with a `*.test.ts` next to it.
- Add a database test whenever a policy, grant, trigger or RPC changes.
