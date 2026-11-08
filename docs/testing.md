# Testing and CI

Every change must keep all of these green (instructions.md §3). GitHub runs them in two workflows (D-197):

- **`ci.yml`, no live backend needed:** on every push to any branch, every pull request, every Monday (so new dependency advisories surface without a push) and on demand. Jobs: lint, formatting, types, unit tests and migration conventions; database rules; performance; dependency audit; build; and the docs check on pull requests.
- **`supabase-db.yml`, "Supabase database" (D-211):** on every pull request and on pushes to `main` and `supabase-migration`, the `replay` job rebuilds the database from `supabase/migrations` on a local Supabase stack (CLI 2.122.1) and checks it (below). It is skipped on a branch without `supabase/migrations`. The `deploy` job runs only by hand (Actions → Supabase database → Run workflow), after approval in the `supabase-prod` environment, with "dry run" on by default.
- **`live.yml`, the live demo backend** (the project `.env` points at: the new Supabase project since Phase 1, D-212, which needs the demo accounts from `supabase/scripts/demo-test-accounts.sql`): on pushes to `main` and `BoardUpdates`, pull requests to `main`, daily at 06:41 UTC (catching backend changes made in Lovable) and on demand (Actions → Live demo checks → Run workflow). The smoke test runs, then the end-to-end tests, never at the same time as another run, because both write to the demo organizations and clean up afterwards.

