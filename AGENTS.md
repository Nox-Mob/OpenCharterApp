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
- Every policy/grant/trigger/RPC change ships with a test in `db/tests/` (see docs/testing.md); CI (`.github/workflows/ci.yml`) must stay green.
