# OpenCharterApp roadmap

Testing by hand: docs/user-testing.md (updated with every feature). Full plan: docs/ (phase IDs map to docs/epic.md). Decisions: docs/decisions.md.

## Pending migrations for Lovable
None. `0000`–`0028` are applied (the `GATEWAY_ENCRYPTION_KEY` secret is set); the last batch was `0026_seat_contacts` and `0027_board_setup_scope_and_demo_rank`, confirmed by Lovable's marker `0028` on 2026-11-02. New migrations are listed here until applied; steps and checks are in docs/lovable-handoff.md. Until a migration is applied, the screens that need it show "needs a database update" or leave the feature out (D-135).

## Done
### November 2026
- [x] Payments return to the app's own address instead of "localhost"; Stripe Checkout gets fresh return links; the return page confirms a Stripe payment directly when the webhook is late or missing (D-158)
- [x] Board setup can change an existing seat's "used by" (0027 applied 2026-11-02) and explains the error before then (D-157)
- [x] Rank is required in new Membership setups and (0027 applied) at Demo National, so the join page asks for it
- [x] Board contact emails (0026 applied 2026-11-02): on the Board page, "Contact email" per seat sets a role email or shows the officer's own email, never both; members see it in "Board and who to contact", including vacant seats that have a role email (D-156)
- [x] Members page for admins covers everyone in the org and every org below it (chapter admins: their chapter), with organization and email, regardless of directory choices; admins no longer get the Directory (D-154)
- [x] "View as member" preview for admins (UI only; the database still applies their real permissions) (D-155)
- [x] Member overview: Actions needed, Your profile (view and edit own fields), Your roles and seats, Board and who to contact (D-153)
- [x] Org page: left-hand menu (Overview, Members (admins) or Directory (members), Board, Reports, Chapters, Settings); admin pages under Settings, Setup moved there (D-152)
- [x] Overview numbers for admins: members, chapters, average per chapter, lifetime vs other, new, pending, renewals due, revenue this year, vacant seats; chapter admins see their chapter, and get Reports for it (D-152, 0024)
- [x] Board seats used by a national *and* every chapter; an existing seat's "Used by" can be changed (D-151, 0024)
- [x] Demo organizations: platform operators create them; chapters inherit the flag; Demo badge; delete with everything in it; never emails; test payments (D-148, 0022)
- [x] E-19: rules engine and pricing rules per term (D-147, 0021)
- [x] E-18: two-level dues (national first, then chapter; two payments and receipts), chapter dues none / optional / required, chapter price range, Membership setup v4 (D-146, 0020)
- [x] E-23: Reports with members by standing, revenue per currency, board vacancies, audited CSV exports (D-145, 0019)
- [x] Setup hub and Board setup (D-143, 0018)
- [x] E-16: chapter creation wizard (D-144)

### Earlier
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

## Open (plan: docs/plans/phases-1-3-review.md)
Phases 1 and 2 meet their exit criteria; Phase 3 doesn't yet. Remaining work, in waves:

**Wave A: Phase 1–2 gaps, then the MVP release v0.1.0** (plan: docs/plans/wave-a-mvp.md; MVP decisions D-169..D-172: no email in the MVP, Playwright, demo data kept for now, v0.1.0)
- [ ] A1 Live Stripe test-mode run on a non-demo test org (connect, join, webhook, refund) (E-12)
- [ ] A2 Playwright end-to-end tests: join → checkout → approval → renewal, Membership setup, Board setup, chapter wizard
- [ ] A3 Transaction CSV export for one org and a national's tree, audited (D-047; E-12, E-23)
- [ ] A4 Suggested levels: a chapter starts from the national's level and chooses Copy or Linked (same price or a set reduction), with an explanation (D-165; E-18)
- [ ] A8 Membership model "national membership with a home chapter" (D-166): one national membership; the member picks one chapter or none (or the national's at-large chapter, e.g. an online chapter) and changes it freely; chapters may bill local dues themselves; the national's choice of model is permanent
- [ ] A5 National standing on the chapter's Members page; national-dues reminder in "Actions needed" (E-18)
- [ ] A6 Pricing step in Membership setup (E-19)
- [ ] A7 Members "everyone" view: chosen fields as columns; cross-chapter export with each chapter's directory rule (E-14)
- [ ] Member overview next items (docs/plans/member-overview.md); view as a specific member (needs a decision)

**Wave B: infrastructure**
- [ ] B1 Un-defer E-08: jobs, scheduled routes, email via `EMAIL_TRANSPORT` (Lovable email or the client's own server, Settings → Email, send-from address) (D-159), signed-in confirmation page for links (D-164)
- [ ] B2 Lapse job and renewal reminders (E-13)

**Wave C: money**
- [ ] C1 E-20 postpaid dues, options as inheritable settings (D-161)
- [ ] C2 E-20 parent orgs invoice subordinate orgs (national fee; D-162, Direct payments only)
- [ ] C3 E-21 PayPal adapter
- E-22 custom domains stay deferred until F-11 and a hosting decision

**Wave D: Phase 3**
- [ ] D1 E-24 approval engine, with board report review as its first consumer
- [ ] D2 E-25 board reports (types, schedules, submit, review, overdue)
- [ ] D3 E-25 vacancy alerts and national oversight dashboard
- [ ] D4 E-26 document repository
- [ ] D5 E-27 elections (each org chooses first past the post or ranked choice, D-167; private choices, own ballot visible until the next election, admins read-only, results after certification, D-163)
- [ ] D6 E-28 automation engine

**Other**
- [ ] Receipt wording reviewed by a CPA (R-07); templates and manual receipts (E-36)

## Deferred (user decision 2026-10-30: core first, automations later)
- [ ] E-07: per-org web addresses (subdomain / `/o/$slug`)
- [ ] E-08: jobs + scheduled worker, automatic emails (incl. invitation emails), signed-action tokens
- [ ] E-13 automated lapse job and renewal reminders (manual/derived standing for now)
- [ ] E-08 follow-up: revisit E-12 / E-13 / E-15 for email once email exists (never send for a demo org: check `public.emails_allowed` / `emailsAllowed`, D-148):
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
- [x] Apply migrations 0017–0022 per docs/lovable-handoff.md (applied 2026-11-02 via marker 0023)
- [x] Apply migration 0024 (applied 2026-11-02 via marker 0025; next fix must be 0026+)
- [x] Smoke checks for 0018–0022 (board setup, reports, two-level dues, pricing rules, demo orgs) added to smoke/live.smoke.test.ts — 89 checks passing
