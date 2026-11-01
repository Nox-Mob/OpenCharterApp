# Plan: E-12 payments and E-13 joining and renewals

Agreed 2026-11-01. Order follows D-117 (core first): **E-13a → E-12 → E-13b**, then the email follow-up once E-08 exists. Each step ships with its migration (following the Lovable rules, D-125), `db/tests/` coverage, unit tests and doc updates. Progress is tracked in `/roadmap.md`.

## Decisions taken for this plan
- **Pay per term.** Each join or renewal is a one-time Stripe Checkout payment, and members click Renew. No auto-renew until E-08.
- **Pay first, then approval.** A pending applicant who is declined is refunded.
- **Early renewal stacks** on the paid-through date. Lapsed members restart from today.
- **An unnamed only-level** is shown as "Membership" (D-126, already built).
- **Demo orgs use a test gateway** that mimics accepted and declined cards, so everything can be tested without Stripe.
- **A parent org decides** whether its chapters' new members are accepted automatically, always reviewed, or left to each chapter.

New decision IDs reserved for these steps: D-127 (secret storage and Stripe client), D-128 (Playwright in CI), D-129 (test gateway limited to demo orgs or an env flag), D-130 (parent-set auto-acceptance).

## E-13a: Memberships and standing, admin-recorded (no Stripe)
Migration `0008_memberships.sql`, following D-125 (full grants, RLS through `has_permission` / `is_org_member`, no drops, no DELETE policies):
- `org_member_profiles` changes:
  - `user_id` becomes nullable (an additive change, no drop).
  - New `source` (`signup|invite|admin|import`) and `claimed_at`.
  - A check that `user_id is not null or source in ('admin','import')` (D-116).
- `memberships`:
  - columns: `org_id, profile_id, tier_id, term_id, status pending|active|cancelled|declined, starts_on, paid_through (null = lifetime), created_by, created_at`
  - one current membership per profile per org, plus history rows
- `membership_events`: append-only (`joined|renewed|approved|declined|cancelled|payment_recorded|refunded`). Written only by definer functions; no client insert/update/delete policy.
- `payments`:
  - one table for all money, with `gateway` `manual|stripe`
  - columns: `org_id, membership_id, payer_user_id, amount_minor, currency, status pending|paid|refunded|failed, purpose join|renew, method cash|check|card|other, gateway_ref, received_on, note, created_by`
  - written only by RPCs or the webhook definer. Readable by the payer and by `payments.view`.
- Permissions: `payments.view` and `payments.manage` (seeded to `org_admin`). `members.manage` covers approvals.
- RPCs, all definer, each writing an event and audited:
  - `admin_create_member(_org, _name, _email?, _attrs)`: email optional only for admin records
  - `record_membership(_profile, _term, _paid_on, _amount?, _method?)`: join or renew with a manual payment
  - `approve_membership`, `decline_membership`, `cancel_membership`
- Stacked renewal (agreed): the new term starts the day after `paid_through` while the member is in good standing or grace. Otherwise it starts today. Lifetime has no end date.
- `accept_invitation` claims an unclaimed admin-created profile with the same email instead of creating a second one.
- Standing is derived on read (D-111):
  - `src/modules/membership/standing.ts`: `(membership, graceDays, today) → good|grace|lapsed|pending|cancelled|declined`, plus `daysToExpiration` and `renewalStart`.
  - It reuses `termEndDate` from `tiers.ts`.
  - A SQL twin, `membership_standing()`, serves list filters.
  - Both are tested against the same matrix, including R-14 edge days.
- UI:
  - Members tab: "Add member" (email optional with a no-login warning), a standing badge, and paid-through and time-to-expiration columns.
  - Member details: membership history, Record payment, Renew, Cancel.
  - An "Applications" list of pending memberships with Approve / Decline.
- Tests:
  - `db/tests/A0_memberships.sql`: records without login only via admin; claim on invite; stacking renewal; cross-org denied; a member reads only their own; events and payments not writable by clients; deletes remove nothing.
  - `standing.test.ts`.

