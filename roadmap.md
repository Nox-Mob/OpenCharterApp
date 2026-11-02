# OpenCharterApp roadmap

Testing by hand: docs/user-testing.md (updated with every feature).

Full plan: docs/ and .lovable/plan/. Phase IDs map to docs/epic.md.

## Pending migrations for Lovable
Apply these in order (Lovable → apply pending migrations). Step-by-step instructions, checks and the smoke test: docs/lovable-handoff.md. Until a migration is applied, the screens that need it show "needs a database update" instead of failing (D-135).

| Migration | Enables | Status |
|---|---|---|
| `0008_memberships` | E-13a memberships, standing, recorded payments, member records without a login | Applied 2026-11-01 (smoke-tested: `bun run test:smoke`) |
| `0009_payments_gateway` | E-12 per-org Stripe / test gateway connections, encrypted credentials, webhook event log. Also needs the Lovable Cloud secret `GATEWAY_ENCRYPTION_KEY` (`openssl rand -base64 32`) | Applied 2026-11-01 (smoke-tested: `bun run test:smoke`) |
| `0010_joining` | E-13b public join page, checkout, payment completion and refunds, online renewal, decline with refund | Applied 2026-11-01 (smoke-tested: `bun run test:smoke`) |
| `0011_member_exports` | E-14 audited CSV export (`members.export` permission) and saved views of the member list | Applied 2026-11-01 (smoke-tested: `bun run test:smoke`) |
| `0012_member_privacy` | E-14 member directory, each member's directory choice, export privacy rule from the parent | Applied 2026-11-01 (smoke-tested: `bun run test:smoke`) |
| `0013_receipts` | E-15 automatic, numbered, immutable receipts; void / reissue; refund handling; receipts for payments recorded earlier | Applied 2026-11-01 (smoke-tested: `bun run test:smoke`) |
| `0014_board_seats` | E-17 board seats, each org's own seat terms with by-law history, appointments that grant and revoke the seat's role, `governance.manage` / `governance.define` permissions | Applied 2026-11-01 (smoke-tested: `bun run test:smoke`) |
| `0015_confirm_0008_0014_applied` | Added by Lovable to trigger the apply (a table comment only) | Applied 2026-11-01 |
| `0016_purge_smoke_data` | Added by Lovable: `purge_smoke_data` cleans up after a live smoke run in the demo orgs (D-150) | Applied 2026-11-01 |
| `0017_purge_audit_summary` | The purge records one summary audit event with what it removed; restores the `seat_templates` comment | Waiting |
| `0018_setup_governance` | Board setup: `apply_setup` learns the `seats` and `seat_terms` sections; `apply_setup_sections()` for the readiness check | Waiting |
| `0019_rollups` | E-23 Reports tab: member, revenue and board roll-ups across a national's chapters (aggregates only), audited report exports | Waiting |
| `0020_two_level_dues` | E-18 national dues required for chapter members (two payments, national first), chapter dues none / optional / required, chapter price range | Waiting |

## Done
- [x] E-12: Payments tab to connect Stripe (key checked, sealed, stored privately) or the demo test gateway, payments list, webhook route (applied 2026-11-01)
- [x] E-13b: public join page `/join/<slug>`, Stripe / test checkout, webhook endpoint per org, return page, test checkout outcomes, online renewal, decline with refund (applied 2026-11-01; covered by `bun run test:smoke`)
- [x] E-14: search, filters, "expiring within 30 / 60 / 90 days", sorting, audited privacy-aware CSV export, saved views, member directory with each member's own listing choice (D-138, D-139)
- [x] E-15: automatic, numbered, immutable receipts with void / reissue versions, refunds, printable receipt page, receipt links, footer setting (D-140)
- [x] E-17: Board tab, seats from the org and its parents, custom titles, Vacant badges, appoint / end with good-standing and no-escalation checks, seat roles granted and revoked, each org's own seat terms with by-law history (D-141, D-142)
- [x] Live smoke test against the real backend (`bun run test:smoke`, added by Lovable) with automatic cleanup (D-150)
- [x] User testing guide for checking the app by hand (docs/user-testing.md)
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
- [x] E-16: chapter creation wizard (name and type, chapter fields, first admin invitation, invitations for the required officers, links to copy; seats show Vacant until appointed) (D-144)
- [ ] E-18 (built, waiting for 0020): two-level dues: the national can require its own membership for chapter members (join page step 1 of 2 → national, step 2 → chapter; two payments and receipts), chapter dues none / optional / required, a price range for chapter terms, Membership setup v4 for parents (D-146). Remaining: national standing next to chapter standing in the chapter's Members tab, linked renewals
- [ ] E-23 (built, waiting for 0019): Reports tab for nationals and regions with members by standing (standing bar, new, expiring 30 / 60 / 90), revenue per currency for a date range, board vacancies and terms past their end, audited CSV exports (D-145)
- [ ] Setup hub and Board setup (built, waiting for 0018; the Membership and "Connect payments" cards work now): a card per setup flow, `?flow=board`, seats / officer rules / terms from your by-laws (D-143)
- [ ] Phase 1 follow-ups: receipt wording reviewed by a CPA (R-07); templates and manual receipts (E-36); elections (E-27) and vacancy alerts (E-25)

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
