# Phase 0 inventory: moving the database off Lovable Cloud

Status on 2026-11-06. Phase 0 rebuilds the whole database from `supabase/migrations` with the Supabase CLI and can deploy that history to the new Supabase project. App behaviour doesn't change. Phase 1 (the cutover: `.env`, sign-in, AI, email) comes later. Decision: D-211.

- Supabase CLI: **2.122.1**, pinned in `.github/workflows/supabase-db.yml` and every doc here.
- Workflow: `.github/workflows/supabase-db.yml` ("Supabase database"), with jobs `has-migrations`, `replay` and `deploy`.
- Settings the owner re-enters on the new project: [`settings-to-reenter.md`](settings-to-reenter.md).

## 0. CI baseline (before any change)

On `main` at `c19a702` (2026-11-06), every job in `.github/workflows/ci.yml` passed: lint, formatting, types, unit tests, migration conventions, database rules, performance, dependency audit (`bun audit` high anywhere / low in production) and the production build. The docs check is skipped on pushes. The scheduled `live.yml` run (smoke test and end-to-end tests against the Lovable demo backend) also passed. **No job failed before Phase 0**, so nothing needed fixing and no new failure can hide behind an old one.

## 1. Migrations, in applied order

Lovable applied `drizzle/migrations` in journal order (`drizzle/migrations/meta/_journal.json`). Each file is copied **byte for byte** to `supabase/migrations/<timestamp>_<tag>.sql`. The timestamp is the journal's `when` value (UTC), cut to whole seconds. Where two entries fall in the same second, the later one gets the next second, so timestamps stay unique and keep the order. The `NNNN` number stays in the name, so the static check can still apply rules by number. `drizzle/` is kept, read-only and legacy: Lovable still applies it until the cutover.