## E-12: Per-org Stripe connection (D-105, Direct mode only)
**Spike first** (≤1 day), and record the result as D-127:
- (a) **Secret storage.** Each org's restricted API key and webhook signing secret are encrypted with AES-GCM using the server secret `GATEWAY_ENCRYPTION_KEY` (a Lovable Cloud secret). They are kept in a **non-public schema**, `private.gateway_secrets`, which isn't exposed through the API. Only definer functions and the server-side client read them, so they're never visible to the browser. The spike also checks whether Supabase Vault is available on Lovable Cloud as the alternative.
- (b) **Stripe over plain `fetch`** from the edge worker, with no new dependency. A small client covers Checkout Sessions, Refunds and a verify call. Webhook signatures are checked with WebCrypto HMAC-SHA256, including the timestamp tolerance.
- (c) A raw-body webhook server route in TanStack Start: `src/routes/api/public/stripe.$orgId.ts`.

Then:
- Migration `0009_payments_gateway.sql`:
  - `gateway_connections` (public): `org_id, gateway 'stripe', mode 'direct', status unverified|verified|disabled, account_label, verified_at`. No secrets in this table. Readable by `payments.view`.
  - `private.gateway_secrets`
  - `webhook_events`: `org_id, gateway_event_id unique, type, received_at, processed_at`, which makes the handler idempotent
- `src/engines/payments/`: the gateway interface (`createCheckout`, `refund`, `verify`, `verifyWebhook`, `parseEvent`).
- `src/modules/payments/stripe.ts`: the adapter.
- `src/modules/payments/connect.ts`: server functions `connectStripe(org, key, webhookSecret)` (verify, then store encrypted) and `disconnectStripe`.
- Payments setup flow, `src/modules/payments/setup-flow.ts`:
  - a "Connect payments" step with a new `gateway` question type. It renders the connect form; the keys go straight to the server function and are **never saved in setup drafts**. The draft stores only `{ connected, account_label }`.
  - The step shows the org's webhook URL to paste into Stripe.
- "Payments" tab: connection status, Reconnect / Disconnect, and the payments list (`payments.view`).
- Selling stays off until the org's connection is `verified`.
- Tests:
  - signature checks pass and fail (good, tampered, expired timestamp) against recorded fixtures
  - encryption round-trip
  - Stripe client calls against a fetch stub
  - `db/tests/B0_payments.sql`: connection isolation; secrets not readable by `authenticated`; webhook event idempotency
- Out of scope, as already planned: Connect mode and the national fee (E-21), PayPal (E-21), two-level dues (E-18).

### Test gateway (demo dummy connection)
A second adapter behind the same gateway interface, `src/modules/payments/test-gateway.ts`, with `gateway = 'test'`. Everything else (joining, approval, renewal, refunds, receipts later) runs exactly as with Stripe.
- **Where it's allowed:** demo orgs (the `d1000000-` ids in `docs/demo-data.md`), plus any org when the server env flag `PAYMENTS_TEST_GATEWAY=on` is set (for local and preview builds). A DB check rejects `gateway = 'test'` for other orgs, so real orgs can't fall back to fake payments.
- **Connecting:** the "Connect payments" step offers "Use test payments (demo only)". It verifies instantly, with no keys.
- **Checkout:** instead of Stripe it opens our own page, `/pay/test/$paymentId`. It shows the amount and has buttons that mimic Stripe's test cards:
  - **Card accepted** → payment `paid` (like `4242 4242 4242 4242`)
  - **Card declined** → payment `failed` with "Your card was declined" (like `4000 0000 0000 0002`); the person can try again
  - **Insufficient funds** → `failed` with that message (like `4000 0000 0000 9995`)
  - **Cancel** → back to the join page with nothing charged
  - **Accepted, slow confirmation** → the return page shows "Waiting for confirmation" for a few seconds before the result is delivered. This exercises the webhook-arrives-later path.
- **Same path as real payments:** each button calls the same `complete_gateway_payment` / `fail_gateway_payment` RPCs the Stripe webhook uses, with a generated event id. Duplicate clicks stay idempotent.
- **Refunds:** an admin refund (or a declined application) on a test payment marks it refunded immediately.
- **Labelling:** test payments are marked "Test" in every list and on the payment row (`livemode = false`), so they're never mistaken for real money. The demo cleanup steps remove them.
- **Seed:** the demo national and the Austin chapter get a test connection plus one level, so you can try it right away.
- Tests: unit tests for the adapter's outcomes; a DB check that the test gateway is rejected for non-demo orgs without the flag; a Playwright e2e covering both "accepted" and "declined".
- **Real Stripe test mode is still supported:** an org can paste Stripe *test* keys (`sk_test_…`), use Stripe's own test cards, and see results via real webhooks. That's the final check before going live.

