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
- User-facing flows get an end-to-end spec in `e2e/` (Playwright, Chromium, live demo backend; D-170, D-175). Specs clean up what they create with `purge_smoke_data`; checkout needs a deployed site (`E2E_BASE_URL`).
- Membership model (D-166, D-174): a national chooses "separate" or "home chapter" once. In the home-chapter model a chapter's member records stand for the national membership (`home_of`); read a record's membership with `profile_membership_id` (SQL) or `toMemberRow` (TS, `via_national`), and filter `left_at is null`. Embeds between `org_member_profiles` and `memberships` must name the foreign key (`memberships!memberships_profile_id_fkey`).
- Org-page sections live in `src/components/org/org-nav-items.ts` (left-hand menu, D-152); admins get Members, members get Directory (D-154).
- Every change updates its docs in the same commit: `roadmap.md`, `docs/decisions.md` (new `D-xxx`, older rows point to it), `docs/user-testing.md`, `docs/testing.md`, and the README where it says what works. Finished plans in `docs/plans/` are removed, not left to go stale.
