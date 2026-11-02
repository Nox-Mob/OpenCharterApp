# Hand-off to Lovable: apply migration 0026

Status on 2026-11-02.

**Done:** migrations `0000`–`0025` are applied, the types are regenerated, and the `GATEWAY_ENCRYPTION_KEY` secret is set. Thank you. A record is at the end.

**Waiting:** `0026_seat_contacts`, on branch `BoardUpdates`, tested against Postgres 16 (`db/tests/9J_seat_contacts.sql`). Until it's applied, the Board page has no "Contact email" button and "Board and who to contact" lists officers' names without emails (readiness guard, D-135). Nothing breaks if you wait.

## 1. Apply the migration
It is additive only (D-125, checked in CI by `bun run check:migrations`): a new tenant table with `org_id`, full grants to `authenticated`, RLS with `is_org_member` / `has_permission`, no drops.

| File | What it adds | Check it worked (SQL editor) |
|---|---|---|
| `0026_seat_contacts.sql` | `seat_contacts` (a role email per org and seat; none = show the officer's own email), `set_seat_contact` (needs `governance.manage`), `org_board_contacts` (who to contact, for members of the org) (D-156) | `select count(*) from public.seat_contacts;` returns 0, not an error |

Notes:
- Writes go only through the `security definer` function `set_seat_contact`; the table has no client write policies on purpose.
- `org_board_contacts` returns the email of each current officer (or the seat's role email instead) to members of that org only. It never returns other members' emails.
- If it fails, stop and keep the error message. Don't edit the file to make it pass; we'll ship a fix as `0027_…`.

## 2. After applying
1. Regenerate the types (`src/integrations/supabase/types.ts`). Don't hand-edit it.
2. Run `bun run test:smoke`.
3. Tell us. We then mark the `seat_contacts` readiness feature applied, remove its types from `src/lib/db/pending-schema.ts` and mark the roadmap row applied. Please don't edit those two files yourself.

## 3. Smoke-test addition (optional)
In `smoke/live.smoke.test.ts`, as the Austin admin: `set_seat_contact(austin, <president seat>, 'president@smoke-<run>.test')`; as the member, `org_board_contacts(austin)` shows that email for President with `email_source = 'role'`; set it back to `null` and the officer's own email returns. `purge_smoke_data` removes the row (it cascades from the seat when the run's seats are removed; otherwise reset it to `null`).

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