| # | File in `supabase/migrations` | Source | Journal `when` (ms) | Note |
|---|---|---|---|---|
| 0 | `20261030134653_0000_migration.sql` | `drizzle/migrations/0000_migration.sql` | 1793368013880 |  |
| 1 | `20261030135351_0001_invitations_settings_branding.sql` | `drizzle/migrations/0001_invitations_settings_branding.sql` | 1793368431974 |  |
| 2 | `20261030135908_0002_fix_audit_trigger_for_keyless_tables.sql` | `drizzle/migrations/0002_fix_audit_trigger_for_keyless_tables.sql` | 1793368748614 |  |
| 3 | `20261030141536_0003_roles_attributes_setup_engine.sql` | `drizzle/migrations/0003_roles_attributes_setup_engine.sql` | 1793369736099 |  |
| 4 | `20261031132000_0004_custom_roles_chapter_fields.sql` | `drizzle/migrations/0004_custom_roles_chapter_fields.sql` | 1793452800000 |  |
| 5 | `20261101132000_0005_chapter_field_lock.sql` | `drizzle/migrations/0005_chapter_field_lock.sql` | 1793539200000 |  |
| 6 | `20261101140000_0006_membership_levels.sql` | `drizzle/migrations/0006_membership_levels.sql` | 1793541600000 |  |
| 7 | `20261101140001_0007_confirm_levels_applied.sql` | `drizzle/migrations/0007_confirm_levels_applied.sql` | 1793541600001 | timestamp +1 s (same second as the one before) |
| 8 | `20261101150000_0008_memberships.sql` | `drizzle/migrations/0008_memberships.sql` | 1793545200001 |  |
| 9 | `20261101160000_0009_payments_gateway.sql` | `drizzle/migrations/0009_payments_gateway.sql` | 1793548800001 |  |
| 10 | `20261101170000_0010_joining.sql` | `drizzle/migrations/0010_joining.sql` | 1793552400001 |  |
| 11 | `20261101180000_0011_member_exports.sql` | `drizzle/migrations/0011_member_exports.sql` | 1793556000001 |  |
| 12 | `20261101190000_0012_member_privacy.sql` | `drizzle/migrations/0012_member_privacy.sql` | 1793559600001 |  |
| 13 | `20261101200000_0013_receipts.sql` | `drizzle/migrations/0013_receipts.sql` | 1793563200001 |  |
| 14 | `20261101210000_0014_board_seats.sql` | `drizzle/migrations/0014_board_seats.sql` | 1793566800001 |  |
| 15 | `20261101232319_0015_confirm_0008_0014_applied.sql` | `drizzle/migrations/0015_confirm_0008_0014_applied.sql` | 1793575399126 |  |
| 16 | `20261101233831_0016_purge_smoke_data.sql` | `drizzle/migrations/0016_purge_smoke_data.sql` | 1793576311604 |  |
| 17 | `20261102004000_0017_purge_audit_summary.sql` | `drizzle/migrations/0017_purge_audit_summary.sql` | 1793580000001 |  |
| 18 | `20261102014000_0018_setup_governance.sql` | `drizzle/migrations/0018_setup_governance.sql` | 1793583600001 |  |
| 19 | `20261102024000_0019_rollups.sql` | `drizzle/migrations/0019_rollups.sql` | 1793587200001 |  |
| 20 | `20261102034000_0020_two_level_dues.sql` | `drizzle/migrations/0020_two_level_dues.sql` | 1793590800001 |  |
| 21 | `20261102044000_0021_pricing_rules.sql` | `drizzle/migrations/0021_pricing_rules.sql` | 1793594400001 |  |
| 22 | `20261102054000_0022_demo_orgs.sql` | `drizzle/migrations/0022_demo_orgs.sql` | 1793598000001 |  |
| 23 | `20261102054001_0023_confirm_0017_0022_applied.sql` | `drizzle/migrations/0023_confirm_0017_0022_applied.sql` | 1793598000002 | timestamp +1 s (same second as the one before) |
| 24 | `20261102064000_0024_board_scope_and_overview.sql` | `drizzle/migrations/0024_board_scope_and_overview.sql` | 1793601600001 |  |
| 25 | `20261102064001_0025_confirm_0024_applied.sql` | `drizzle/migrations/0025_confirm_0024_applied.sql` | 1793601600002 | timestamp +1 s (same second as the one before) |
| 26 | `20261102074000_0026_seat_contacts.sql` | `drizzle/migrations/0026_seat_contacts.sql` | 1793605200002 |  |
| 27 | `20261102084000_0027_board_setup_scope_and_demo_rank.sql` | `drizzle/migrations/0027_board_setup_scope_and_demo_rank.sql` | 1793608800002 |  |
| 28 | `20261102133131_0028_confirm_0026_0027_applied.sql` | `drizzle/migrations/0028_confirm_0026_0027_applied.sql` | 1793626291231 |  |
| 29 | `20261102143131_0029_payments_export.sql` | `drizzle/migrations/0029_payments_export.sql` | 1793629891231 |  |
| 30 | `20261102153131_0030_home_chapter.sql` | `drizzle/migrations/0030_home_chapter.sql` | 1793633491231 |  |
| 31 | `20261102171338_0031_confirm_0029_0030_applied.sql` | `drizzle/migrations/0031_confirm_0029_0030_applied.sql` | 1793639618976 |  |
| 32 | `20261102181338_0032_levels_standing_pricing_setup.sql` | `drizzle/migrations/0032_levels_standing_pricing_setup.sql` | 1793643218976 |  |
| 33 | `20261102191338_0033_home_chapter_delete_fix.sql` | `drizzle/migrations/0033_home_chapter_delete_fix.sql` | 1793646818976 |  |
| 34 | `20261102201338_0034_rollup_performance.sql` | `drizzle/migrations/0034_rollup_performance.sql` | 1793650418976 |  |
| 35 | `20261102202242_0035_confirm_0032_0034_applied.sql` | `drizzle/migrations/0035_confirm_0032_0034_applied.sql` | 1793650962298 |  |
| 36 | `20261102212242_0036_home_chapter_no_chapter_levels.sql` | `drizzle/migrations/0036_home_chapter_no_chapter_levels.sql` | 1793654562298 |  |
| 37 | `20261102222242_0037_ready_for_real_use.sql` | `drizzle/migrations/0037_ready_for_real_use.sql` | 1793658162298 |  |
| 38 | `20261102232242_0038_creator_not_a_chapter_member.sql` | `drizzle/migrations/0038_creator_not_a_chapter_member.sql` | 1793661762298 |  |
| 39 | `20261103063754_0039_confirm_0036_0038_applied.sql` | `drizzle/migrations/0039_confirm_0036_0038_applied.sql` | 1793687874742 |  |
| 40 | `20261103073754_0040_overview_people_once.sql` | `drizzle/migrations/0040_overview_people_once.sql` | 1793691474742 |  |
| 41 | `20261103133823_0041_0041_confirm_0040_applied.sql` | `drizzle/migrations/0041_0041_confirm_0040_applied.sql` | 1793713103793 |  |
| 42 | `20261103214710_0042_tighten_permission_and_logo_reads.sql` | `drizzle/migrations/0042_tighten_permission_and_logo_reads.sql` | 1793742430586 |  |
| 43 | `20261103221202_0043_permissions_read_role_holders.sql` | `drizzle/migrations/0043_permissions_read_role_holders.sql` | 1793743922005 |  |
| 44 | `20261103231202_0044_scale_indexes.sql` | `drizzle/migrations/0044_scale_indexes.sql` | 1793747522005 |  |
| 45 | `20261105045240_0045_confirm_0044_applied.sql` | `drizzle/migrations/0045_confirm_0044_applied.sql` | 1793854360392 |  |
| 46 | `20261106000000_0046_storage_buckets.sql` | new (Phase 0) | — | creates the `branding` bucket |

