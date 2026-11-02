# Wave A and the MVP release

Status, 2026-11-02: **Sprint 1 done** (A2, A3, A8; migrations 0029–0031 applied). Sprint 2 (A4, A5) is next. Builds on `docs/plans/phases-1-3-review.md` (Wave A items A1–A8); decisions D-169..D-176.

## 1. Goal

Release the `BoardUpdates` branch as the **OpenCharterApp MVP (v0.1.0)**: the first version a real national (or a standalone association) can run on, hosted on Lovable Cloud.

**The MVP is done when** a national can:
1. set itself up (membership model, levels, fields, board)
2. create chapters and seat their officers
3. sell and renew memberships online through its own Stripe account, with receipts
4. see its members across chapters, reports and an overview
5. let members join, renew, pick their chapter and see what they need to do

And when we can show it's safe:
- every flow above has an end-to-end test
- the security review is done
- the release checklist (§6) is complete

## 2. Scope

**In the MVP:** everything built so far (Phases 1–2 minus E-20 / E-21 PayPal / E-22), plus Wave A (A1–A8) and the release hardening in §5.

**Not in the MVP** (later waves, `phases-1-3-review.md` §3):
- automatic email: Wave B. Invitations stay copy-a-link, and there are no reminders.
- postpaid dues and invoices: E-20, Wave C. So in the home-chapter model, **chapters can't bill local dues in the app yet** (D-166 rule 4 arrives with E-20).
- PayPal, custom domains, approvals, board reports, documents, elections, automation.
- packaging for self-hosting (F-11). The MVP runs on Lovable Cloud; the Docker / hosted-Supabase install (D-160) follows.

## 3. Decisions for the MVP (settled 2026-11-02 as D-169..D-172)

