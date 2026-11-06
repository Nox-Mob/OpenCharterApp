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
- Run `bun run hooks:install` once per clone: the pre-commit hook runs lint, formatting, types, migration rules and related tests (D-182). Never use `--no-verify`. Pull requests that change code without docs or tests fail the "Docs check" unless labelled `no-docs-needed`.
- Linked levels (D-177) change only through `adopt_suggested_level` / `set_linked_level_price` / `make_level_own` and the sync triggers, which set the `app.level_link` session flag; don't edit a linked level's name, terms or price directly.
- Lists that can pass 1,000 rows must read every page (`readAllPages` in `src/lib/db/pages.ts`; the API caps each request at 1,000), and roll-ups resolve inherited settings once per org, not per row (D-181). Check big changes with `bun run test:perf`.
- Member records are never deleted: take them off the roster with `remove_member_record` (sets `left_at`; history kept) and back with `restore_member_record` (D-190). `is_org_member` ignores records that left. Bulk changes to members go through `import_members` (D-189). The audit log is read through `audit_log()`, one org at a time (D-191).
- The privacy policy and terms text lives in `src/content/legal.tsx` (placeholder until the owner replaces it, D-193).
- Table map: `docs/tables.md` (every table, its links and write paths). A migration that adds a table, column or foreign key updates it.
- Every change updates its docs in the same commit: `roadmap.md`, `docs/decisions.md` (new `D-xxx`, older rows point to it), `docs/user-testing.md`, `docs/testing.md`, `docs/tables.md` for schema changes, and the README where it says what works. Finished plans in `docs/plans/` are removed, not left to go stale.
