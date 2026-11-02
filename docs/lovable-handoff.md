# Hand-off to Lovable: apply migrations 0017–0022

Status on 2026-11-02.

**Done:**
- Migrations `0000`–`0016` are applied and smoke-tested (`bun run test:smoke`).
- The `GATEWAY_ENCRYPTION_KEY` secret is set.
- The types are regenerated.

Thank you. A record of what those migrations enabled is at the end.

**Waiting:** migrations `0017`–`0022`, prepared on branch `claude/lucid-volta-bn4tjb` and tested there against Postgres 16. Until they're applied:
- the screens that need them show "needs a database update" (readiness guard, D-135), or simply don't appear (Board setup card, demo option)
- everything else works as it does today

Nothing breaks if you wait. The steps below turn the new features on.

## 1. Bring the code into `main`
- Merge `claude/lucid-volta-bn4tjb` into `main` with a normal merge commit or a fast-forward. It's 9 commits ahead and nothing behind.
  - the user testing guide
  - a fix for saving board seats with "No role" / "No fixed term"
  - the work behind 0017–0022
- **Don't** squash, rebase or force-push. That rewrites history Lovable already synced.
- CI is green on the branch: lint, formatting, types, unit tests, the migration-rules check (D-125), database tests against Postgres 16, and the build.

## 2. Apply the migrations, strictly in order
Each depends on the ones before it. They're additive only (D-125, checked in CI by `bun run check:migrations`):
- no `DROP TABLE` / `DROP COLUMN`
- tenant tables have `org_id uuid not null references public.organizations(id)`
- full grants to `authenticated`
- RLS policies using `has_permission` / `is_org_member`

| # | File | What it adds | Check it worked (SQL editor) |
|---|---|---|---|
| 1 | `0017_purge_audit_summary.sql` | `purge_smoke_data` (0016) also writes one summary audit event with what it removed; restores the `seat_templates` comment that 0015 replaced | After a smoke run: `select after from public.audit_events where action = 'purge' order by id desc limit 1;` shows the counts |
| 2 | `0018_setup_governance.sql` | Board setup: `apply_setup` learns the `seats` and `seat_terms` sections; `apply_setup_sections()` for the app's readiness check | `select public.apply_setup_sections();` includes `seats` and `seat_terms` |
| 3 | `0019_rollups.sql` | Reports for nationals and regions (aggregates only): `org_rollup_members`, `org_rollup_revenue`, `org_rollup_governance`, and audited report exports `log_report_export` | `select count(*) from pg_proc where proname like 'org_rollup_%';` returns 3 |
| 4 | `0020_two_level_dues.sql` | Two-level dues: `join_requirements`, the national-dues check in `begin_join` / `payment_succeeded` / `approve_membership`, the chapter price-range trigger, "no chapter dues" in `tier_parent_check` and `public_join_info` | `select public.public_join_info('demo-austin') -> 'national_dues';` returns `{"required": false, …}` (until the national turns it on) |
| 5 | `0021_pricing_rules.sql` | Pricing by member fields: the `pricing_rules` table, `term_price`, `quote_price`, `save_pricing_rule`, `set_pricing_rule_active`; `begin_join` / `begin_renewal` charge the member's price; `public_join_info` marks terms that have rules | `select count(*) from public.pricing_rules;` returns 0, not an error |
| 6 | `0022_demo_orgs.sql` | Demo organizations: `private.platform_operators` (seeded with the three demo accounts), `organizations.is_demo` (backfilled for the `d1000000-` orgs), `create_demo_organization`, `delete_demo_organization`, `emails_allowed`; `test_gateway_allowed` now follows the flag | `select slug from public.organizations where is_demo order by slug;` lists `demo-austin`, `demo-dallas`, `demo-national` |

If one fails, stop: don't apply the later ones, and keep the error message. Don't edit the file to make it pass. Tell us, and we'll ship the fix as a new migration (`0023_…`).

Notes for the importer:
- `0022` adds a second table to the `private` schema, `platform_operators`, readable only by `service_role`. Like `gateway_secrets`, it must stay out of the exposed API schemas: anyone who could write to it could make themselves a platform operator.
- `0022` finds the operators by the demo accounts' emails (`demo-national@`, `demo-chapter@`, `demo-member@opencharter.test`), so those accounts must exist. They do. More operators are added by the database owner (SQL in `docs/demo-data.md`).
- `0020` and `0021` redefine existing functions with `create or replace` and the **same signatures**:
  - `public_join_info`, `begin_join`, `payment_succeeded`, `approve_membership`, `tier_parent_check` (0020)
  - `public_join_info`, `begin_join`, `begin_renewal` (0021)

  The changes are marked in comments.
