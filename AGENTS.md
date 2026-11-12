# Suite migration (OpenAppHub, v2)

> **Branches (owner rule, 2026-11-11):** pull requests target `staging`, and every merge goes to `staging`. Nothing merges into `main` (production) without the owner's approval, or the owner merging it. CI runs on pull requests and on pushes to `staging`; only workflows that must run on `main` (releases) do.

**Read `docs/SHARED-SPEC.md` (v2) first.** All other internal docs are in OpenAppHub's `docs/` (reader: `OpenAppHub/docs/README.md`). The step plan, inventory and status: `OpenAppHub/docs/charter/MIGRATION-NOTES.md` §9. This section gives the owner's answers and the changes v2 makes to that plan.

App ID `charter` · schema `charter` · hosted at `charter.openapphub.org` (staging `staging.charter.staging.openapphub.org`) · package manager **Bun**.

This project (`nxungwtxnctcqolfshcr`) becomes the suite's **production** database. Its first database step must be non-destructive.

The repo's other rules still apply unless this section or the spec replaces them, including **D-215: no "Generated with Claude Code" lines or session links** in commits, PRs, code or comments.

---

### Owner answers to your notes

| Your item | Answer |
|---|---|
| Q1 / §5.1 hosting | **Workers** (spec §10). Headers in the Worker. |
| Q1 inputs | Spec §0.1 is filled in. **Design is a full refresh** for every app (spec §9): Charter isn't a reference app; restyle in Phase 4 once the hub's direction is approved. |
| Q2–Q3, F3 | As you proposed: top of the tree = core org; `charter.units` for regions and chapters; staff (anyone with a role beyond the built-in Member) get core memberships, `org_admin` at the top unit → core `owner`/`admin`; portal members don't count (spec §3.9, §4.5). |
| Q4, F2 | **New members sign up at the hub.** Option (a): hosted `/join/<slug>` is a **signed-in** join screen in Charter; signed-out visitors go to the hub's sign-up and come back. The public join page with Charter's own sign-up is self-hosted only (spec §4.5). |
| Q5 | Seed deferred, but **demo runs on staging** (spec §11): a minimal `db/seed/0001_charter_demo.sql` is now wanted; the owner's full content comes later. |
| Q6 | Platform operators and demo orgs move to the hub. Don't recreate them. |
| Q7, Q8 | As decided: downtime fine; delete the demo accounts on production. |
| §5.5 dues | Dues stay in Charter (spec §6.3). |
| §5.6 read-only | Keep recording payments, refunds and receipts; refuse **new** joins and renewals while read-only (spec §6.3). |
| §5.9 profiles | Signed-in people's names come from `public.profiles` (via `org_member_directory`); roster-only records keep their own fields. |
| Invitations | **Handled by the hub, through core** (spec §4.3). Charter's `create_invitation` / `accept_invitation` are **not recreated**. Charter keeps an `/invite/<token>` page built on `shared/ui/InvitationPage` and adds `charter.on_invitation_accepted(p_invitation_id)` to apply the Charter part (link the roster record in `app_payload`, grant portal access, assign a Charter role). |
| Ownership | **Core, transferred in the hub** (spec §4.4). Hosted: Charter links to the hub. Self-hosted: Charter's screen calls `public.transfer_ownership`. |
| Orgs | Top-level orgs through `public.create_organization` (hub when hosted). Units through `charter.create_unit(…)`. |

### Changes to your step plan (MIGRATION-NOTES §9)

- **Step 3 (hygiene):** add `staging.yml` and `release.yml` (spec §10.2) and switch off the Cloudflare build that deploys production from `main`. Add `opencharterapp.org` → `charter.openapphub.org` redirect notes for the owner.
- **Step 5 (vendor):** also switch off the `deploy` job in `supabase-db.yml` (spec §3.3).
- **Step 6 (baseline):**
  - Rename the bucket to **`charter-branding`** (spec §3.7).
  - Write helper(s) always include `public.can_write(org_id,'charter')`, then Charter permissions (spec §3.5).
  - `charter.is_portal_member(p_org, p_unit)` for dues members' reads.
  - `charter.on_invitation_accepted` (above). No Charter invitation tables.
  - `public_join_info` / `public_home_chapter_info`: created and granted to `anon` only when `instance_settings.billing_enabled` is false (self-hosted).
  - `begin_join` / `begin_renewal` refuse when `public.has_app_access(org,'charter')` is false; payment recording paths don't check it.
  - `charter.api_unit_count` (spec §6.1) along with the step-14 views.