| # | Question | Decision (as recommended) |
|---|---|---|
| M1 | Ship the MVP without automatic email (copy-a-link invitations, no reminders), or pull a minimal B1 (invitations and payment confirmations only) into the MVP? | Ship without; announce email as the first update. It keeps the MVP to about 3 sprints (D-169) |
| M2 | Add Playwright as a dev dependency for end-to-end tests (`instructions.md` §10 asks for a decision before adding dependencies) | Yes, `@playwright/test`, Chromium only, run in CI on pull requests to `main` (D-170) |
| M3 | Demo organizations and accounts in the MVP database: keep them (clearly badged, for training) or remove them at release (`docs/demo-data.md` cleanup)? | Keep the demo national for now (it's isolated, never emails, D-148); remove before onboarding a second real national (D-171) |
| M4 | Version and release notes | `0.1.0` in `package.json`, a `CHANGELOG.md`, and a `v0.1.0` tag on `main` (D-172) |

## 4. Wave A items

Sizes: S ≈ 1–2 days, M ≈ 3–5 days, L ≈ 1–2 weeks. Every item follows the commit rules: tests, docs, migration conventions (D-125), audit events, permissions through the policy layer.

### A8 Membership model: national membership with a home chapter: ✅ done in Sprint 1
Built as planned, with two changes: chapter admins see their members through the chapter's own member records (each standing for the national membership) rather than a separate `chapter_affiliates` function, and the model is also chosen when a national is created. Details: D-174, D-176; migration 0030; tests `db/tests/9L_home_chapter.sql`; user steps `user-testing.md` §13b. End-to-end specs for joining with a chapter and changing it are still to add.

### A4 Suggested levels: Copy or Linked (M)
Design in `phases-1-3-review.md` §5 (D-165).
- **Migration:** `suggested` on a level; on a chapter's level, `source_tier_id`, `link_mode` and the price rule.
- **RPCs:** `adopt_suggested_level`, `make_level_own`; linked levels update when the national changes or retires its level.
- **UI:**
  - a "Suggest to chapters" switch on the national's levels
  - "Start from a suggested level" on the chapter's levels, with both choices explained side by side
- **Separate-model only:** in the home-chapter model, chapters have no membership levels.
- **Tests:** price rules (same, amount off, percent off, kept within the range, rounding); changes reach linked levels but not copies; retirement; permissions; isolation.

### A5 National standing for chapters (S)
- In the separate model, a chapter's Members page shows each member's national standing next to the chapter one, through a definer function that returns standing only.
- "Actions needed" reminds a chapter member when the national membership they need is missing or lapsed.

### A6 Pricing step in Membership setup (S–M)
- An optional step: rules per term (same rule builder as the levels page), applied through `apply_setup` as a `pricing_rules` section.
- Tests: setup tests plus a database test that re-applying doesn't duplicate rules.

### A3 Transaction CSV export: ✅ done in Sprint 1
Settings → Payments → "Export payments" (D-173; migration 0029; `db/tests/9K_payments_export.sql`). Emails only for exporters who may see members; the database audits every export.

### A7 Members "everyone" view (S–M)
- A column picker for member fields (saved per viewer in the browser).
- Export across chapters, applying each chapter's directory rule per row (D-139). It resolves each org's rule the way `privacyRulesQuery` does today, so nobody opted out slips through.

### A2 End-to-end tests: ✅ harness done in Sprint 1, specs grow with each item
Playwright in Chromium against the live demo backend (D-170, D-175); `bun run test:e2e`; CI on pull requests to `main`. Covered so far: the menu by role and "View as member", members across chapters, the board's contact-email choice, Settings → Setup, the join page's required questions, and joining with the test gateway (against a deployed site). Still to add: renewal, Membership and Board setup applied, the chapter wizard, appointing an officer, A8 join with a chapter and change chapter, A3 export, A4 and A5 as they land. See `docs/testing.md`.

### A1 Live Stripe test-mode check (S, needs a Stripe test account)
- On a non-demo test org: connect a test key and webhook, then join, return, refund, and decline with refund. Covered by `user-testing.md` §10.
- If a Stripe test key can be stored as a CI secret, add a smoke step for it.

## 5. Release hardening (in parallel, mostly Sprint 3)

| # | Item | Size |
|---|---|---|
| R1 | Security review before the first production release (`risks-and-open-questions.md` §4): tenant isolation (RLS on every table, definer functions' permission checks), credential storage (`private` schema, sealed secrets), return links (D-158), exports and audit. Record findings and fixes | M |
| R2 | Accessibility pass to WCAG 2.1 AA (Q-16): keyboard paths through join, checkout, setup, Members, Board; labels; contrast in both themes | S–M |
| R3 | `instructions.md` §9 gaps: add the pre-commit hook (lint-staged: lint, format, related tests) and a lightweight docs check in CI, or mark them as planned in the doc | S |
| R4 | Receipt wording: CPA review (R-07). If it isn't done by release, ship with the current placeholder wording and say so in the release notes | — (external) |
| R5 | Release docs: README (what the MVP does, how to run it), `CHANGELOG.md`, `docs/user-testing.md` pass, Lovable hand-off for any pending migrations | S |
| R6 | Performance check with a large roster (5,000 members across 20 chapters): Members "everyone" view, overview, reports, exports | S |
| R7 | Error monitoring: confirm Lovable's error reporting is on, and that failed payments / webhooks are visible to admins | S |

## 6. Release checklist

1. All Wave A items merged on `BoardUpdates`; CI green (lint, format, types, unit, database rules, migration conventions, build, end-to-end).
2. Lovable has applied every pending migration; `bun run test:smoke` passes against the live backend.
3. Full pass of `docs/user-testing.md` as National, Chapter and Member, on desktop and phone width.
4. Security review (R1) signed off; accessibility pass (R2) done.
5. Decisions M1–M4 recorded in `decisions.md` (done: D-169..D-172).
6. `package.json` version `0.1.0`, `CHANGELOG.md`, README "Where it stands" updated.
7. Pull request `BoardUpdates` → `main` with the checklist from `instructions.md` §8; reviewed and merged (no force-push; Lovable syncs from `main`).
8. Tag `v0.1.0` and publish release notes, listing what's not in the MVP (§2).

## 7. Sequence (about 3 sprints of 2 weeks)

| Sprint | Work |
|---|---|
| 1 ✅ | A2 end-to-end harness and first flows; A8 in full, including choosing the model when a national is created; A3 |
| 2 | A4; A5; end-to-end tests for them |
| 3 | A6; A7; A1 live Stripe check; R1–R7; release checklist and v0.1.0 |

**Risks to the plan:**
- **End-to-end tests run against the live demo backend** (like `bun run test:smoke`): a feature whose migration Lovable hasn't applied yet can only be tested end to end after it is applied.
- **R1 may turn up fixes:** keep Sprint 3 light for that.
