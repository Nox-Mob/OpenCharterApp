# OpenAppHub suite migration — notes (OpenCharterApp)

Status on 2026-11-08 (owner answers in §8). This is suite step 1 (inventory) and step 2 (secret scan) from `AGENTS.md`, plus the plan for the remaining steps. **No code, migration or database change** is part of this step. Contract: [`SHARED-SPEC.md`](SHARED-SPEC.md). Decision: D-217.

Goal: the current OpenCharterApp Supabase project (`nxungwtxnctcqolfshcr`) becomes the **production database for the whole suite** (OpenAppHub, OpenCharterApp, OpenBoardApp, OpenLedgerApp). The hub owns sign-up, organizations, members and payments (`public`, `billing`, `ops`). Charter moves to its own schema `charter`. Self-hosted, Charter still runs on its own.

Sources: `supabase/migrations/` (47 files, `0000`–`0046`; the database is built only from these, D-211/D-212) and `src/integrations/supabase/types.ts`. [`migration/phase-0-inventory.md`](migration/phase-0-inventory.md) §6 compared a full replay with `types.ts` object by object and found **nothing created by hand** in `public` except the `branding` bucket (now migration 0046). So no schema dump is needed for this inventory. The owner should still take one before step 4 as a backup (§9).

---

## 1. Database objects in the current project

### 1.1 Schemas

| Schema | Created by | Contents | Exposed to Data API |
|---|---|---|---|
| `public` | Supabase, used by every Charter migration | 31 tables, 147 functions, 17 enums | yes |
| `private` | `0009` (`create schema if not exists private`) | 3 tables (gateway secrets, platform flags, platform operators) | no |
| `auth`, `storage`, `extensions`, `supabase_migrations` | Supabase | not Charter's; only `storage.objects` policies and a `storage.buckets` row are Charter's | — |

No extensions are created. `pgcrypto` (`extensions.digest`, `gen_random_bytes`) is used.

### 1.2 Tables (34)

Every `public` table has `org_id` (except the global catalogue tables noted), RLS, explicit grants and at least one policy (checked by `bun run check:migrations` and `supabase/ci/post-replay-check.sql`). Links and write paths: [`tables.md`](tables.md).

| Table | Org-scoped | Maps to core? | Area |
|---|---|---|---|
| `public.organizations` | is the org | **Core** `public.organizations` (id, name, slug, created_by, created_at). Charter-only columns: `parent_id`, `type` (`org_type`), `ancestor_ids`, `timezone`, `status`, `updated_at` | orgs |
| `public.org_member_profiles` | yes | **Partly core.** Rows with `user_id` are people who sign in, the core `memberships` row of that user. Rows without `user_id` are roster records (no login). Also holds `display_name`, `email`, `directory_listed`, `home_of`, `left_at`, so it stays Charter's (`charter.member_profiles`) | members |
| `public.roles`, `public.role_permissions`, `public.permissions`, `public.role_assignments` | `roles`/`role_assignments` yes; `permissions` global; `roles.org_id null` = built-in | **Partly core.** `org_admin` maps to core `owner`/`admin`. The fine-grained, per-org custom roles and downward inheritance (D-032) are Charter-specific | roles |
| `public.invitations` | yes | **Core, run by the hub** in hosted mode (§1.1 of the spec: invites happen in the hub). Charter keeps its own flow for self-hosted | access |
| `public.memberships` | yes | **No — name clash only.** Charter's `memberships` are *dues memberships* (level, term, paid through), not core org memberships. Becomes `charter.memberships` | dues |
| `public.membership_tiers`, `tier_terms`, `membership_events`, `pricing_rules` | yes | Charter | dues |
| `public.payments`, `gateway_connections`, `webhook_events`, `receipts`, `receipt_counters`, `tax_profiles` | yes (`webhook_events` by gateway) | Charter. **Not suite billing:** these are the org's own Stripe account collecting member dues. The hub's billing (§5) is the org paying for the app | money |
| `public.seat_templates`, `seat_terms`, `seat_title_overrides`, `seat_contacts`, `appointments` | yes | Charter (board seats and officers) | governance |
| `public.attribute_definitions`, `attribute_options`, `attribute_values`, `member_segments` | yes | Charter | member fields |
| `public.org_settings`, `setup_states` | yes | Charter (settings engine, setup flows) | settings |
| `public.affiliation_history`, `audit_events` | yes | Charter (append-only) | history |
| `private.gateway_secrets` | yes | Charter (encrypted Stripe keys per org) | money |
| `private.platform_flags`, `private.platform_operators` | no | **Moves to the hub** (Q6). Platform operators can create demo orgs (`is_platform_operator`) | platform |

