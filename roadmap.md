# OpenCharterApp roadmap

Full plan: docs/ and .lovable/plan/. Phase IDs map to docs/epic.md.

## Pending migrations for Lovable
Apply these in order (Lovable → apply pending migrations). Until a migration is applied, the screens that need it show "needs a database update" instead of failing (D-135).

| Migration | Enables | Status |
|---|---|---|
| `0008_memberships` | E-13a memberships, standing, recorded payments, member records without a login | Waiting (Lovable credit cap) |
| `0009_payments_gateway` | E-12 per-org Stripe / test gateway connections, encrypted credentials, webhook event log. Also needs the Lovable Cloud secret `GATEWAY_ENCRYPTION_KEY` (`openssl rand -base64 32`) | Waiting |
| `0010_joining` | E-13b public join page, checkout, payment completion and refunds, online renewal, decline with refund | Waiting |
| `0011_member_exports` | E-14 audited CSV export (`members.export` permission) and saved views of the member list | Waiting |

## Done
- [x] Step 0: planning docs in /docs, decisions for the Lovable stack recorded (D-100+)
- [x] Demo organization and accounts for testing (docs/demo-data.md). Delete before launch
- [x] E-03: email/password + Google sign-in, password reset, R-15 neutral messages
- [x] E-03: invitations (single-use, 14-day expiry, bound to an email, accepted only on button press), joining an org with an existing account, sign-in redirect back to the invite
- [x] E-04: org hierarchy, create org/chapter, org switcher
- [x] E-04: tax profile per org, org settings (inherit/override/locked, enforced in the database), logo upload with chapter → national fallback
- [x] E-05: roles, permissions, downward-only has_permission, policy module + tests
- [x] E-06: append-only audit log via triggers, viewer tab
- [x] E-05: role assignment screen (add/remove, last-admin protection)
- [x] E-09: custom member fields (7 types, ordered lists, visibility, self-edit, inherited from parent, retire not delete)
- [x] E-09: field editor dialog scrolls with long choice lists (header and Save stay visible, new choices get focus)
- [x] E-05: org-defined custom roles (Roles tab, inherited by chapters, can't grant permissions you don't hold, retire not delete)
- [x] E-09: chapter fields (national/region defines them in a tab and in Membership setup; chapters fill them in on their overview and when created)
- [x] E-09: locked chapter fields (only the national sets them, e.g. Charter date)
- [x] CI runs on every branch and on pull requests
- [x] Migrations 0004–0006 follow Lovable's import rules (full grants + RLS, no drops), checked in CI by `bun run check:migrations`
- [x] E-10: setup card scrolls with long steps (title and Back / Save and continue stay visible)
- [x] E-13b (part): a parent decides how its chapters' new members are accepted (automatically / always reviewed / each chapter decides), Membership setup v3 (D-130)
- [x] E-13a: memberships and standing (good / grace / lapsed, derived on read), admin-recorded joins, renewals and cash/check payments with stacked renewals, applications approve/decline, cancel and rejoin, members without a login that an invitation claims, "Your membership" card (D-131..D-134)
- [x] E-11: an org's only level doesn't need a name; it's shown as "Membership" (D-126)
- [x] E-11: membership levels and terms (Days / Months / Years or Lifetime, prices in cents, tax treatment), Membership levels tab, levels step in Membership setup (v2), parent decides whether chapters create their own levels
- [x] E-10: setup engine (steps, conditions, drafts, review with diff, one-transaction apply) + Membership flow v1
- [x] CI: lint, formatting, types, unit tests, database rule tests, build

## Open — Phase 1
Plan for E-12 / E-13: docs/plans/e12-e13-payments-and-joining.md
- [ ] E-12 (built, waiting for 0009): Payments tab to connect Stripe (key checked, sealed, stored privately) or the demo test gateway, payments list. Remaining: the webhook route and checkout come with E-13b; a "Connect payments" step in guided setup needs the setup page to run more than one flow
- [ ] E-13b (built, waiting for 0008–0010): public join page `/join/<slug>`, Stripe / test checkout, webhook endpoint per org, return page that waits for confirmation, test checkout with accepted / declined / insufficient funds / slow / cancel, online renewal, decline with refund, join link on the Payments tab. Remaining: a Playwright end-to-end test once the database has the migrations
- [ ] E-14 (search and filters work now; export and saved views wait for 0011): search, filters by standing / level / member field ("at least" for ranks), sorting, audited privacy-aware CSV export, saved views. Remaining: member privacy preferences (Q-11), time-to-expiration report
- [ ] E-15 receipts

## Deferred (user decision 2026-10-30: core first, automations later)
- [ ] E-07: per-org web addresses (subdomain / `/o/$slug`)
- [ ] E-08: jobs + scheduled worker, automatic emails (incl. invitation emails), signed-action tokens
- [ ] E-13 automated lapse job and renewal reminders (manual/derived standing for now)
- [ ] E-08 follow-up: revisit E-12 / E-13 / E-15 for email once email exists:
  - join and payment confirmation (with the receipt once E-15 exists)
  - "application received" notice to admins
  - approved and declined notices (a decline mentions the refund)
  - renewal reminders before expiry, plus grace and lapse notices
  - payment failed and refund notices
  - invitation emails (today admins copy the link)
  - "claim your record" invites for admin-created members
  - alerts when a Stripe connection fails verification or webhooks stop arriving

## Cleanup before launch
- [ ] Remove the demo data (steps in docs/demo-data.md)
