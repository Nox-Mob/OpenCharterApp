# Hand-off to Lovable: apply migrations 0008–0014

Status on 2026-11-01. The live database has migrations up to `0007_confirm_levels_applied`; `0008`–`0014` are not applied. Probes against the live API return `PGRST205` (table not found) or `PGRST202` (function not found) for each of them. The app already handles this: each screen that needs a missing migration shows "needs a database update" (readiness guard, D-135), and every other screen works as before. Nothing breaks if you wait. Everything below is what turns the new features on.

## 1. Bring the code into `main`
- Merge branch `claude/lucid-volta-bn4tjb` into `main` with a normal merge commit or a fast-forward.
- **Don't** squash, rebase or force-push. That rewrites history Lovable already synced.
- The branch is green in CI: lint, formatting, types, 248 unit tests, the migration-rules check (D-125), database tests against Postgres 16, and the build.

## 2. Apply the migrations, strictly in order
Each one depends on the one before it. They are additive only: no `DROP TABLE` or `DROP COLUMN`, every tenant table has `org_id uuid not null references public.organizations(id)`, full grants to `authenticated`, and RLS policies using `has_permission` / `is_org_member` (D-125, checked in CI by `bun run check:migrations`).

| # | File | What it adds | Check it worked (SQL editor) |
|---|---|---|---|
| 1 | `0008_memberships.sql` | Memberships, standing (good / grace / lapsed), membership history, payments recorded by admins (cash / check), member records without a login. Permissions `payments.view` and `payments.manage` | `select count(*) from public.memberships;` returns 0, not an error |
| 2 | `0009_payments_gateway.sql` | Per-org gateway connections (Stripe or the demo test gateway), webhook event log, sealed credentials in the schema `private`, which the API doesn't expose. New payment columns for checkout and refunds | `select count(*) from public.gateway_connections;` and `select to_regclass('private.gateway_secrets');` returns `private.gateway_secrets` |
| 3 | `0010_joining.sql` | Public join page data, starting and completing online payments, refunds, online renewal, decline with refund | `select public.public_join_info('demo-national') is not null;` |
| 4 | `0011_member_exports.sql` | Audited member exports (`members.export`) and saved views of the member list | `select count(*) from public.member_segments;` |
| 5 | `0012_member_privacy.sql` | Member directory, each member's directory choice, the parent's rule on exporting opted-out members | `select column_name from information_schema.columns where table_name = 'org_member_profiles' and column_name = 'directory_listed';` returns one row |
| 6 | `0013_receipts.sql` | Automatic, numbered, immutable receipts; void / reissue; refunds void or replace. Ends with a backfill that issues receipts for payments already marked paid (none today) | `select count(*) from public.receipts;` |
| 7 | `0014_board_seats.sql` | Board seats, each org's own seat terms with by-law history, appointments that grant and revoke the seat's role. Permissions `governance.manage` and `governance.define` | `select count(*) from public.seat_templates;` and `select count(*) from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.key = 'org_admin' and r.org_id is null and rp.permission_key like 'governance.%';` returns 2 |

If one fails, stop and don't apply the later ones. Keep the error message. Don't edit the file to make it pass; tell us and we'll ship a fix as a new migration (`0015_…`).

Notes for the importer:
- `0009` creates the schema `private` (`create schema if not exists private`) with one table, `gateway_secrets`, readable only by `service_role`. This is deliberate (D-127): the API must never expose sealed credentials. Please keep it out of the exposed API schemas.
- `0006` and `0007` are already applied. **Don't** re-run or edit them, or any earlier migration.
- Every new write path is a `security definer` function. The tables have no client insert / update / delete policies on purpose (append-only history, immutable receipts).

## 3. Add one secret
| Name | Value | Needed for |
|---|---|---|
| `GATEWAY_ENCRYPTION_KEY` | 32 random bytes, base64: run `openssl rand -base64 32` | Sealing each org's Stripe keys (AES-256-GCM). Add it in Lovable Cloud → Secrets. Never commit it, and never rotate it casually: credentials sealed with the old key can't be read, so orgs would have to reconnect Stripe |

Without it, everything works except "Connect Stripe", which says "Payments aren't set up on this server yet". The demo test gateway doesn't need it.

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_PUBLISHABLE_KEY` are already provided by Lovable Cloud. The Stripe webhook route and payment completion use them.

## 4. After applying
1. **Regenerate the types** (`src/integrations/supabase/types.ts`) as usual. Don't hand-edit it.
2. **No code changes are needed.** The readiness guard checks the live database and turns each screen on by itself: Memberships, Payments, Joining, Exports, Directory, Receipts, Board.
3. **Don't edit `src/lib/db/pending-schema.ts` yourself.** It holds hand-written types for these migrations. Once the regenerated types include them, we'll remove those sections in a follow-up commit and mark the rows in `roadmap.md` "Pending migrations" as applied.

## 5. Smoke test with the demo accounts
Accounts and password are in `docs/demo-data.md` (`demo-national@…`, `demo-chapter@…`, `demo-member@…`). The demo orgs are the only ones allowed the test gateway.

1. **Memberships (0008).** As the chapter admin, open Demo Austin Chapter → Members. Add a member without an email, then record a 1-year membership paid by check. Standing shows "Good" and the history shows the payment.
2. **Receipts (0013).** The check payment from step 1 has a receipt (Payments tab → Receipt column). Open it: number `2026-00001`, legal name, amount, "Print". Void it with a reason; the page shows VOID.
3. **Test gateway (0009).** Payments tab → "Use test payments (demo only)". The badge reads "Test mode".
4. **Joining (0010).** Open `/join/demo-austin` signed out, pick a level, sign in as `demo-member@…` and pay. On the test checkout, try **Declined** first (nothing is created), then **Accepted**. The membership appears; if approval is required (the demo national requires it) it waits as pending until the chapter admin approves it. A receipt is issued for the payment.
5. **Exports (0011).** Members → filter by standing → "Export CSV". The Audit log shows the export.
6. **Directory (0012).** Overview → "Show me in the member directory" off as the member; the Directory tab no longer lists them.
7. **Board (0014).** As the national admin, Demo National → Board → "Add seat": President, used by every chapter, required. In Demo Austin Chapter → Board, President shows **Vacant**. "Change term": 2 years from today, with a by-law reference. Appoint a member in good standing, then "End term". Past officers lists them.

## 6. Don'ts
- Don't edit, reorder, rename or re-run applied migrations.
- Don't apply `0009`–`0014` without `0008`.
- Don't drop tables or columns, or add DELETE policies to history, payment, receipt, term-rule or appointment tables.
- Don't force-push or rewrite `main`.
- Don't put `GATEWAY_ENCRYPTION_KEY` or any Stripe key in the repository.

## 7. Optional: real Stripe for a non-demo org
Each org connects its own Stripe account (direct mode, D-127). In the org's Payments tab the admin pastes a restricted or secret key and a webhook signing secret. In Stripe they add a webhook endpoint at `https://<app domain>/api/public/stripe/<org id>` (the Payments tab shows the exact address) sending `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired` and `charge.refunded`. Nothing is needed from Lovable for this beyond step 3.
