# Hand-off to Lovable: apply migrations 0026 and 0027

Status on 2026-11-02.

**Done:** migrations `0000`–`0025` are applied, the types are regenerated, and the `GATEWAY_ENCRYPTION_KEY` secret is set. Thank you. A record is at the end.

**Waiting:** `0026_seat_contacts` and `0027_board_setup_scope_and_demo_rank`, on branch `BoardUpdates`, tested against Postgres 16 (`db/tests/9J_seat_contacts.sql`, `9D_setup_board.sql`). Until they're applied:
- the Board page has no "Contact email" button and "Board and who to contact" lists officers' names without emails (readiness guard, D-135)
- Board setup can't change an existing seat's "used by" (it says to use "Edit seat" on the Board page), and Demo National's Rank stays optional

Nothing breaks if you wait.

## 1. Apply the migration
It is additive only (D-125, checked in CI by `bun run check:migrations`): a new tenant table with `org_id`, full grants to `authenticated`, RLS with `is_org_member` / `has_permission`, no drops.

| File | What it adds | Check it worked (SQL editor) |
|---|---|---|
| `0026_seat_contacts.sql` | `seat_contacts` (a role email per org and seat; none = show the officer's own email), `set_seat_contact` (needs `governance.manage`), `org_board_contacts` (who to contact, for members of the org) (D-156) | `select count(*) from public.seat_contacts;` returns 0, not an error |
| `0027_board_setup_scope_and_demo_rank.sql` | `apply_setup` (same as 0018) can now change an existing seat's "used by", refused while it would remove a current officer (D-157). Data, demo orgs only: the demo national's Rank member field becomes required | `select required from public.attribute_definitions d join public.organizations o on o.id = d.org_id where o.slug = 'demo-national' and d.key = 'rank';` returns `true` |

Notes:
- Writes go only through the `security definer` function `set_seat_contact`; the table has no client write policies on purpose.
- `org_board_contacts` returns the email of each current officer (or the seat's role email instead) to members of that org only. It never returns other members' emails.
- `0027` replaces `apply_setup` with `create or replace` and the same signature; the change is marked in a comment.
- Apply `0026` before `0027`. If one fails, stop and keep the error message. Don't edit the file to make it pass; we'll ship a fix as `0028_…`.

## 2. After applying
1. Regenerate the types (`src/integrations/supabase/types.ts`). Don't hand-edit it.
2. Run `bun run test:smoke`.
3. Tell us. We then mark the `seat_contacts` readiness feature applied, remove its types from `src/lib/db/pending-schema.ts` and mark the roadmap row applied. Please don't edit those two files yourself.

## 3. Smoke-test addition (optional)
In `smoke/live.smoke.test.ts`, as the Austin admin: `set_seat_contact(austin, <president seat>, 'president@smoke-<run>.test')`; as the member, `org_board_contacts(austin)` shows that email for President with `email_source = 'role'`; set it back to `null` and the officer's own email returns. `purge_smoke_data` removes the row (it cascades from the seat when the run's seats are removed; otherwise reset it to `null`).

## 3b. Payments: nothing to apply
Return links after paying now use the app's public address (D-158). Nothing is needed from Lovable. Optionally set the secret `PUBLIC_APP_URL` (e.g. `https://<your domain>`) to pin it. Stripe payments are now also confirmed from the return page when a webhook is late, so a misconfigured webhook no longer leaves members waiting (refunds still need it).

## 4. Checking by hand
`docs/user-testing.md` §14 step 10 (Board → Contact email) and §14a (member overview → Board and who to contact).

## 5. Don'ts
- Don't edit, reorder, rename or re-run applied migrations (`0000`–`0025`).
- Don't drop tables or columns, or add DELETE policies to history, payment, receipt, term-rule, appointment or pricing-rule tables.
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
