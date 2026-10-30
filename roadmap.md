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

## Open — Phase 0
- [ ] E-05: role assignment UI, org-defined roles

## Open — Phase 1
- [ ] E-09 attributes, E-10 setup engine, E-11 tiers/terms
- [ ] E-12 per-org Stripe connection as a setup step (each org brings its own Stripe account)
- [ ] E-13 signup/renewals, E-14 directory/exports, E-15 receipts

## Deferred (user decision 2026-10-30: core first, automations later)
- [ ] E-07: per-org web addresses (subdomain / `/o/$slug`)
- [ ] E-08: jobs + scheduled worker, automatic emails (incl. invitation emails), signed-action tokens
- [ ] E-13 automated lapse job and renewal reminders (manual/derived standing for now)

## Cleanup before launch
- [ ] Remove the demo data (steps in docs/demo-data.md)