- **Step 7 (seed):** minimal idempotent demo seed for staging, refusing to run if real orgs exist. Demo addresses on `@demo.openapphub.org`; no passwords in the repo.
- **Step 11 (hosted vs self-hosted):** hosted `/join/<slug>` requires sign-in (`loginRedirect` to the hub's sign-up with `next`); invitations, org creation, ownership and member core roles link to the hub; Charter's own roles, permissions, seats and roster stay in Charter.
- **Step 14 (integration):** `charter.api_units`, `charter.api_board_seats`, `charter.api_payments_summary`, `charter.api_unit_count`.
- **Step 15 (design):** adopt the new shared design (not a token swap). Separate PRs, before/after screenshots, behaviour and visible text unchanged unless the owner approves.

### Rules specific to this repo (kept from v1)

- Production-impacting migration files (step 4, step 6) say so in the first line of the PR description. The owner applies them with the Release or Migrate workflow (`target: production`); agents never do.
- `charter_legacy` stays until the owner confirms everything works. Then a separate migration drops it, and only when asked.
- Don't touch the `public`, `billing`, `hub` or `ops` schemas except through the vendored `db/core/`.

### Phase 5 — Documentation (steps 16–17)

Docs live in `Nox-Mob/OpenAppHub-docs` under `src/content/docs/charter/` (spec §12). `OpenAppHub/docs/charter/user-testing.md` is the best source for exact on-screen words.

16. **Help links** (`src/config/help.ts`):

    | Screen | Docs path |
    |---|---|
    | User menu → Help | `charter/` |
    | Settings → Setup, Membership setup | `charter/membership/setup-and-levels/` |
    | Board setup | `charter/governance/board-setup/` |
    | Members → Import members | `charter/members/importing/` |
    | Settings → Payments | `charter/money/payments/` |
    | Receipts | `charter/money/receipts/` |
    | Creating a national (membership model step) | `charter/membership/membership-models/` |

17. **Docs PR:**
    - `charter/start/your-account.md`, `charter/start/finding-your-way.md`, `charter/setup/creating-an-organization.md`, `charter/setup/chapters.md`: hosted sign-in, org creation and invitations in the hub; chapters as units.
    - `charter/money/joining-and-renewing.md`: hosted members sign up at the hub, then join; refused new joins while read-only.
    - `charter/setup/roles.md`: core roles versus Charter roles.
    - `charter/help/demo-organizations.md`: demo is on staging; operator-created demos come from the hub.
    - `charter/help/known-limits.md`, `faq.md`, `self-hosting.md`: read-only state, export, new self-hosting steps.
    - Any screen renamed or moved by the restyle.

### Done when

SHARED-SPEC §13 is satisfied; a hosted user signed in at the hub opens `charter.openapphub.org` already signed in, in the same org; a new member can sign up at the hub, join a chapter and pay dues; and a self-hosted build runs on an empty database with only Charter's migrations and `db/core`.

The repo's own rules below stay in force unless this section or the spec replaces them; `OpenAppHub/docs/charter/MIGRATION-NOTES.md` §7 lists which rule is replaced in which step.

# OpenCharterApp — agent rules

Read `OpenAppHub/docs/charter/instructions.md` before changing code; planning docs live in `OpenAppHub/docs/charter/`. Track work in `OpenAppHub/docs/ROADMAP.md` (Charter's items are `C-`).

- The app runs in the shared OpenAppHub Supabase project (schema `charter`) and on a Cloudflare Worker; Google sign-in goes through `supabase.auth.signInWithOAuth` (self-hosted) or the hub (hosted). The database is built from `db/migrations` by `scripts/migrate.mjs`; the owner applies them with `migrate.yml`.
- Deploys (D-219, spec §10.2): public settings per environment live in `wrangler.jsonc` (no `.env` is committed; local values go in `.env.local`). Staging is the Worker's preview of branch `staging` (`staging.charter.staging.openapphub.org`); production deploys from `main`. Pull requests target `staging`; nothing merges into `main` without the owner's approval. Security headers come from `src/server.ts`; keep the CSP in `src/lib/security-headers.ts` to the app, its Supabase project and the hosts it really loads.
- Stack is TanStack Start + Supabase on a Cloudflare Worker (D-100..D-104, D-212, D-219), with a plain `vite.config.ts`.
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
- New migrations follow Charter's migration rules: `org_id uuid not null references public.organizations(id)` on tenant tables, `grant select, insert, update, delete ... to authenticated`, RLS with `has_permission` / `is_org_member` policies, and no `DROP TABLE` / `DROP COLUMN` (enforce "no delete" by having no DELETE policy, and immutable columns by trigger). `bun run check:migrations` checks this in CI (D-125).
- Every policy/grant/trigger/RPC change ships with a test in `db/tests/` (see `OpenAppHub/docs/charter/testing.md`); CI (`.github/workflows/ci.yml`) must stay green.
- Migrations not yet applied to the live database: put their types in `src/lib/db/pending-schema.ts` (never hand-edit the generated `src/integrations/supabase/types.ts`), guard the screens with `src/lib/db/readiness.ts` / `<RequiresDatabase>`, and list them in `roadmap.md` (D-135). Once the owner has applied them (`migrate.yml`) and `gen-types.yml` has regenerated the types, remove the shims and mark the feature applied. Never edit an applied migration (the runner refuses changed files).
- A new migration must also apply inside a single transaction (the runner applies each file in one transaction): compare new enum values as text, and copy a function's full latest body when replacing it.
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
- Table map: `OpenAppHub/docs/charter/tables.md` (every table, its links and write paths). A migration that adds a table, column or foreign key updates it.
- Every change updates its docs (in OpenAppHub, a companion pull request) with the change: `OpenAppHub/docs/ROADMAP.md`, `OpenAppHub/docs/charter/decisions.md` (new `D-xxx`, older rows point to it), `OpenAppHub/docs/charter/user-testing.md`, `OpenAppHub/docs/charter/testing.md`, `OpenAppHub/docs/charter/tables.md` for schema changes, and the README where it says what works. Finished plans in `OpenAppHub/docs/charter/plans/` are removed, not left to go stale.