Fixes found during the replay go in new migrations, never in these files (§7).

## 2. What the migrations create

Read from the catalog of a replayed local database (`supabase db reset`).

- **Schemas:** `public`; `private` (`create schema if not exists private`, not exposed through the API: gateway secrets, platform flags and operators). `auth`, `storage` and `extensions` belong to Supabase.
- **Extensions:** none created by the migrations. They use `pgcrypto` (`digest`, `gen_random_bytes`), which every Supabase project has in `extensions`. No `pg_cron`, `pg_net` or `http`.
- **Tables (31 in `public`, 3 in `private`):** `public.affiliation_history`, `appointments`, `attribute_definitions`, `attribute_options`, `attribute_values`, `audit_events`, `gateway_connections`, `invitations`, `member_segments`, `membership_events`, `membership_tiers`, `memberships`, `org_member_profiles`, `org_settings`, `organizations`, `payments`, `permissions`, `pricing_rules`, `receipt_counters`, `receipts`, `role_assignments`, `role_permissions`, `roles`, `seat_contacts`, `seat_templates`, `seat_terms`, `seat_title_overrides`, `setup_states`, `tax_profiles`, `tier_terms`, `webhook_events`; `private.gateway_secrets`, `private.platform_flags`, `private.platform_operators`. Links and write paths: [`docs/tables.md`](../tables.md).
- **Views:** none.
- **Functions:** 147 in `public` (134 `security definer`), none in `private`. These include the RPCs the app calls (`create_organization`, `create_invitation`/`accept_invitation`, `apply_setup`, `set_attribute_value`, `record_membership`, `begin_join`, `purge_smoke_data`, `audit_log`, `import_members`, …), the permission helpers (`has_permission`, `is_org_member`) and the trigger functions.
- **Triggers:** an `audit_<table>` trigger on every audited table (`audit_row_change`); append-only guards (`affiliation_history`, `membership_events`, `seat_terms`); `org_settings_lock` (`enforce_setting_lock`) and `membership_model_guard`; `organizations_ancestors`, `organizations_demo_guard`; `payments_receipts`, `receipts_guard`; `appointments_guard`; the level guards and link sync on `membership_tiers` and `tier_terms` (`*_identity`, `*_link_guard`, `*_sync_linked`, `membership_tiers_parent`, `tier_terms_org`, `tier_terms_dues_range`); `attribute_definitions_subject`, `attribute_options_org`, `gateway_connections_check`. None on `auth` tables.
- **Enums (17):** `attribute_subject`, `attribute_type`, `attribute_visibility`, `gateway_status`, `membership_event_kind`, `membership_status`, `org_type`, `payment_gateway`, `payment_method`, `payment_purpose`, `payment_status`, `receipt_status`, `seat_scope`, `setting_mode`, `setup_status`, `tax_treatment`, `term_unit`.
- **Storage policies** on `storage.objects` for bucket `branding`: `branding managers insert` / `update` / `delete` (0001, `org.manage` on the `<org_id>/` folder) and `branding public read` (despite its name, 0042 narrowed it to signed-in people who can see the organization's tree, `can_see_org_tree`).

## 3. Storage buckets

| Bucket | Used in | Public? | How it's read | Created by |
|---|---|---|---|---|
| `branding` | `src/modules/branding/index.ts:28,35` (upload, signed URL), `src/modules/demo/index.ts:51,53` (list, remove when a demo org is deleted) | **Private** | `createSignedUrl` (no `getPublicUrl` anywhere); read policy from 0042 | On Lovable: by hand, outside the migrations. Now: `20261106000000_0046_storage_buckets.sql` (`insert … on conflict (id) do nothing`), and `[storage.buckets.branding]` in `supabase/config.toml` for the local stack. 2 MB, PNG/JPEG/SVG/WebP, as `validateLogo` checks |

## 4. Lovable dependencies (for Phase 1; not changed in Phase 0)

| What | Where |
|---|---|
| `@lovable.dev/cloud-auth-js` (Google sign-in broker; **removed in Phase 1**, D-212) | `package.json:31`; `src/integrations/lovable/index.ts:3-4,6,13-16`; used by `src/routes/auth.tsx:6,85-87` |
| `@lovable.dev/vite-tanstack-config` (build config) | `package.json:87`; `vite.config.ts:1,7`; `bunfig.toml:7` (also lists `@lovable.dev/mcp-js`, `ai-gateway`, `email-js`, `webhooks-js` as release-age exceptions; none are installed) |
| Lovable preview sign-in storage (iframe broker for `*.lovable.app` / `lovableproject.com`) | `src/integrations/supabase/previewAuthStorage.ts` (whole file); `src/integrations/supabase/client.ts:4` |
| Lovable editor error reporting | `src/lib/lovable-error-reporting.ts`; `src/routes/__root.tsx:14,44` |
| Lovable hosts trusted as the app's origin | `src/modules/payments/origin.ts:43` (`.lovable.app`, `.lovableproject.com`); tests in `src/modules/payments/origin.test.ts:9-14` |
| `LOVABLE_CRON_SECRET`, `LOVABLE_CRON_SECRET_PREVIOUS` | `src/integrations/supabase/cron-auth.ts:5-6` (no route uses it yet); `.env.example:15-17` |
| `LOVABLE_DB_MIGRATION_URL` | `drizzle.config.ts:8` (Lovable applies `drizzle/migrations` with it) |
| `EMAIL_TRANSPORT=lovable` (planned) | `.env.example:22-24` |
| `ai.gateway.lovable.dev` | not used |
| Lovable npm-cache URLs | none: there is no `package-lock.json`, and `bun.lock` resolves from the public registry |
| `.env` values pointing at the Lovable project | `.env:1-6`: `SUPABASE_PROJECT_ID`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and their `VITE_` copies (project `odqswxftrhtvyadizkgn`, publishable values only) |
| `supabase/config.toml` before Phase 0 | `project_id = "odqswxftrhtvyadizkgn"` (Lovable's), now `opencharterapp` |
| Lovable project files | `.lovable/project.json`, `.lovable/plan/`; the Lovable note at the top of `AGENTS.md` |
| Live checks against Lovable's backend | `.github/workflows/live.yml` (smoke and end-to-end tests, demo accounts); `smoke/client.ts` falls back to `.env` |

At the cutover the app's `.env` needs `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_SUPABASE_PROJECT_ID` (and the same names without `VITE_` for the server), set to the new project's values. The client reads `VITE_SUPABASE_PUBLISHABLE_KEY`, not `VITE_SUPABASE_KEY`.

## 5. Database tests and checks

| Check | Where it runs | Needs | Run it |
|---|---|---|---|
| Migration conventions (static) | `ci.yml`, pre-commit hook | nothing | `bun run check:migrations`: the legacy rules on `drizzle/migrations`, and on `supabase/migrations` file names `<14-digit timestamp>_<NNNN>_<name>.sql` with unique timestamps and numbers, Lovable's rules (by number), and RLS plus a policy on every table (`scripts/migration-rules.ts`) |
| Database rules on plain Postgres | `ci.yml` (`database`) | a throwaway Postgres; a stub of `auth`/`storage` | `TEST_DATABASE_URL=… bun run test:db` (`drizzle/migrations`, `db/tests/*.sql`) |
| Performance | `ci.yml` (`performance`) | a throwaway Postgres | `TEST_DATABASE_URL=… bun run test:perf` |
| **Replay** | `supabase-db.yml` (`replay`) | Docker; Supabase CLI 2.122.1 | `supabase start`, `supabase db reset --local`, `supabase db lint --local --level error --fail-on error`, `psql … -f supabase/ci/post-replay-check.sql` |
| Database rules on the real Supabase schemas | `supabase-db.yml` (`replay`) | the local stack | `bash supabase/ci/db-tests.sh` (refuses any non-local database). The same `db/tests/*.sql`, one file at a time; each makes its own users and orgs (`tests.fixture()`) inside a rolled-back transaction |
| Smoke test against the local stack | `supabase-db.yml` (`replay`) | the local stack; the demo accounts and orgs from `supabase/ci/fixtures.sql` (password generated per run) | `bash supabase/ci/smoke-local.sh` (vitest, Node environment, one file at a time; refuses a non-local URL or a `.env` in place) |
| Smoke and end-to-end tests against the live demo | `live.yml` | the Lovable demo accounts (`docs/demo-data.md`); `SMOKE_DEMO_PASSWORD`, `E2E_BASE_URL` optional | `bun run test:smoke`, `bun run test:e2e`. They share one live backend, so `live.yml` has the repository-wide `concurrency: live-demo` group (no cancelling): a push run and its pull request run never overlap on the demo orgs |

The demo accounts and orgs the smoke test expects (`smoke/client.ts`: three `@opencharter.test` accounts, Demo National with Austin and Dallas, IDs `d1000000-…`) aren't created by any migration. On Lovable they were made by hand. `supabase/scripts/demo-test-accounts.sql` builds them as `docs/demo-data.md` describes (accounts, platform operators, roles, national settings, Rank and other fields, the Regular level, six required seats, the test gateway). CI runs it through `supabase/ci/fixtures.sql`, and the owner runs it once on the new project (settings-to-reenter.md §9).

## 6. Replayed schema compared with `src/integrations/supabase/types.ts`

`types.ts` was generated from the live Lovable database. `supabase gen types typescript --local --schema public` on the replay was compared with it object by object, after normalising quote style and union spacing:

- **Tables:** the same 31, with the same columns and types. **Functions:** the same 127 RPC-visible ones, with the same arguments. **Enums:** the same 17, with the same values. **Views:** none in either.
- The only difference: the newer generator lists the computed fields `listed_in_directory` and `profile_membership_id` on `org_member_profiles` (functions that take the row, present in both). This is not a schema difference.
- So nothing in `public` was created by hand. The one hand-made object is the `branding` bucket (storage isn't in `types.ts`), now migration 0046. Auth settings, the Google provider, SMTP and secrets live outside the database: see settings-to-reenter.md.

## 7. Replay results and fixes

| Step | Result | Fix |
|---|---|---|
| `supabase start` / `db reset` (all 47 migrations, real Supabase `auth` and `storage`) | passes | none needed |
| `db lint --level error` | no errors | none |
| Post-replay RLS and grant check | 31 tables, all with RLS and grants; `auto_expose_new_tables = false` confirmed (a probe table gets no grants) | none |
| `db/tests/*.sql` on the stack | all 35 files pass | none |
| Smoke test on the stack | 89 tests pass, three runs in a row | fixtures added (`supabase/scripts/demo-test-accounts.sql`). A second run first failed 48 tests: the smoke cleanup removes what was created from 5 s before it starts, which caught fixtures loaded just before. `smoke-local.sh` now waits 6 s first |
| Missing objects | the `branding` bucket | new migration `0046_storage_buckets` |
| Timestamps | three pairs of journal entries share a second (0006/0007, 0022/0023, 0024/0025) | the later one moved +1 s (§1) |

On GitHub (pull request Nox-Mob/OpenCharterApp#9, commit `6eacf1f`), `replay` passed on both the push and the pull request run: start, reset, lint, the catalog check, 35 `db/tests` files and 89 smoke tests on the local stack, with no fix needed beyond the ones above. Every `ci.yml` job and the live smoke test passed too.

Not yet run: the `deploy` dry run and the real deploy against the new project. They need the owner's secrets and approval (settings-to-reenter.md §7–8).