### 1.3 Views

None.

### 1.4 Enums (17, all in `public`)

`attribute_subject`, `attribute_type`, `attribute_visibility`, `gateway_status`, `membership_event_kind`, `membership_status`, `org_type` (`platform`, `national`, `region`, `chapter`, `standalone`), `payment_gateway`, `payment_method`, `payment_purpose`, `payment_status`, `receipt_status`, `seat_scope`, `setting_mode`, `setup_status`, `tax_treatment`, `term_unit`.

None clash with core's `public.org_role`.

### 1.5 Functions (147 in `public`, none in `private`; 134 `security definer`)

**Clash with core names** (core defines them in `db/core/0002`, so Charter's must leave `public` first):
`create_organization` (Charter: `(_name, _slug, _type, _parent)`, enforces the hierarchy and seeds `org_admin`; core: `(p_name)`).

Same idea as a core helper but a different name and signature: `is_org_member(_user, _org)` ≈ core `is_member(p_org)`; `has_permission(_user, _perm, _org)` ≈ core `has_role` (but permission-based and inherited downwards).

**Permission and visibility helpers:** `has_permission`, `is_org_member`, `can_see_org_tree`, `can_read_attribute_value`, `holds_all_role_permissions`, `is_platform_operator`, `privacy_admin_override_allowed`, `emails_allowed`, `test_gateway_allowed`, `role_applies_at`, `seat_applies_at`, `resolve_role`.

**Trigger functions (21):** `affiliation_history_append_only`, `appointments_guard`, `attribute_definition_subject_check`, `attribute_option_org_check`, `audit_row_change`, `chapter_dues_range_check`, `enforce_setting_lock`, `gateway_connection_check`, `level_link_guard`, `membership_events_append_only`, `membership_model_guard`, `org_demo_guard`, `payments_receipts`, `receipts_guard`, `seat_terms_append_only`, `set_org_ancestors`, `sync_linked_levels_trigger`, `tier_identity_guard`, `tier_parent_check`, `tier_term_org_check`, plus `write_audit` (called by them).

**RPCs the app calls (75):** `accept_invitation`, `admin_create_member`, `adopt_suggested_level`, `apply_setup`, `appoint_officer`, `assign_role`, `audit_log`, `begin_join`, `begin_renewal`, `board_history`, `chapter_national_standing`, `complete_gateway_payment`, `complete_test_payment`, `connect_test_gateway`, `create_demo_organization`, `create_invitation`, `create_organization`, `create_role`, `decline_application`, `define_seat`, `delete_demo_organization`, `disconnect_gateway`, `end_appointment`, `export_payments`, `fail_gateway_payment`, `gateway_sealed_credentials`, `get_invitation`, `grace_days`, `import_members`, `is_platform_operator`, `join_requirements`, `lineage_settings`, `log_member_export`, `log_report_export`, `make_level_own`, `mark_payment_refunded`, `member_directory`, `membership_model`, `org_board`, `org_board_contacts`, `org_lineage`, `org_overview_stats`, `org_rollup_governance`, `org_rollup_members`, `org_rollup_revenue`, `public_home_chapter_info`, `public_join_info`, `quote_price`, `recalculate_planned_ends`, `record_membership`, `reissue_receipt`, `remove_member_record`, `remove_role`, `restore_member_record`, `revoke_invitation`, `save_pricing_rule`, `save_stripe_connection`, `set_attribute_value`, `set_checkout_ref`, `set_home_chapter`, `set_linked_level_price`, `set_member_home_chapter`, `set_my_directory_listing`, `set_pricing_rule_active`, `set_role_active`, `set_seat_active`, `set_seat_contact`, `set_seat_scope`, `set_seat_term`, `set_seat_title`, `sync_my_email`, `update_member_record`, `update_role`, `update_seat`, `void_receipt`.

**Internal helpers (the rest):** `ancestor_setting`, `apply_setup_sections`, `approve_membership`, `cancel_membership`, `check_role_permissions`, `claim_webhook_event`, `decline_membership`, `effective_approval_required`, `effective_setting`, `grant_membership_term`, `issue_receipt`, `issue_receipt_internal`, `linked_price`, `listed_in_directory`, `membership_standing`, `move_home_chapter`, `national_dues_required`, `national_membership_state`, `national_org`, `org_subtree`, `payment_failed`, `payment_refunded`, `payment_succeeded`, `pricing_condition_matches`, `profile_membership_id`, `profile_values`, `purge_smoke_data`, `receipt_logo`, `receipt_snapshot`, `receipt_tax_wording`, `renewal_start`, `seat_planned_end`, `seat_template_check`, `seat_term_in_force`, `sync_linked_level`, `term_end`, `term_price`, `validate_attribute_value`, `validate_join_answers`, `validate_pricing_conditions`.

**Granted to `anon`** (needs owner approval under spec §3.4): `public_join_info(text)` and `public_home_chapter_info(text)`, behind the public join page `/join/$orgSlug`.

### 1.6 Triggers (47, all on Charter tables)

- `audit_<table>` → `audit_row_change` on 25 tables: `affiliation_history`, `appointments`, `attribute_definitions`, `attribute_options`, `attribute_values`, `gateway_connections`, `invitations`, `member_segments`, `membership_tiers`, `memberships`, `org_member_profiles` (`audit_profiles`), `org_settings`, `organizations`, `payments`, `pricing_rules`, `receipts`, `role_assignments`, `roles`, `seat_contacts`, `seat_templates`, `seat_terms`, `seat_title_overrides`, `setup_states`, `tax_profiles`, `tier_terms`.
- Guards: `affiliation_history_append_only`, `membership_events_append_only`, `seat_terms_append_only`, `appointments_guard`, `receipts_guard`, `organizations_demo_guard`, `gateway_connections_check`, `attribute_definitions_subject`, `attribute_options_org`.
- Settings: `org_settings_lock` (`enforce_setting_lock`), `membership_model_guard`.
- Hierarchy: `organizations_ancestors` (`set_org_ancestors`).
- Levels: `membership_tiers_identity`, `_link_guard`, `_parent`, `_sync_linked`; `tier_terms_identity`, `_link_guard`, `_org`, `_dues_range`, `_sync_linked`.
- Money: `payments_receipts`.

### 1.7 Triggers on `auth.users`

**None.** No migration creates a trigger on any `auth` table (`grep` of every migration; also phase-0-inventory §2). Charter has no `handle_new_user`; it reads `auth.users.email` inside definer functions and `sync_my_email`. So core's `on_auth_user_created` won't replace anything of Charter's. Step 4 still guards a `drop trigger if exists` in case one was made by hand.

### 1.8 Storage

| Bucket | Public? | Path | Policies on `storage.objects` |
|---|---|---|---|
| `branding` (2 MB; PNG/JPEG/SVG/WebP) | private, signed URLs | `<org_id>/…` (already the spec's layout) | `branding public read` (narrowed by 0042 to `can_see_org_tree`), `branding managers insert` / `update` / `delete` (`has_permission(…, 'org.manage', …)`) |

The policies call `public.can_see_org_tree` and `public.has_permission`. Postgres stores the function OID, so after step 4 they keep pointing at the parked copies in `charter_legacy`. Step 6 replaces them with policies using `public.is_member` / `public.can_write`.

### 1.9 Edge Functions

**None** (no `supabase/functions/`). Server-side code runs as TanStack Start server functions on the Cloudflare Worker:

- `src/modules/payments/payments.server.ts` and `payments.functions.ts`: the Stripe dues checkout, using `supabaseAdmin` (service role, `src/integrations/supabase/client.server.ts`).
- `src/routes/api/public/stripe.$orgId.ts`: the per-org Stripe webhook for dues.
- `src/integrations/supabase/cron-auth.ts`: cron secret check (no route uses it yet).

---

## 2. Concept map: core vs Charter

| Concept | Today (Charter) | Suite (core) | Plan |
|---|---|---|---|
| Organization | `public.organizations`, a **tree**: platform → national → region → chapter, or standalone | flat `public.organizations`, one row per paying customer | **Decided (Q2):** the top of the tree is the core org; chapters and regions become `charter.units` under it |
| Who can use an org | `org_member_profiles` row with a `user_id`, `left_at is null` (`is_org_member`) | `public.memberships` (owner/admin/member/viewer) | `charter.member_profiles.user_id` must have a core membership to read; RLS read rule becomes `public.is_member(org_id)` |
| Roles and permissions | custom roles per org, permission keys (`org.manage`, `members.manage`, …), inherited downwards (D-032) | 4 fixed roles | Keep Charter's permissions *inside* the core gate: a write needs `public.can_write(org_id,'charter')` **and** the Charter permission. Core `owner`/`admin` ⇒ Charter `org_admin` |
| Profile | `org_member_profiles.display_name` / `email` per org | `public.profiles` (display name, avatar), one per user | Read the person's name from `public.profiles` for signed-in users; roster-only records keep their own fields |
| Invitations | `create_invitation` / `accept_invitation` RPCs, token hashes | hub (hosted) | Hosted: hidden, link to the hub. Self-hosted: kept, but they create a core membership too |
| Creating an org | `create_organization(_name,_slug,_type,_parent)` | `public.create_organization(p_name)` | Charter keeps a `charter.create_org_unit(…)` for its tree (Q2) |
| App billing | none | `billing.*`, `get_org_billing`, `can_write` | new: banner and read-only mode (step 12) |
| Member dues | `payments`, `gateway_connections`, Stripe per org | — | stays Charter's, `charter` schema |
| Platform operators | `private.platform_operators` | not in the spec | **moves to the hub** (Q6); not recreated in `charter` |
| Audit log | `audit_events` via triggers | — | stays Charter's |

## 3. Every place the code calls Supabase

64 files outside tests. Clients: `src/integrations/supabase/client.ts` (browser and SSR, `createClient`, Lovable preview storage), `client.server.ts` (service role, server only), `auth-attacher.ts` / `auth-middleware.ts` (bearer token from the browser to server functions, `getClaims`). In step 9 all of them move to the shared client; every `.from()` below gets the `charter` schema by default (`VITE_APP_SCHEMA=charter`), and core tables need `.schema('public')`.

| File | Tables (`.from`) | RPCs (`.rpc`) | Auth / storage |
|---|---|---|---|
| `src/components/app-shell.tsx` | | | `signOut` |
| `src/components/attributes/attributes-tab.tsx` | attribute_definitions, attribute_options | | |
| `src/components/create-org-dialog.tsx` | | create_organization | |
| `src/components/membership/join-form.tsx` | | | `getSession` |
| `src/components/membership/membership-rules-card.tsx` | | lineage_settings | |
| `src/components/org/member-details-dialog.tsx` | | create_invitation | |
| `src/components/org/members-tab.tsx` | invitations, role_assignments | assign_role, create_invitation, remove_role, revoke_invitation | `getUser` |
| `src/components/org/roles-tab.tsx` | | create_role, set_role_active, update_role | |
| `src/components/org/settings-tab.tsx` | org_settings, organizations, tax_profiles | lineage_settings, org_lineage | |
| `src/lib/orgs.ts` | **organizations, role_assignments** (the org list; becomes core memberships + `shared/supabase/org.ts`) | | `getUser` |
| `src/modules/account/index.ts` | org_member_profiles | sync_my_email | `updateUser` |
| `src/modules/account/landing.ts` | | | `updateUser` |
| `src/modules/attributes/queries.ts` | attribute_definitions, attribute_values | | |
| `src/modules/attributes/values.ts` | | set_attribute_value | |
| `src/modules/audit/queries.ts` | audit_events | audit_log | |
| `src/modules/branding/index.ts` | organizations | | storage `branding` (upload, signed URL) |
| `src/modules/chapters/creation.ts` | seat_templates | create_invitation | |
| `src/modules/demo/index.ts` | | create_demo_organization, delete_demo_organization, is_platform_operator | storage `branding` (list, remove) |
| `src/modules/governance/seats.ts` | seat_contacts, seat_templates, seat_terms | appoint_officer, board_history, define_seat, end_appointment, lineage_settings, org_board, org_board_contacts, recalculate_planned_ends, set_seat_active, set_seat_contact, set_seat_scope, set_seat_term, set_seat_title, update_seat | |
| `src/modules/members/import.ts` | | import_members | |
| `src/modules/members/my-overview.ts` | org_member_profiles, role_assignments | lineage_settings | `getUser` |
| `src/modules/members/privacy.ts` | org_member_profiles | lineage_settings, member_directory, set_my_directory_listing | `getUser` |
| `src/modules/members/roster-removal.ts` | org_member_profiles | remove_member_record, restore_member_record | |
| `src/modules/members/roster.ts` | member_segments | log_member_export | |
| `src/modules/membership/home-chapter.ts` | memberships, org_settings | membership_model, public_home_chapter_info, set_home_chapter, set_member_home_chapter | `getUser` |
| `src/modules/membership/joining.ts` | payments | begin_join, begin_renewal, complete_test_payment, join_requirements, public_join_info | |
| `src/modules/membership/memberships.ts` | membership_events, org_member_profiles | admin_create_member, grace_days, record_membership, update_member_record | `getUser` |
| `src/modules/membership/national-standing.ts` | | chapter_national_standing | |
| `src/modules/membership/pricing.ts` | pricing_rules | quote_price, save_pricing_rule, set_pricing_rule_active | |
| `src/modules/membership/queries.ts` | membership_tiers, tier_terms | lineage_settings | |
| `src/modules/membership/suggested-levels.ts` | membership_tiers | adopt_suggested_level, make_level_own, set_linked_level_price | |
| `src/modules/payments/export.ts` | | export_payments | |
| `src/modules/payments/payments.functions.ts` | payments | decline_application, save_stripe_connection, set_checkout_ref | |
| `src/modules/payments/payments.server.ts` (service role) | gateway_connections | complete_gateway_payment, fail_gateway_payment, gateway_sealed_credentials, mark_payment_refunded | |
| `src/modules/payments/queries.ts` | gateway_connections, payments | connect_test_gateway, disconnect_gateway | |
| `src/modules/receipts/index.ts` | org_member_profiles, receipts | reissue_receipt, void_receipt | `getUser` |
| `src/modules/reports/overview.ts` | | org_overview_stats | |
| `src/modules/reports/rollups.ts` | | log_report_export, org_rollup_governance, org_rollup_members, org_rollup_revenue | |
| `src/modules/roles/queries.ts` | roles | | |
| `src/modules/setup/drafts.ts` | setup_states | apply_setup | `getUser` |
| `src/routes/__root.tsx` | | | `onAuthStateChange` |
| `src/routes/_authenticated/account.tsx` | org_member_profiles | | `getUser` |
| `src/routes/_authenticated/route.tsx` | | | `getUser` (the sign-in gate; hosted: redirect to the hub) |
| `src/routes/auth.tsx` | | | `signInWithPassword`, `signUp`, `signInWithOAuth` (Google), `resetPasswordForEmail`, `getUser` |
| `src/routes/invite.$token.tsx` | | accept_invitation, get_invitation | `getUser` |
| `src/routes/reset-password.tsx` | | | `updateUser` |
| `src/lib/db/readiness.ts`, `src/lib/db/pending-schema.ts` | (types and readiness probes) | | |

Outside the app: `smoke/client.ts` (`signInWithPassword`, live checks), `e2e/*.spec.ts` (organizations, org_settings, org_member_profiles, membership_tiers, tier_terms, branding; public_join_info, make_level_own, restore_member_record), `scripts/seed-sales-demo.ts`, `supabase/scripts/*.sql`, `supabase/ci/*`, `db/tests/*.sql` and `db/perf/*.sql`. All of them use `public.*` names and move with step 6–9.

---

## 4. Secret scan (step 2, spec §7)

Scanned the working tree and **all 186 commits on every branch** (`git grep` over `git rev-list --all`) for `sb_secret_`, `sk_live_`, `sk_test_`, `rk_live_`/`rk_test_`, `whsec_`, JWTs (`eyJ…` legacy anon/service-role keys), Postgres URLs with a password, private keys, AWS/GitHub/Slack/Google keys, and `SERVICE_ROLE_KEY` / `DB_PASSWORD` / `GATEWAY_ENCRYPTION_KEY` / `CRON_SECRET` / `SMOKE_DEMO_PASSWORD` with a value. History was not rewritten.

| Finding | Where | Risk | Owner action |
|---|---|---|---|
| No service-role key, `sb_secret_`, live or real test Stripe key, webhook secret or DB password, now or in history | — | — | none |
| Fake Stripe keys in unit tests (`rk_test_1234567890abc…`, `sk_test_1234567890abc`, `whsec_1234567890abcdef`) | `src/modules/payments/stripe.test.ts`, `src/components/payments/payments-tab.test.tsx` | none (made-up placeholders) | none; GitHub push protection may flag them, mark as false positive |
| Publishable key and URL of the production project | `.env` (committed), `wrangler.jsonc` `vars` | none: publishable values are public by design | none. Hygiene step 3 still stops committing `.env` (spec §7: `.env*` other than `.env.example` must be ignored) |
| Older `.env` versions in history | commits `7253751`, `629b413` | only publishable values (Lovable project `odqswxftrhtvyadizkgn`) | none |
| **Shared demo password in plain text** (removed from the docs and the smoke-test fallback in this PR; still in history) | `docs/demo-data.md:7` (and history) | **Medium.** The demo accounts (`@opencharter.test`) live on the project that becomes the suite's production database. With one login for the suite, anyone who reads the public repo can sign in to the hub and every app as a demo admin or platform operator | **Owner decided (Q8): delete the demo accounts** on production (§8.2) |

Also recommended (owner settings): enable GitHub secret scanning and push protection on all five repos.

---

## 5. Where this repo differs from what the spec assumes

These need an owner decision or a spec change. **Don't build around them silently** (spec §2.2).

1. **Not a Vite SPA on Cloudflare Pages.** Charter is **TanStack Start with SSR**, deployed as a **Cloudflare Worker** (`wrangler.jsonc`, nitro `cloudflare-module`), with server functions that use the service-role key. So `public/_redirects` (§10) doesn't apply; security headers must be set by the Worker (or `_headers` served as an asset, if the Worker serves static assets). Sessions for the server functions go through `auth-attacher`/`auth-middleware` (a bearer token), which works with the cookie-based `createBrowserClient` as long as `getSession` keeps returning the token.
2. **Org tree vs flat orgs** (resolved by Q2, §8): Charter's orgs are a hierarchy. The suite's billing assumes each `public.organizations` row is a paying customer with its own trial. If every chapter became a core org, each new chapter would get its own trial (or start `expired` under "one trial per user") and its own subscription.
3. **Members who sign in** (resolved by Q3 and Q4, §8): Charter's member portal (directory, join, renew, pay dues) means ordinary dues-paying members sign in. If each one needs a core `memberships` row, the plan limits (10 members on Starter/Trial, 25 on Suite) would count association members, not staff. Hosted mode also removes Charter's sign-up page, but the public **join** flow signs people up.
4. **Anon access** (§3.4): `public_join_info` and `public_home_chapter_info` are callable by `anon` for the public join page. Per Q4 the join page is self-hosted only, so in the suite schema they are granted to `anon` only on self-hosted databases (or not at all, if the hosted build never calls them).
5. **Charter's own Stripe** (dues) is separate from suite billing. The spec says "sub-apps never call Stripe"; it means suite billing, but please confirm dues collection stays in Charter.
6. **Read-only when the plan lapses vs member payments**: a lapsed org becomes read-only, but webhooks still have to record dues payments members already made (the service-role path bypasses RLS, so it works; confirm that's wanted).
7. **The repo's own rules** (`AGENTS.md`): migrations live in `supabase/migrations` and deploy with `supabase db push` ("Supabase database" workflow); `check:migrations` enforces Lovable's rules; the database tests run on plain Postgres with a stub. The suite moves to `db/migrations` + `scripts/migrate.mjs` + `ops.schema_migrations`. Step 5 must switch the checks and workflows together, and disable the `deploy` job in `supabase-db.yml` so the two runners never both write to production.
8. **Phase 1 cutover (D-212) isn't finished**: owner steps are still open (`roadmap.md`). The suite work can run in parallel. The hosted Charter app on `opencharterapp.org` stops working from step 4 until step 9 ships (all its tables move out of `public`); the owner accepts the downtime (Q7).
9. **`profiles` vs `org_member_profiles`**: no name clash, but two sources for a person's name.
10. **AGENTS.md D-215** (no session links or "Generated with Claude Code" lines) differs from the default agent footer; the owner's rule is followed here.

## 6. Dependencies outside this repo

- **`Nox-Mob/OpenAppHub` doesn't exist yet.** It holds the canonical `shared/`, `db/core/` and `scripts/migrate.mjs`. Steps 5, 6 and 8–15 here need them. Suggested order (START-HERE): Hub Phase 1–2 first.
- `Nox-Mob/OpenAppHub-docs` exists (Phase 5 docs PRs).
- `Nox-Mob/openboardapp` and `Nox-Mob/OpenLedgerApp` follow Charter; Board's old project becomes staging only after Board is migrated.

## 7. Conflicts between the repo's `AGENTS.md` rules and the spec

The spec wins once the owner confirms (spec header). Until a step replaces a rule, the old rule stands.

| Repo rule | Suite rule | Replaced in |
|---|---|---|
| Migrations in `supabase/migrations`, deployed by the "Supabase database" workflow | `db/migrations` + vendored runner, `migrate.yml` | step 5–6 |
| Tenant tables in `public`, RLS with `has_permission` / `is_org_member` | tables in `charter`, RLS with `public.is_member` / `public.can_write`; Charter permissions on top | step 6 |
| Orgs only via Charter's `create_organization` | core `public.create_organization` (hub in hosted mode) | step 6 / Q2 |
| Invitations via Charter's RPCs | hub in hosted mode | step 11 |
| No `DROP TABLE`/`DROP COLUMN` in migrations (`check:migrations`) | same idea: park first, drop `charter_legacy` only when the owner asks | unchanged |
| Pending-schema shims for Lovable (D-135) | types generated by `gen-types.yml` | step 9 |
| Lovable note at the top of `AGENTS.md` | remove Lovable leftovers | step 3 |

## 8. Owner decisions (2026-11-08, D-218)

| # | Question | Answer |
|---|---|---|
| Q1 | Spec §0 inputs | **Open.** Prices aren't decided: the owner is weighing one price for a single org against a price for an org with many sub-orgs. Domain, design reference and outlier apps, and staging ref still to come. Production ref: the current Charter project, `nxungwtxnctcqolfshcr` |
| Q2 | What is a core organization? | **The top of the tree** (a national, or a standalone org) is the one `public.organizations` row: the billed organization and billing customer, and the shared org ID for Board and Ledger. Its regions and chapters are **included under its licence** and live in Charter as `charter.units` (parent, type, ancestors, timezone). Every Charter table gets `org_id → public.organizations` (the customer), plus `unit_id → charter.units` where today's `org_id` points at a chapter or region. Core RLS (`is_member`, `can_write`) guards the customer; Charter's permissions guard units inside it. No change to core or billing |
| Q3 | Who counts as a billed member? | **Only admins, officers and staff.** They get a core `public.memberships` row and count toward the plan's member limit (the hub's `max_members` trigger, unchanged). Ordinary dues-paying members get Charter-only access (`charter.member_profiles.user_id`, checked by a Charter function such as `charter.is_portal_member`), so they can see the directory and pay dues without counting. Charter's read policies become `public.is_member(org_id) or charter.is_portal_member(org_id, unit_id)` where members may read |
| Q4 | Join page and sign-up in hosted mode | **Charter's join page (`/join/$orgSlug`) is for self-hosting only**; it is left out of routing in hosted mode. Joining members **sign up with OpenAppHub.** The two `anon` RPCs (`public_join_info`, `public_home_chapter_info`) are therefore only needed self-hosted |
| Q5 | Seed data | **Deferred.** The owner provides seed data later, once all three apps are under OpenAppHub. It should match what a user sees when starting fresh. Step 7 waits; nothing is copied from `charter_legacy` |
| Q6 | Platform operators and demo accounts | **Move to the hub.** Charter's `private.platform_operators`, `platform_flags` and the demo-org RPCs (`create_demo_organization`, `delete_demo_organization`, `is_platform_operator`) are not recreated in `charter`; the hub owns the concept. Charter's "Create demo" screens are left out of routing until the hub offers it |
| Q7 | Downtime | **Fine.** There are no production accounts besides demos, so the hosted site can be down between step 4 and step 9. No maintenance page |
| Q8 | Demo password | **Remove the demo accounts for now.** The password is taken out of the repo's docs and the smoke-test fallback (this PR); the owner deletes the accounts on production (§8.2) |

### 8.1 Follow-up questions these answers raise

- **F1 (from Q2/Q3, for pricing):** with the top of the tree as the customer and only staff counting, a plan's natural dimensions are *billed members* (staff seats, already in the spec) and *number of units* (chapters/regions under the licence). Charter can report both: the unit count from `charter.units`, the staff count from core `memberships`. If the price should depend on the unit count, the hub's billing needs to read it, through a `charter.api_unit_count` view (step 14). Decide when prices are set; nothing in steps 3–11 depends on it.
- **F2 (from Q4):** after a member signs up at the hub, **how do they join a chapter and pay its dues?** Options: (a) the hub's sign-up returns them to a signed-in **Join** screen in Charter (`charter.<apex>/join/<slug>`, no sign-up form, the dues checkout stays in Charter); (b) the hub hosts the whole join flow and calls a Charter RPC (`charter.begin_join`, `security invoker`, spec §3.5). Recommended: (a), since dues payments go to the org's own Stripe account, which only Charter knows. Needed by step 11.
- **F3 (from Q3):** which Charter roles count as "staff"? Proposed: anyone holding a role with any permission beyond the built-in **Member** role (for example `org_admin`, officer roles from board seats, custom roles with `members.manage`) gets a core membership; core `owner`/`admin` for `org_admin` at the top of the tree, core `member` for the rest. Needed by step 6.

### 8.2 Owner actions from these answers

1. **Delete the demo accounts on production now:** Supabase → Authentication → Users → delete `demo-national@opencharter.test`, `demo-chapter@opencharter.test`, `demo-member@opencharter.test` (and any other `@opencharter.test` account). Their orgs and records stay until step 4 parks them. Then delete the `SMOKE_DEMO_PASSWORD` repository secret: the live checks now skip without it instead of failing.
2. Rotate nothing else: the scan found no other secret.

## 9. Plan: the remaining steps

One branch and one pull request per step. **Bold** = runs on production; the owner applies it with the Migrate workflow (`target: production`). Agents never do.

| # | Step | Needs first | What it does |
|---|---|---|---|
| 1–2 | Inventory + secret scan (**this PR**) | — | this file; `docs/SHARED-SPEC.md`; the suite instructions in `AGENTS.md` |
| 3 | Hygiene | — | `.env.example` with every suite variable (§7); stop tracking `.env` (`.gitignore` `.env*` except `.env.example`, and move today's values to Cloudflare/`.env.local`); security headers for the Worker; remove Lovable leftovers (`@lovable.dev/*`, `previewAuthStorage`, Lovable error reporting, Lovable hosts in `origin.ts`, `.lovable/`, the Lovable note in `AGENTS.md`, `drizzle/` once nothing reads it); CI stays green |
| 4 | **`db/migrations/0000_park_legacy.sql`** | owner backup (`pg_dump` or Supabase backup); demo accounts deleted (§8.2) | `create schema if not exists charter_legacy`; for each of the 31 tables, 17 enums and 147 functions in `public` and the 3 tables in `private`: `alter … set schema charter_legacy`, each guarded by a catalog check so a re-run skips it. Revoke API grants on `charter_legacy`. `drop trigger if exists on_auth_user_created on auth.users` (none today). Nothing dropped. Moves the existing `branding` policies' dependency along (they stay working, pointing at parked functions). PR line 1: "Runs on PRODUCTION project; owner must apply before the hub's core migrations." Tested by replaying `supabase/migrations` locally, running it twice, and checking `public` is empty of Charter objects |
| — | (Hub) `db/core/*` + `0001_billing.sql` on production | step 4 applied | in OpenAppHub |
| 5 | Vendor shared code | OpenAppHub `shared/` v1.0.0 | copy `shared/`, `db/core/`, `scripts/migrate.mjs`; add `migrate.yml` and the `db` job in `ci.yml`; `"oahShared"` in `package.json`; turn off the `deploy` job in `supabase-db.yml`; adapt `check:migrations` to `db/migrations` |
| 6 | **`db/migrations/0001_charter_baseline.sql`** | F3; step 5 | `charter` schema per §3.4; `charter.units` for the tree under each billed org (Q2); the tables from §1.2 recreated with `org_id` (billed org) and `unit_id`; portal access for members (Q3); no platform-operator or demo-org objects (Q6); Charter's RPCs and triggers recreated in `charter` with `search_path = ''`; RLS = core gate + Charter permissions; `branding` bucket policies using `public.is_member` / `public.can_write` on the `<org_id>/` folder; `supabase/migrations/` deleted in the same PR |
| 7 | `db/seed/0001_charter_demo.sql` | **deferred** (Q5): the owner's suite seed data | idempotent, matching what a new user sees |
| 8 | DB tests | step 6 | port `db/tests/*.sql` to the `charter` schema; for every table: org isolation, viewer can't write, read-only when the trial has expired |
| 9 | Supabase client | step 5–6 | `shared/supabase/client.ts` (`VITE_APP_SCHEMA=charter`), `.schema('public')` for core; server client and auth middleware on the same schema; `gen-types.yml`; drop `pending-schema` shims |
| 10 | Org scoping | step 9 | `src/lib/orgs.ts` → `shared/supabase/org.ts` (`oah_org` cookie); every query carries the current org |
| 11 | Hosted vs self-hosted | step 10; F2 | `VITE_HOSTED`: `/` → dashboard, sign-in and sign-up → hub, the public join page and demo-org screens left out of routing (Q4, Q6), invitations and org/member management link to the hub; self-hosted keeps today's screens on core tables |
| 12 | Billing state | step 11; hub's `get_org_billing` | `BillingBanner`; write controls off when read-only; link to `${VITE_HUB_URL}/billing` |
| 13 | Export | step 9 | owners/admins export all Charter data (JSON and CSV), also when read-only (builds on the member and payments exports) |
| 14 | Integration surface | step 6 | `charter.api_orgs`/`api_units`, `api_board_seats` (for Board), `api_payments_summary` (for Ledger), `security_invoker = true`; `docs/INTEGRATION.md` |
| 15 | Design | hub design PR approved; Q1 | `shared/design` tokens and `AppShell` |
| 16–17 | Help links and docs | docs repo | `src/config/help.ts`; `charter/` docs updates |
| later | drop `charter_legacy` | owner says everything works | separate migration, only when asked |

Order on production (START-HERE): Charter 0000 → Hub core + billing → Charter 0001 → Board 0001 → Ledger 0001 → wipe Board's old project, which becomes staging.