## E-13b: Public join and online renewal
- **Public join page** `/join/$orgSlug`. This is a plain path, since per-org web addresses (E-07) are deferred.
  - `public_join_info(slug)` (definer, callable by `anon`) returns the org name and logo, its active levels and terms, its required member fields, and whether payments are on. If not, the page says "Online joining isn't open yet".
  - Flow: pick a level and term → sign up or sign in (D-116; the response stays neutral per R-15) → fill required member fields → Stripe Checkout.
  - `begin_join(_org, _term, _answers)` validates the answers with `validate_attribute_value` but writes nothing. It creates a `pending` payment that holds the answers. The member profile is created only after payment, so abandoned checkouts don't create members.
  - A chapter whose parent manages levels shows the parent's join link instead. Two-level dues remain E-18.
- **Webhook** `checkout.session.completed`:
  - calls a definer RPC `complete_gateway_payment(event_id, payment_id, amounts)`, which is idempotent through `webhook_events`
  - marks the payment paid, creates the profile (source `signup`), writes the answered fields, and creates or extends the membership (stacking)
  - when approval is required, the membership stays `pending`
  - `charge.refunded` marks the payment refunded
- **Joining rules: auto-acceptance set by the parent.**
  - Today `membership.approval_required` is tied to the "lock joining rules" switch together with the grace period.
  - Split it out. In Membership setup's "Rules for your chapters" step, add a 3-way question: "How are new members of your chapters accepted?"
    - **Accepted automatically**: `approval_required = false`, locked
    - **Always reviewed by an admin**: `true`, locked
    - **Each chapter decides**: not locked, so chapters keep their own setting
  - The national's own answer ("Must an admin approve new members?") stays separate. The grace-period lock keeps its own switch.
  - Enforced by the existing `enforce_setting_lock` trigger. `begin_join` and `complete_gateway_payment` read the resolved setting, where a locked ancestor value wins.
  - When accepted automatically, the paid membership is `active` immediately. Otherwise it is `pending` until approved.
  - Settings tab: the chapter sees "Set by {national}" when locked.
  - Tests: setup plan cases for all three choices; DB checks that a chapter can't override a locked value; webhook → `active` vs `pending`.
- **Decline**: an admin declines a pending application → server function issues the refund (Stripe or test gateway) → `decline_membership`.
- **Renew** button in the member's portal: same checkout with purpose `renew` and stacking start. Renewing is open while in grace or lapsed.
- **Return pages**: `/join/$orgSlug/done` and `/join/$orgSlug/cancelled`. "Done" checks the payment status, because the webhook may arrive after the browser does.
- Tests:
  - webhook → membership state machine (unit and DB): duplicate event, out-of-order refund, approval required
  - **Playwright** e2e (already installed in the environment; adding it to CI is noted as D-128): join → stubbed Stripe → member shows good standing
  - a manual test-mode run with a real Stripe test account before release

## Email follow-up (built with E-08)
Tracked in `/roadmap.md` under Deferred as the "E-08 follow-up":
- join/payment confirmation (and receipt, once E-15 exists)
- an application received notice to admins
- approved and declined notices (a decline mentions the refund)
- renewal reminders before expiry, plus grace and lapse notices
- payment failed and refund notices
- invitation emails (today admins copy the link)
- a "claim your record" invite for admin-created members
- a connection problem alert when Stripe verification fails or webhooks stop


## Notes and risks
- New migrations need Lovable to import them. Migrations 0004–0007 are already applied, so they are never edited; changes go in new files.
- `GATEWAY_ENCRYPTION_KEY` must be added as a Lovable Cloud secret before real Stripe connections work. The test gateway needs nothing.
- Webhooks are the source of truth: the browser return page never marks anything paid.
- Card data never touches our servers. Stripe Checkout is hosted (PCI SAQ-A).