Repository settings, all optional: the secret `SMOKE_DEMO_PASSWORD` (the demo accounts' password; no default, and without it the live checks skip, D-218), and the variable `E2E_BASE_URL` (a deployed site, e.g. `https://opencharterapp.org`) to also run the checkout test on pushes to `main`, the daily run and manual runs. Branch protection, which makes these checks required before merging, is set by the repository owner (Settings → Branches).

| Check | Command | What it covers |
|---|---|---|
| Lint | `bun run lint` | ESLint, including formatting through eslint-plugin-prettier |
| Formatting | `bun run format:check` | Prettier. Planning docs and generated files are excluded (`.prettierignore`) |
| Types | `bun run typecheck` | `tsc --noEmit`, in strict mode |
| Unit tests | `bun run test` | Vitest. Pure rules live next to their code (`*.test.ts`) |
| Database rules | `TEST_DATABASE_URL=… bun run test:db` | Applies every migration to a throwaway Postgres, each in one transaction as Lovable may apply them, and runs `db/tests/*.sql` |
| Migration conventions | `bun run check:migrations` | Lovable's import rules for migrations from 0004 on: `org_id`, full grants to `authenticated`, RLS with `has_permission` / `is_org_member` policies, no `DROP TABLE` / `DROP COLUMN` (`scripts/migration-rules.ts`). Checks `drizzle/migrations` (legacy) and `supabase/migrations`, where it also needs `<14-digit timestamp>_<NNNN>_<name>.sql` names with unique timestamps and numbers in order, and RLS and a policy on every table, Lovable's first ones too |
| Replay | `supabase db reset --local` and the steps below | `supabase-db.yml`: every migration on a local Supabase stack, then lint, the RLS-and-grants catalog check, `db/tests` and the smoke test against the stack |
| Build | `bun run build` | Production build |
| Smoke test | `bun run test:smoke` | The backend flows against the live demo, without a browser (below). In `live.yml` |
| End to end | `bun run test:e2e` | Playwright against the live demo backend (D-170). In `live.yml`, after the smoke test |
| Dependency audit | `bun audit --audit-level=high` and `bun audit --production --audit-level=low` | Fails on a high or critical advisory anywhere, or any advisory in what ships to production. In CI |
| Docs check | `bash scripts/docs-check.sh origin/main` | Code or migrations changed without docs or tests (D-182). In CI on pull requests; label `no-docs-needed` to skip |
| Performance | `TEST_DATABASE_URL=… bun run test:perf` | Grows one roster in a throwaway database through 5,000, 10,000 and 20,000 members (250 per chapter; `PERF_SIZES` to change, D-209), times the heavy reads at each size and fails if one is over `PERF_BUDGET_MS` (default 1000 ms, D-181; CI uses 3000 ms for its slower shared runners); also prints the security catalogue checks (`docs/security-review.md`). In CI |

## Pre-commit hook

Install once per clone with `bun run hooks:install` (it sets `core.hooksPath` to `.githooks`). Each commit then runs lint, formatting, types, migration rules and the unit tests related to the staged files (`vitest related`), and stops the commit if any fail (D-182). Database, build and end-to-end tests stay in CI. Never bypass it with `--no-verify`; if the hook is wrong, fix the hook.

## End-to-end tests

`bun run test:e2e` (Playwright, Chromium only, D-170) starts the dev server on `127.0.0.1:4310` and drives the real screens, signed in as the demo accounts (docs/demo-data.md), against the live Lovable Cloud backend, like the smoke test. Specs live in `e2e/`; `e2e/helpers.ts` signs in through the real sign-in page.

| Spec | What it checks |
|---|---|
| `navigation` | The sidebar (no Dashboard link; the switcher's "All organizations…" opens the list; the organization's menu, Account, Sign out, D-205, D-206); the default organization opening after sign-in (D-206); the left-hand menu for a national admin (no Directory; Settings' pages appear only after clicking Settings, D-188), "View as member" and back, the member view (Overview, Directory, Board, own cards), a chapter admin's Reports for their chapter only |
| `members` | A national's Members page lists every chapter's members with their organization |
| `board-setup` | A chapter's Board page has no configuration controls and links to Settings → Board settings, where the contact-email choice opens (not saved) (D-185); guided setup under Settings → Setup |
| `join` | The join page asks every required question (Rank) before payment; joining with the test gateway and returning to the app's own address (D-158) |
| `lifecycle` | A throwaway demo national created through the screens with the home-chapter model (D-176), a chapter added with the wizard, a second chapter, a level and a member set up through the API; the member picks a chapter and changes it; the national admin sees them in the new chapter only, with the national level, and in the national's list with their chapter. The national is deleted afterwards (leftovers from earlier runs too) |
| `export` | Settings → Payments → "Export payments" downloads a CSV with the bookkeeping columns (byte-order mark for spreadsheets) (A3) |
| `levels` | In a throwaway demo national, a chapter starts from a suggested level, sees both choices explained, links it at 20% less with the price previewed, and sees the link and "Make it our own" (A4) |
| `real-use` | Privacy policy and terms linked from sign-in and sign-up (final text, no placeholder banner, the legal email as a mail link); a member's account page; the admin Overview's join page to share; the audit log's sentences and filters; importing a member from a file and removing them from the roster (skips until 0037 is applied; cleans up with `purge_smoke_data`) |
| `guide-checks` | Steps from the user-testing guide that change nothing (D-198): a home-chapter national (Test-Demo) still manages its own levels after opening its Members page; the same message for a wrong password or an unknown email; a neutral password-reset answer; signed-out visitors sent to sign in and back; only operators offered a demo org; a demo chapter can't be deleted on its own; a bad EIN refused and not saved; no emails in the directory; members see nothing to configure on the Board |
| `guide-sandbox` | Steps that change things, in a throwaway demo national with a chapter that is deleted at the end through the screens (D-198): a level in dollars; a member without an email, a membership paid in cash with the right paid-through date, a renewal from the day after; search, count and a saved view across a reload; a numbered receipt voided with a reason; seats, a required chapter seat shown as vacant, a bad role email refused, appointing and ending a term; cancelling a membership and refusing to appoint the lapsed member; a locked setting read-only at the chapter; an invitation link (signed out, wrong account, revoked); the audit log's sentences and each org seeing only its own; deleting only after typing the exact name |
| `guide-admin` | More guide steps in a throwaway demo national with a chapter (D-202): an application waits for approval and approving makes them a member (the Members list updates at once); the receipt footer on receipts issued afterwards; reissuing a receipt links the old one to the new one, and a replaced receipt can't be reissued again; a logo shows at once and at the chapter; a role defined at the national is offered at its chapter, and the only admin can't be removed; a 21-choice ordered field, used in the member filters; a chapter field locked at the national; the chapter's join page asks for the national's dues first. Its logo file and national are removed afterwards |
| `origin-guard` | A request to a site other than the app and its backend is blocked, while the app keeps working (D-186) |
| `a11y` | As each role, on the list of organizations and every main screen (including the audit log, the account page, privacy and terms): every control has an accessible name, one main heading, a page language; sign-in by keyboard with visible focus (R2, D-183) |

Notes:
- **Starting a checkout needs the service-role secret**, which only the deployed app has. The checkout test therefore runs only with `E2E_BASE_URL` (a deployed preview or the published site) or a local server started with `SUPABASE_SERVICE_ROLE_KEY`; otherwise it's skipped with that reason.
- **Clean-up:** tests that write (joining) remove what they created in the demo orgs afterwards with `purge_smoke_data` (D-150). Don't edit the demo orgs while they run.
- **Features waiting for a migration** can only be tested end to end once Lovable has applied it. Add the spec in the same change; it skips (or is marked `test.fixme`) until then.
- **Behind an outbound proxy** (some sandboxes), the browser uses `HTTPS_PROXY` for the backend and bypasses it for the local server.
- **Playwright is pinned to 1.64.1 and hardened (D-186):**
  - Import `test` and `expect` from `e2e/fixtures.ts`, never from `@playwright/test`. Its origin guard blocks every request to a host other than the app, the Supabase backend and the web fonts. Add a host for one run with `E2E_ALLOWED_HOSTS=host1,host2`. For a second page, use `guardedPage(browser, baseURL)`, not `browser.newPage()`.
  - Chromium's sandbox is on. It can't run as root: in a root-only sandbox, set `E2E_NO_SANDBOX=1`.
  - `E2E_BROWSER_CHANNEL=chrome` uses the installed Google Chrome instead of Playwright's bundled Chromium; CI does this.
  - Where Playwright's own Chromium build can't be installed, set `E2E_CHROMIUM_PATH` to an existing Chromium. In the Claude cloud sandbox: `E2E_NO_SANDBOX=1 E2E_CHROMIUM_PATH=/opt/pw-browsers/chromium bun run test:e2e`.
- In CI the job installs Google Chrome stable (`playwright install --with-deps chrome`) and runs as a non-root user with the sandbox on. It uses the repository variable `E2E_BASE_URL` when set, except on pull requests: the deployed site runs `main`, not the pull request's code, so a pull request always tests a local dev server built from its own code (D-212). It uploads traces when a test fails.

## Live smoke test

In CI it runs in `live.yml` (see the top of this page). A receipt-numbering check looks only at the receipts issued during the run, because earlier runs' receipts are purged and leave gaps in the demo org's numbering.

`bun run test:smoke` signs in as the demo accounts (docs/demo-data.md) and checks the applied migrations against the real backend, with no clicking: levels and parent control, check payments and standing, receipts and voiding, the test gateway, joining (declined, accepted, idempotent, approval, renewal, decline with refund; required join questions such as Rank are answered automatically), audited exports, saved views, the directory opt-out, board seats, terms and appointments, board setup applied twice (0018), national/region reports (0019), two-level dues with an Austin level (0020), pricing rules (0021), and creating/deleting a demo organization (0022). The dues section saves and restores the national's dues settings itself. Each run creates uniquely named records in the demo orgs only; when it finishes it calls `purge_smoke_data` (D-150) to delete everything created in the demo orgs since the run started, while the original demo data stays. Don't edit the demo orgs while a smoke run is in progress, or those edits are removed too. It is not part of `bun run test` or CI because it needs network access and changes demo data. Set `SMOKE_DEMO_PASSWORD` if the demo password changes. Checks for 0024 onwards (seat scope, contact emails, payments export, home chapter) are covered by the database tests and end-to-end specs instead.

End-to-end specs that need a home-chapter national (`guide-checks` §6.2, `lifecycle`) create a throwaway demo national and delete it afterwards, so they need only the demo accounts and orgs (D-212).

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
| `9C_smoke_purge` | Only a demo-national admin may purge, and only in the demo orgs; the purge removes what a run created (payments with their receipts, memberships, seats, levels, profiles, roles) and keeps older demo data, other orgs and older audit entries; it records one summary audit event with the counts |
| `9D_setup_board` | Board setup through `apply_setup`: seats created and updated in place without duplicates, "used by" can change (widen to the org and its chapters, narrow back) but not while it would remove a current officer (D-157), no linked roles, the parent's "no extra seats" rule, each chapter's own terms with history and no duplicate rules, seats that don't apply refused, locked parent rules, permissions |
| `9E_rollups` | Roll-ups cover the org and its subtree with correct standing, new and expiring counts; totals match the detail rows; revenue excludes test, failed and out-of-range payments and nets refunds; vacant required seats and terms past their end; report exports audited; chapter admins and members refused for the national and siblings |
| `9F_two_level_dues` | Join page shows the two steps; joining a chapter without a national membership is refused; national first (pending), then the chapter (waits for the national); two payments and two receipts; the chapter can't approve before the national; with the national current a chapter payment activates at once; chapter price range on insert and update (national prices not limited); "no chapter dues" stops chapter levels |
| `9G_pricing_rules` | The shared pricing cases (ordered "at least", yes/no, one of, number, date, first rule wins, retired ignored, unknown values) as in `src/engines/rules/rules.test.ts`; quotes from stored values and answers; joining and renewal charge the member's price; rules checked when saved; the national's range; permissions; deletes remove nothing |
| `9H_demo_orgs` | Only platform operators create demo orgs, only at the top; chapters follow their parent; the flag can't be written by clients or flipped by anyone; test gateway and "no email" follow it; deleting refuses production orgs, chapters, wrong names and non-admins, removes the whole tree with its data, keeps accounts and records an audit event |
| `9I_board_scope_overview` | Seats used by the national and every org below it, each org filling its own; only nationals and regions may use it; changing a seat's scope (widen, narrow, refused while it would remove a current officer, owner only, audited); the governance roll-up counts it everywhere; overview numbers (chapters, people counted once, current and lifetime, chapter memberships, pending, new, expiring); a chapter admin sees only their chapter; members, outsiders and anon refused |
| `9J_seat_contacts` | Officers' own emails by default; a role email replaces them (never both), normalised and validated; a vacant seat with a role email is listed; clearing goes back to the officer's email; an officer without an email; only `governance.manage` at that org (not members, siblings, or seats that don't apply), no client writes, audited; profiles stay private to members; outsiders and anon refused |
| `9K_payments_export` | Payment export: the org alone or its tree, paid and refunded only, in range, refunds netted, test payments flagged, level / term / method / reference / receipt / tax treatment; emails only for member viewers; audited with the row count; chapter admins only their chapter; members, siblings and anon refused |
| `9L_home_chapter` | Home-chapter model: separate until chosen, only a national chooses, chosen once (no change or removal), at-large chapter must be its own; join-page info for anyone; the member picks, changes and clears their chapter (record reused, history kept, seats ended); chapter admins read the national membership and count the member in overview, reports and directory, then lose it after a move; officers must be current members of the chapter; national admins move records without a login; people counted once in the national's overview; no client writes to the link; history append-only |
| `9M_levels_standing_pricing` | National standing for a chapter's members (chapter admins only; members and siblings refused); suggested levels copied (independent) or linked (name, terms, prices and retirement follow the national; same, amount off and percent off, kept within the range); linked levels can't be edited directly; making a level the chapter's own; chapters without their own levels refused; the setup pricing step applied twice gives one rule, updated in place; unknown terms and callers without permission refused |
| `9N_rollup_performance` | After 0034: each membership still uses its own org's grace days in the members roll-up, overview and directory; the directory default and a member's own choice; permission checks unchanged |
| `9O_home_chapter_settings` | 0036 (D-184): below a home-chapter national a chapter can't add or restore membership levels, even if the old setting allows it; the national still can; other edits to an existing level still work |
| `9P_ready_for_real_use` | 0037: helpers refused to anonymous callers while join pages still work; remove from roster (permissions, yourself, hand-given roles, membership cancelled with the reason, member role removed, no longer a member, audited) and restore; import (every bad row reported and nothing written, preview writes nothing, applied membership, lifetime, fields, no payment invented, audited, re-running updates without duplicates, siblings refused); the audit log (permission, setup drafts hidden, names, references, transactions, no token hashes, only the org's own events); `sync_my_email` |
| `9Q_ready_for_real_use_home` | 0037 in the home-chapter model: only the national imports, a chapter needs a membership, members land in their chapter; chapter records can't be removed, and removing the national record takes them off both rosters and logs the chapter change |
| `9R_creator_not_a_chapter_member` | 0038: a new chapter has nobody on its roster and its creator still manages it from the national but isn't a member; a new national makes its creator a member and admin |
| `9U_scale_indexes` | 0044 (D-209): every foreign key on the tables that grow with the roster has an index; JIT is off for the six heavy report functions; the overview still answers and still refuses someone without `members.view` |
| `9S_overview_people_once` | 0040: in the home-chapter model the overview counts two members due for renewal as two people, not four records; chapter memberships still count chapter records |
| `9T_no_open_read_rules` | 0042: permission lists, role permissions and logos have no "everyone" read rule; logos need sign-in and access to the organization |
| `9A_receipts` | Receipt issued for each paid payment and frozen, numbering per org and year with no gaps, can't be changed or deleted, payer and admin access, void / issue again / reissue versions, partial and full refunds |
| `90_tiers` | Membership levels and terms: isolation, term rules, parent control, retire not delete (deletes remove nothing), identity columns can't change |

## Replay on a local Supabase stack (D-211)

The `replay` job in `supabase-db.yml` builds the database the way the new Supabase project will be built, from `supabase/migrations` alone:

1. Moves the Lovable `.env` aside (the CLI and the smoke client would read it).
2. `supabase start` with only the database, auth, REST, storage and the gateway, then `supabase db reset --local`.
3. `supabase db lint --local --level error --fail-on error`.
4. `supabase/ci/post-replay-check.sql`: every `public` table has RLS on and a SELECT, INSERT, UPDATE or DELETE grant to `authenticated` or `service_role`. It reads the catalog, so tables secured in loops count too, and it names each failing table.
5. `supabase/ci/db-tests.sh`: the `db/tests/*.sql` files, one at a time, on the real Supabase `auth` and `storage` schemas. Refuses any database that isn't local, and one that already has accounts: the files build their own users and orgs (some with the demo IDs), so they run on the fresh replay, before the fixtures.
6. `supabase/ci/fixtures.sql`: the demo accounts and organizations, and an empty Test-Demo (`supabase/scripts/demo-test-accounts.sql`), with a password generated for the run.
7. `supabase/scripts/seed-test-demo.sql`: the Test-Demo seed (D-213) runs on the fixtures, so a migration that breaks it shows up here.
8. `supabase/ci/smoke-local.sh`: the smoke test (vitest, Node environment) against the stack, one file at a time. Refuses a non-local URL, or a `.env` still in place.

Locally, with Docker and the Supabase CLI 2.122.1: move `.env` aside, then run the same commands from the repository root, and put `.env` back afterwards.

## Migrations Lovable hasn't applied yet

Migrations are tested here before Lovable applies them to the live database. Until then:

- Types for them go in `src/lib/db/pending-schema.ts`, not the generated `types.ts`. Use the `db` client from there. A migration that only adds columns to an existing table can extend the generated table type there (see git history of that file for the `WithColumns` helper used for 0032).
- Screens that need them sit behind the readiness guard (`src/lib/db/readiness.ts`, `<RequiresDatabase>`). Add a feature entry with the migration name and a probe table or function.
- Add the migration to "Pending migrations for Lovable" in `/roadmap.md` and to `docs/lovable-handoff.md`. Once applied (and `types.ts` regenerated; Lovable adds a small confirm migration), remove its section from `pending-schema.ts`, mark its readiness feature `applied: true` (no more probing), and mark the roadmap row applied. The regenerated types sometimes type a nullable argument as a plain string; send `null` through a small cast helper (`sqlNull`) in that case.
- With the generated types, every SQL argument without a default is required. Send `null` explicitly (never leave the argument out): PostgREST matches functions by argument names, so a missing one fails with PGRST202.

## Adding a test

- Put a new business rule as a pure function under `src/engines` or `src/modules`, with a `*.test.ts` next to it.
- Add a database test whenever a policy, grant, trigger or RPC changes.
- Tests that need WebCrypto (signatures, encryption) start with `// @vitest-environment node`.
- A user-facing flow also gets an end-to-end spec in `e2e/` (see above). It may only run once Lovable has applied its migration.
- Component tests mock the Supabase client; when a query builder method is added (e.g. `.is()`, `.range()`), add it to the mocks that use that query.
- A new migration must also apply inside a single transaction; check with `psql -1 -f <file>` against a database with the earlier migrations.
