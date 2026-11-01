# OpenCharterApp roadmap

Full plan: docs/ and .lovable/plan/. Phase IDs map to docs/epic.md.

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
- [x] E-10: setup card scrolls with long steps (title and Back / Save and continue stay visible)
- [x] E-11: membership levels and terms (Days / Months / Years or Lifetime, prices in cents, tax treatment), Membership levels tab, levels step in Membership setup (v2), parent decides whether chapters create their own levels
- [x] E-10: setup engine (steps, conditions, drafts, review with diff, one-transaction apply) + Membership flow v1
- [x] CI: lint, formatting, types, unit tests, database rule tests, build

## Open — Phase 1
- [ ] E-12 per-org Stripe connection as a setup step (each org brings its own Stripe account)
- [ ] E-13 signup/renewals, E-14 directory/exports, E-15 receipts

## Deferred (user decision 2026-10-30: core first, automations later)
- [ ] E-07: per-org web addresses (subdomain / `/o/$slug`)
- [ ] E-08: jobs + scheduled worker, automatic emails (incl. invitation emails), signed-action tokens
- [ ] E-13 automated lapse job and renewal reminders (manual/derived standing for now)

## Cleanup before launch
- [ ] Remove the demo data (steps in docs/demo-data.md)
