# OpenCharterApp roadmap

Full plan: docs/ and .lovable/plan/. Phase IDs map to docs/epic.md.

## Done
- [x] Step 0: planning docs in /docs, Lovable-stack decisions recorded (D-100+)
- [x] E-03 (part): email/password + Google sign-in, password reset, R-15 neutral messages
- [x] E-04 (part): org hierarchy (national/region/chapter/standalone), create org/chapter, org switcher
- [x] E-05 (part): roles, permissions, downward-only has_permission, policy module + tests
- [x] E-06 (part): append-only audit log via triggers, viewer tab

## Open — Phase 0
- [ ] E-03: invitations, joining an org with an existing account
- [ ] E-04: tax profile, org settings (inherit/override/locked), logo upload with fallback
- [ ] E-05: role assignment UI, org-defined roles
- [ ] E-07: subdomain / `/o/$slug` tenant resolution, tenant-isolation tests against RLS
- [ ] E-08: jobs table + scheduled worker, app emails (needs email domain), signed-action tokens

## Open — Phase 1
- [ ] E-09 attributes, E-10 setup engine, E-11 tiers/terms
- [ ] E-12 per-org Stripe connection as a setup step (each org brings its own Stripe account)
- [ ] E-13 signup/renewals, E-14 directory/exports, E-15 receipts
