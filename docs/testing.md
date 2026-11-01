# Testing and CI

Every change must keep all of these green (instructions.md §3). CI runs them on every push to any branch and on every pull request (`.github/workflows/ci.yml`).

| Check | Command | What it covers |
|---|---|---|
| Lint | `bun run lint` | ESLint, including formatting through eslint-plugin-prettier |
| Formatting | `bun run format:check` | Prettier. Planning docs and generated files are excluded (`.prettierignore`) |
| Types | `bun run typecheck` | `tsc --noEmit`, in strict mode |
| Unit tests | `bun run test` | Vitest. Pure rules live next to their code (`*.test.ts`) |
| Database rules | `TEST_DATABASE_URL=… bun run test:db` | Applies every migration to a throwaway Postgres and runs `db/tests/*.sql` |
| Migration conventions | `bun run check:migrations` | Lovable's import rules for migrations from 0004 on: `org_id`, full grants to `authenticated`, RLS with `has_permission` / `is_org_member` policies, no `DROP TABLE` / `DROP COLUMN` (`scripts/migration-rules.ts`) |
| Build | `bun run build` | Production build |

## Live smoke test

`bun run test:smoke` signs in as the demo accounts (docs/demo-data.md) and runs the hand-off smoke test (docs/lovable-handoff.md §5) against the real backend, with no clicking: 69 checks covering the applied migrations, levels and parent control, check payments and standing, receipts and voiding, the test gateway, joining (declined, accepted, idempotent, approval, renewal, decline with refund), audited exports, saved views, the directory opt-out, and board seats, terms and appointments. Each run creates uniquely named records in the demo orgs only; when it finishes it calls `purge_smoke_data` (D-150) to delete everything created in the demo orgs since the run started — memberships, payments, receipts, levels, seats, saved views, added members and their audit entries — while the original demo data stays. Don't edit the demo orgs while a smoke run is in progress, or those edits are removed too. It is not part of `bun run test` or CI because it needs network access and changes demo data. Set `SMOKE_DEMO_PASSWORD` if the demo password changes.

Because the demo national manages membership levels, the money flows run at Demo National; Austin is used for the parent-control, sibling-isolation and chapter-seat checks.

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
| `70_setup` | Permission checks, transactional apply, re-run, locks, chapter fields, membership levels |
| `80_custom_roles` | Custom roles: inheritance, no permission escalation, retire not delete |
| `95_memberships` | Term-end and standing rules (same cases as the TypeScript), member records without a login, recording joins and stacked renewals, payment permission, read isolation, no client writes, append-only history, approve / decline / cancel, grace from settings, claiming a record by invitation |
| `96_payments_gateway` | Test gateway limited to demo orgs (or the platform flag), Stripe credentials only sealed and only by payment managers, secrets and server-only functions unreachable by clients, connection visibility, webhook events claimed once, disconnect removes credentials |
| `97_joining` | Join info without signing in, starting a join (validation, nothing written but a pending payment), only the server role completes payments, duplicate and mismatched events, renewal stacking, failures, partial and full refunds, approval rules from the parent (D-130), claiming a record by paying, test checkout outcomes, decline with refund |
| `98_exports` | Exports audited with the exporter, row count and columns, permission and sibling checks, saved views (managers save, viewers read, isolation) |
| `99_privacy` | Directory shows only current, listed members with directory fields members may see; opting out / in / back to default; org default; outsiders and siblings refused; including opted-out members in exports needs the parent's permission |
| `9B_board` | Seats a national defines apply to its chapters, chapters add their own only when allowed, each chapter's own term with by-law history (append-only, term in force on the start date, "apply to current officers" logged), seat counts, good standing, the seat's role granted and revoked without touching a role held by hand, no escalation, history can't be changed or deleted, custom titles and the parent's rule, isolation |
| `9A_receipts` | Receipt issued for each paid payment and frozen, numbering per org and year with no gaps, can't be changed or deleted, payer and admin access, void / issue again / reissue versions, partial and full refunds |
| `90_tiers` | Membership levels and terms: isolation, term rules, parent control, retire not delete (deletes remove nothing), identity columns can't change |

## Migrations Lovable hasn't applied yet

Migrations are tested here before Lovable applies them to the live database. Until then:

- Types for them go in `src/lib/db/pending-schema.ts`, not the generated `types.ts`. Use the `db` client from there.
- Screens that need them sit behind the readiness guard (`src/lib/db/readiness.ts`, `<RequiresDatabase>`). Add a feature entry with the migration name and a probe table or function.
- Add the migration to "Pending migrations for Lovable" in `/roadmap.md`. Once applied, remove its section from `pending-schema.ts` and mark it applied.

## Adding a test

- Put a new business rule as a pure function under `src/engines` or `src/modules`, with a `*.test.ts` next to it.
- Add a database test whenever a policy, grant, trigger or RPC changes.
- Tests that need WebCrypto (signatures, encryption) start with `// @vitest-environment node`.
