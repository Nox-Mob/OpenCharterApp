<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# OpenAppHub suite migration (Nox-Mob/OpenCharterApp)

**Read `docs/SHARED-SPEC.md` first. It is the contract for the whole suite.** Progress, the inventory and the open questions for the owner: `docs/MIGRATION-NOTES.md`.

App ID: `charter` · Schema: `charter` · Hosted URL: `charter.<apex-domain>`

OpenCharterApp becomes one of three sub-apps of OpenAppHub. In hosted mode, it shares one Supabase database, one login and one organization ID with the other apps, and the hub handles sign-up and payments. Self-hosted, it must still work entirely on its own. All existing data is demo/test data; nothing needs to be preserved except useful seed content.

**Special role:** this app's current Supabase project becomes the suite's **production** database. So this repo goes first, and its first database step must be **non-destructive**.

---

## Suite: Work order (one PR per step)

### Phase 1 — Inventory and hygiene

1. **Inventory PR (no code changes besides docs).** Write `docs/MIGRATION-NOTES.md` covering:
   - every table, view, function, trigger, enum, storage bucket and Edge Function in the current project. Use the repo's `supabase/migrations/` and `src/integrations/supabase/types.ts`; ask the owner for a schema dump if they're incomplete;
   - which existing concepts map onto core (`organizations`, `memberships`, `profiles`, user roles) and which are Charter-specific;
   - any triggers on `auth.users`;
   - every place in the code that calls Supabase.
2. **Secret scan** of files and git history (SHARED-SPEC §7). Report findings to the owner; don't rewrite history.
3. **Hygiene:** `.env.example`, `.gitignore`, `public/_redirects` and `_headers`, CI (`ci.yml`). Remove Lovable leftovers.

### Phase 2 — Database move

4. **Park the legacy tables** in `db/migrations/0000_park_legacy.sql`. This is the only file allowed to touch pre-existing objects.
   - Move every existing Charter object out of `public` into a new schema `charter_legacy` (`alter table … set schema charter_legacy`, same for views, functions and types). **Nothing is dropped.**
   - Drop legacy triggers on `auth.users` that would break once tables move (core recreates `on_auth_user_created`).
   - It must be safe to re-run (guard each statement).
   - Clearly flag the PR: "Runs on PRODUCTION project; owner must apply before the hub's core migrations."
5. **Vendor shared code** from OpenAppHub: `shared/`, `db/core/` and `scripts/migrate.mjs` (SHARED-SPEC §8), plus `migrate.yml` and the `db` CI job.
6. **Charter baseline** in `db/migrations/0001_charter_baseline.sql`: recreate Charter's tables in schema `charter` following the §3.4 template.
   - Every org-scoped table gets `org_id → public.organizations`.
   - Replace any Charter-local org/member/profile tables with the core ones.
   - Fold the old `supabase/migrations/` history into this one clean baseline, then delete the old folder in the same PR (git history keeps it).
   - Storage buckets: create them with policies that check `public.is_member` on the org id in the object path (`<org_id>/…`).
7. **Seed:** `db/seed/0001_charter_demo.sql` with idempotent demo data. Copy useful rows from `charter_legacy` if the owner wants them, otherwise write fresh ones.
8. **DB tests** for every charter table: isolation between orgs, viewer can't write, and read-only when the trial has expired (§3.3).

### Phase 3 — App code

9. **Supabase client:** replace the Lovable client with `shared/supabase/client.ts` (`VITE_APP_SCHEMA=charter`). Use `.schema('public')` for core tables. Regenerate types (§3.6).
10. **Org scoping:** every query and insert uses the current org from `shared/supabase/org.ts`. No query may rely on "the user's only org".
11. **Hosted vs self-hosted** (§1.1):
    - Hosted: `/` → dashboard; no sign-up/login pages (redirect to hub); org and member management links to the hub.
    - Self-hosted: keep the landing page, sign-up/login, and simple org and member screens on the core tables.
12. **Billing state:** show `BillingBanner`. When `get_org_billing` says read-only, disable write controls (the database enforces it anyway) and link to the hub's billing page.
13. **Export:** owners and admins can export all Charter data for the org (JSON and CSV), including when read-only.
14. **Integration surface:** publish read-only `charter.api_*` views that the other apps may need (for example, documents/charters list with id, title, status, updated_at), with `security_invoker = true`. Document them in `docs/INTEGRATION.md`.

### Phase 4 — Design

