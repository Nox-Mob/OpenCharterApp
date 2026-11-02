# Hand-off to Lovable

Status on 2026-11-02.

**Done:** migrations `0000`–`0031` are applied, the types are regenerated, and the `GATEWAY_ENCRYPTION_KEY` secret is set. Thank you. A record is at the end.

**Waiting** (Sprints 2–3 of the MVP plan), on branch `BoardUpdates`, tested against Postgres 16 (`db/tests/9M_levels_standing_pricing.sql`, `9L_home_chapter.sql`, `9N_rollup_performance.sql`); each applies inside one transaction. Apply `0032`, then `0033`, then `0034`:

| File | What it adds | Check it worked (SQL editor) |
|---|---|---|
| `0032_levels_standing_pricing_setup.sql` | Columns `membership_tiers.suggested`, `source_tier_id`, `link_mode`, `price_rule`, `price_value` and `tier_terms.source_term_id`; functions `chapter_national_standing`, `linked_price`, `sync_linked_level`, `adopt_suggested_level`, `set_linked_level_price`, `make_level_own`; triggers that keep linked levels in step and guard links; a new version of `apply_setup` (same signature) with a `pricing_rules` section, and `apply_setup_sections()` listing it | `select 'pricing_rules' = any(public.apply_setup_sections());` returns `true` |
| `0033_home_chapter_delete_fix.sql` | New versions of `affiliation_history_append_only` and `membership_model_guard` (same signatures) that let cascades from deleting an organization through. Until it's applied, a demo national that used the home-chapter model can't be deleted; the end-to-end test left three such nationals ("E2E National …"), which its next run deletes | After applying: `select count(*) from public.organizations where name like 'E2E National %';` drops to 0 after the next `bun run test:e2e` |
| `0034_rollup_performance.sql` | New versions of `member_directory`, `org_rollup_members` and `org_overview_stats` (same signatures, same results) that resolve grace days and the directory default once per organization instead of once per member; about 7–15× faster with 5,000 members (`docs/security-review.md` §4) | `select count(*) from public.org_overview_stats('<a national id>');` as an admin still returns one row; the Overview and Reports pages show the same numbers as before |

## 1. When a migration is waiting
- Apply them strictly in order. They're additive only (D-125, checked in CI by `bun run check:migrations`).
- If one fails, stop and keep the error message. Don't edit the file to make it pass; we ship a fix as a new migration.
- Then regenerate the types (`src/integrations/supabase/types.ts`, never hand-edited), run `bun run test:smoke`, and tell us: we mark its readiness feature applied, remove its hand-written types from `src/lib/db/pending-schema.ts` and mark the roadmap row applied. Please don't edit those two files yourself.

## 2. Smoke-test addition (optional, 0026)
In `smoke/live.smoke.test.ts`, as the Austin admin: `set_seat_contact(austin, <president seat>, 'president@smoke-<run>.test')`; as the member, `org_board_contacts(austin)` shows that email for President with `email_source = 'role'`; set it back to `null` and the officer's own email returns. `purge_smoke_data` removes the row when the run's seats are removed; otherwise reset it to `null`.

## 3. Payments
Return links after paying now use the app's public address (D-158). Nothing is needed from Lovable. Optionally set the secret `PUBLIC_APP_URL` (e.g. `https://<your domain>`) to pin it. Stripe payments are now also confirmed from the return page when a webhook is late, so a misconfigured webhook no longer leaves members waiting (refunds still need it).

## 4. Checking by hand
`docs/user-testing.md` covers every screen; the newest are §8 (members across chapters, export payments in §10), §13b (national membership with a home chapter) and §14a (the member overview).

## 5. Don'ts
- Don't edit, reorder, rename or re-run applied migrations (`0000`–`0031`).
- Don't drop tables or columns, or add DELETE policies to history, payment, receipt, term-rule, appointment, pricing-rule or chapter-history (`affiliation_history`) tables.
- Don't change `membership.model` in `org_settings` by hand: a national's choice is permanent by design (D-166).
- Don't expose the `private` schema through the API.
- Don't force-push or rewrite `main`.
- Don't put `GATEWAY_ENCRYPTION_KEY` or any Stripe key in the repository.

## 6. Optional: real Stripe for a non-demo org
Each org connects its own Stripe account (direct mode, D-127). In the org's Payments page (Settings → Payments), the admin pastes a restricted or secret key and a webhook signing secret. In Stripe they add a webhook endpoint at `https://<app domain>/api/public/stripe/<org id>` (the Payments page shows the exact address), sending:
- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `charge.refunded`

Nothing more is needed from Lovable: the encryption secret is already set.

## Done (for the record)
| Migrations | Enabled | Applied |
|---|---|---|
| `0000`–`0007` | Orgs and hierarchy, roles and permissions, audit log, invitations, settings and locks, branding, member and chapter fields, setup engine, membership levels | 2026-10 |
| `0008`–`0016` | Memberships and standing, Stripe / test gateway, online joining and renewal, exports and saved views, directory and privacy, receipts, board seats and terms, smoke-run cleanup (D-150) | 2026-11-01 |
| `0017`–`0023` | Purge audit summary, Board setup, reports roll-ups, two-level dues, pricing rules, demo organizations | 2026-11-02 |
| `0024`–`0025` | Seats for an org and its chapters, overview numbers | 2026-11-02 |
| `0026`–`0028` | Board contact emails; Board setup can change "used by"; Rank required at Demo National | 2026-11-02 |
| `0029`–`0031` | Payments export (D-173); national membership with a home chapter (D-166, D-174) | 2026-11-02 |