- Every new write path is a `security definer` function. The new tables have no client insert / update / delete policies on purpose.
- **Don't** re-run or edit `0000`–`0016`.

## 3. Secrets
Nothing new. `GATEWAY_ENCRYPTION_KEY` is in place. Don't rotate it casually: Stripe keys sealed with the old key can't be read, so every org would have to reconnect Stripe.

## 4. After applying
1. **Regenerate the types** (`src/integrations/supabase/types.ts`) as usual. Don't hand-edit it.
2. **Run `bun run test:smoke`**, with the additions in step 5 if you've added them.
3. **Tell us.** We then:
   - mark the readiness features `board_setup`, `reports`, `two_level_dues`, `pricing_rules` and `demo_orgs` as applied
   - remove their hand-written types
   - mark the roadmap rows applied

   Please don't edit `src/lib/db/pending-schema.ts` or `src/lib/db/readiness.ts` yourself. The screens already turn on by themselves once the database has the migrations.

## 5. Smoke-test additions for 0018–0022
Please add these to `smoke/live.smoke.test.ts`. They clean up through `purge_smoke_data` like the rest, except the demo org, which the test deletes itself.
- **Board setup (0018):** as the national admin, `apply_setup(national, 'board', …)` with one chapter seat and a term for the national's own seat. Applying it twice leaves one seat and one term rule.
- **Reports (0019):** `org_rollup_members(national)` lists the national and both chapters, with totals matching the members recorded in the run. The chapter admin is refused for the national.
- **Two-level dues (0020):** for the run, set `membership.national_dues_required = true` (locked) at the national. Then, as the member:
  - `begin_join(austin, …)` is refused with "national membership required"
  - join the national with the test gateway
  - the Austin join then waits for approval until the national membership is approved

  Reset the setting afterwards.
- **Pricing rules (0021):** as the national admin, add a rule on the run's term (no conditions, 20% off). The member's `quote_price` is 80% of the price, and `begin_join` / `begin_renewal` create a payment for that amount. Retire the rule afterwards.
- **Demo orgs (0022):**
  - As `demo-national@…`, `is_platform_operator()` is true, and `create_demo_organization('Smoke Demo <run>', 'smoke-demo-<run>', 'standalone')` returns an org with `is_demo = true`.
  - `delete_demo_organization` with a wrong name is refused; with the right name it deletes the org.
  - Demo Austin can't be deleted on its own, because it's a chapter.

## 6. Checking by hand
`docs/user-testing.md` has step-by-step checks for each new screen:
- **2b** Demo organizations (0022)
- **2** the chapter creation wizard (no migration needed)
- **6b** Setup hub and Board setup (0018)
- **12b** Two-level dues (0020)
- **12c** Pricing rules (0021)
- **14b** Reports (0019)

## 7. Don'ts
- Don't edit, reorder, rename or re-run applied migrations (`0000`–`0016`).
- Don't apply `0018`–`0022` out of order or skip one.
- Don't drop tables or columns, or add DELETE policies to history, payment, receipt, term-rule, appointment or pricing-rule tables.
- Don't expose the `private` schema through the API.
- Don't force-push or rewrite `main`.
- Don't put `GATEWAY_ENCRYPTION_KEY` or any Stripe key in the repository.

## 8. Optional: real Stripe for a non-demo org
Each org connects its own Stripe account (direct mode, D-127). In the org's Payments tab, the admin pastes a restricted or secret key and a webhook signing secret. In Stripe they add a webhook endpoint at `https://<app domain>/api/public/stripe/<org id>` (the Payments tab shows the exact address), sending:
- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `charge.refunded`

Nothing more is needed from Lovable: the encryption secret is already set.

## Done (for the record)
| Migration | Enabled | Applied |
|---|---|---|
| `0008_memberships` | Memberships, standing, admin-recorded payments, member records without a login | 2026-11-01 |
| `0009_payments_gateway` | Per-org Stripe / test gateway connections, sealed credentials in `private`, webhook event log (plus the `GATEWAY_ENCRYPTION_KEY` secret) | 2026-11-01 |
| `0010_joining` | Public join page, checkout, payment completion and refunds, online renewal, decline with refund | 2026-11-01 |
| `0011_member_exports` | Audited CSV exports, saved views | 2026-11-01 |
| `0012_member_privacy` | Member directory, each member's listing choice, the export privacy rule | 2026-11-01 |
| `0013_receipts` | Automatic, numbered, immutable receipts; void / reissue | 2026-11-01 |
| `0014_board_seats` | Board seats, each org's own seat terms with by-law history, appointments | 2026-11-01 |
| `0015_confirm_0008_0014_applied` | Lovable's marker migration (a table comment) | 2026-11-01 |
| `0016_purge_smoke_data` | Smoke-run cleanup in the demo orgs (D-150) | 2026-11-01 |