15. Adopt `shared/design` tokens and `AppShell`.
    - If Charter is a **reference** app (SHARED-SPEC §0), this should be a near-invisible change; replace hard-coded colours with tokens.
    - If it's the **outlier**, restyle to match, without changing behaviour, in separate PRs with before/after screenshots.

---

### Phase 5 — Documentation

Docs for this app live in the docs repo under `src/content/docs/charter/` (SHARED-SPEC §12).

16. **Help links.** Add the app's help map (`src/config/help.ts`, using `shared/docs.ts`) and link these screens to their pages:

    | Screen | Docs path |
    |---|---|
    | User menu → Help | `charter/` |
    | Settings → Setup, Membership setup | `charter/membership/setup-and-levels/` |
    | Board setup | `charter/governance/board-setup/` |
    | Members → Import members | `charter/members/importing/` |
    | Settings → Payments | `charter/money/payments/` |
    | Receipts | `charter/money/receipts/` |
    | Creating a national (membership model step) | `charter/membership/membership-models/` |

17. **Docs PR for this migration.** Update the `charter/` tab for what Phases 2–4 changed:
    - `charter/start/your-account.md` and `charter/start/finding-your-way.md`: in hosted mode, sign-in, account, organizations and invitations happen in the hub; describe both hosted and self-hosted where they differ.
    - `charter/help/known-limits.md` and `charter/help/faq.md`: the read-only state when a hosted plan lapses, and data export.
    - `charter/help/self-hosting.md`: new setup steps (shared core, migration runner, `VITE_HOSTED=false`).
    - Any screen renamed or moved by the design work in Phase 4.

From then on, every PR with a user-facing change has a matching docs PR (SHARED-SPEC §12.2). This repo's own `docs/user-testing.md` is the best source for exact on-screen wording.

## Suite: Rules specific to this repo

- Production-impacting migration files (step 4, step 6) must say so in the first line of the PR description. The owner applies them via the `production` workflow dispatch; you never do.
- `charter_legacy` stays until the owner confirms everything works. Then write a separate migration that drops it, and only when asked.
- Don't touch the `public`, `billing` or `ops` schemas except through the vendored `db/core/`.

## Suite: Done when

SHARED-SPEC §11 is satisfied, and in hosted mode a user who logged in at the hub opens `charter.<apex-domain>` already signed in, in the same org. The `charter/` docs tab matches the app, and every Help link opens a real page.

The repo's own rules below stay in force until a suite step replaces them. Where they conflict with `docs/SHARED-SPEC.md`, the spec wins once the owner confirms; the known conflicts are listed in `docs/MIGRATION-NOTES.md` §7.

# OpenCharterApp — agent rules

Read `docs/instructions.md` before changing code; planning docs live in `docs/`. Track work in `roadmap.md`.

- Phase 1 (D-212): the app runs on its own Supabase project (`.env`) and a Cloudflare Worker built from `main`; Google sign-in goes through `supabase.auth.signInWithOAuth`, not Lovable. The database is built only from `supabase/migrations` by the "Supabase database" workflow; after the cutover, new migrations go there (`docs/migration/`).
- Stack is TanStack Start + Lovable Cloud (see docs/decisions.md D-100..D-104), superseding the Next.js/pg-boss/Better Auth defaults — the Lovable toolchain requires it.
- Every tenant table has `org_id`, explicit GRANTs and RLS using `public.has_permission` / `public.is_org_member` — RLS is the safety net for tenant isolation.
- Authorization goes through `src/lib/policy` (UI) and `has_permission` (DB); never ad hoc checks — keeps downward-only inheritance (D-032) in one place.
- Organizations are created only via the `create_organization` RPC — it enforces hierarchy rules and seeds the creator's admin role.
- Audit events are written only by triggers/definer functions; no client insert/update/delete — keeps the log append-only.
- Domain code goes in `src/modules/<domain>/`, shared engines in `src/engines/` — enforces module boundaries from architecture.md.
- Settings are declared in `src/engines/settings` (registry + resolver) and stored in `org_settings`; the DB trigger `enforce_setting_lock` is authoritative for locks — keeps inherit/override/locked consistent everywhere.
- Invitations are created/accepted only through `create_invitation` / `accept_invitation` RPCs storing token hashes — keeps tokens single-use and email-bound.
- Logos live in the private `branding` bucket under `<org_id>/` and are shown via signed URLs — workspace blocks public buckets.
- Attribute values change only via `set_attribute_value`; definitions/options are retired (`active=false`), never deleted — keeps stored values meaningful.
- Setup flows live in `src/modules/<domain>/setup-flow.ts` on the `src/engines/setup` framework and apply only via `apply_setup` — one transaction, idempotent by key.
- New migrations follow Lovable's import rules: `org_id uuid not null references public.organizations(id)` on tenant tables, `grant select, insert, update, delete ... to authenticated`, RLS with `has_permission` / `is_org_member` policies, and no `DROP TABLE` / `DROP COLUMN` (enforce "no delete" by having no DELETE policy, and immutable columns by trigger). `bun run check:migrations` checks this in CI (D-125).
- Every policy/grant/trigger/RPC change ships with a test in `db/tests/` (see docs/testing.md); CI (`.github/workflows/ci.yml`) must stay green.
- Migrations Lovable hasn't applied yet: put their types in `src/lib/db/pending-schema.ts` (never hand-edit the generated `src/integrations/supabase/types.ts`), guard the screens with `src/lib/db/readiness.ts` / `<RequiresDatabase>`, and list them in `roadmap.md` and `docs/lovable-handoff.md` (D-135). Once applied, remove the shims and mark the feature applied. Never edit an applied migration; Lovable adds its own small "confirm" migrations — leave them as they are.
- A new migration must also apply inside a single transaction (Lovable may run it that way): compare new enum values as text, and copy a function's full latest body when replacing it.
- Playwright stays pinned at exactly `1.64.1` (owner's requirement, D-186). Specs import `test`/`expect` from `e2e/fixtures.ts` (origin guard: only the app, its backend and fonts), keep Chromium's sandbox on, and open extra pages with `guardedPage`. Never point the test browser or a browsing agent at the open web.
- User-facing flows get an end-to-end spec in `e2e/` (Playwright, Chromium, live demo backend; D-170, D-175). Specs clean up what they create with `purge_smoke_data`; checkout needs a deployed site (`E2E_BASE_URL`).
- Membership model (D-166, D-174): a national chooses "separate" or "home chapter" once. In the home-chapter model a chapter's member records stand for the national membership (`home_of`); read a record's membership with `profile_membership_id` (SQL) or `toMemberRow` (TS, `via_national`), and filter `left_at is null`. Embeds between `org_member_profiles` and `memberships` must name the foreign key (`memberships!memberships_profile_id_fkey`).
- Org-page sections live in `src/components/org/org-nav-items.ts` (left-hand menu, D-152); admins get Members, members get Directory (D-154). Configuration goes only on Settings pages; other pages show information or let people act (D-185). A setting that doesn't apply in the home-chapter model is marked `homeChapter` in the settings registry and left out of setup (D-184).
- The app is called "OpenCharterApp" everywhere it shows its name (sidebar, headers, sign-in, landing and legal pages), never "OpenCharter" (D-216).
- Commits, pull requests, code and comments carry no "Generated with Claude Code" line and no Claude session link (`claude.ai/code/session_…`); the owner's rule (D-215).
- Run `bun run hooks:install` once per clone: the pre-commit hook runs lint, formatting, types, migration rules and related tests (D-182). Never use `--no-verify`. Pull requests that change code without docs or tests fail the "Docs check" unless labelled `no-docs-needed`.
- Linked levels (D-177) change only through `adopt_suggested_level` / `set_linked_level_price` / `make_level_own` and the sync triggers, which set the `app.level_link` session flag; don't edit a linked level's name, terms or price directly.
- Lists that can pass 1,000 rows must read every page (`readAllPages` in `src/lib/db/pages.ts`; the API caps each request at 1,000), and roll-ups resolve inherited settings once per org, not per row (D-181). Check big changes with `bun run test:perf`.
- Member records are never deleted: take them off the roster with `remove_member_record` (sets `left_at`; history kept) and back with `restore_member_record` (D-190). `is_org_member` ignores records that left. Bulk changes to members go through `import_members` (D-189). The audit log is read through `audit_log()`, one org at a time (D-191).
- The privacy policy and terms text lives in `src/content/legal.tsx` (final text, operated by OpenAppHub; D-193, D-210, D-214).
- Table map: `docs/tables.md` (every table, its links and write paths). A migration that adds a table, column or foreign key updates it.
- Every change updates its docs in the same commit: `roadmap.md`, `docs/decisions.md` (new `D-xxx`, older rows point to it), `docs/user-testing.md`, `docs/testing.md`, `docs/tables.md` for schema changes, and the README where it says what works. Finished plans in `docs/plans/` are removed, not left to go stale.
