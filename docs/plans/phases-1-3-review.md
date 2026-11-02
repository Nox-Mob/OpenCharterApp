# Phases 1–3: epic clearance review and plan

Status on 2026-11-02, after migrations `0000`–`0027` were applied. Sources: `docs/epic.md` (scope and exit criteria), `roadmap.md`, `docs/decisions.md`, the code under `src/` and `drizzle/migrations/`, and the tests under `db/tests/` and `src/**/*.test.ts*`.

**Legend:** ✅ cleared (the outcome in `epic.md` is built and tested) · 🟡 cleared with follow-ups (usable, named gaps) · 🟠 partly built · ⬜ not started.

## 1. Summary

| Phase | Epics | Cleared | With follow-ups | Partly built | Not started | Exit criteria met? |
|---|---|---|---|---|---|---|
| 1 Membership MVP | 7 | 4 | 3 | 0 | 0 | **Yes**, apart from a real Stripe account check (test gateway proven; Stripe test mode not yet checked live) |
| 2 Chapters at scale | 8 | 3 | 2 | 1 | 2 | **Yes for the exit as written** (wizard, officers, own dues, roll-ups); E-20, E-21 and E-22 are open |
| 3 Governance and documents | 5 | 0 | 0 | 1 | 4 | **No**: no board reports, documents, elections or alerts yet |

Two things hold back most of what's left:
1. **E-08 (jobs and email) is deferred (D-111).** Lapse handling, renewal reminders, vacancy alerts, overdue-report chasing, signed approval links (E-24) and the automation engine (E-28) all need it.
2. **No end-to-end (Playwright) tests yet.** `instructions.md` §5 requires them for user-facing flows (sign-up, checkout, approvals, setup, elections). Today these are covered by component tests, database tests and the live smoke suite, but not by a browser test.

## 2. Clearance by epic

### Phase 1: Membership MVP

| Epic | Status | Evidence | Remaining |
|---|---|---|---|
| E-09 Custom attributes | ✅ | 7 types incl. ordered lists, visibility, self-edit, inheritance, chapter fields, locked chapter fields, retire-not-delete (D-060, D-061, D-112, D-121); `60_attributes.sql` | — |
| E-10 Setup engine + Membership flow | 🟡 | Engine, drafts, review with diff, one-transaction `apply_setup`; Membership setup v4; setup hub (D-113, D-143) | Pricing-rules step (E-19 follow-up); setup flows for documents / elections arrive with their epics |
| E-11 Tiers and terms | ✅ | Levels, org-defined terms, lifetime, prices in minor units, tax treatment, parent control (D-126); `90_tiers.sql` | — |
| E-12 Gateway + Stripe | 🟡 | Gateway interface, Stripe adapter (no SDK), sealed per-org keys, webhooks, refunds, test gateway (D-127, D-129); return links to the public address and direct confirmation (D-158) | **Verify a real Stripe test-mode account end to end** (only the test gateway has been run live); generic transaction CSV export (D-047) |
| E-13 Signup and renewals | 🟡 | Join page, approval, decline with refund, renewal with stacking, grace, derived standing (D-130..D-134); `95`, `97` | **Automatic lapse handling and renewal reminders** need E-08 (standing is derived on read, so a lapse already shows correctly; nothing notifies the member) |
| E-14 Lists and exports | ✅ | Filters, expiring 30/60/90, saved views, audited privacy-aware exports, directory with privacy choice, admin view across the tree (D-138, D-139, D-154) | Nice-to-have: chosen fields as columns and cross-chapter export in the "everyone" view |
| E-15 Basic receipts | ✅ | Automatic, numbered, immutable, void / reissue, refunds, print, footer (D-140) | Templates and manual receipts are E-36 (Phase 5); CPA review of wording (R-07) |

**Exit check:** a standalone org can complete setup ✅, sell memberships through Stripe 🟡 (built; live Stripe test-mode run outstanding), renew ✅, see its roster ✅ and export a mailing list ✅.

### Phase 2: Chapters at scale

| Epic | Status | Evidence | Remaining |
|---|---|---|---|
| E-16 Chapter wizard + chapter attributes | ✅ | Wizard with chapter fields, first admin, required-officer invitations (D-144) | — |
| E-17 Board seats and appointments | ✅ | Seats for an org, its chapters or both; custom titles; each org's own terms with by-law history; appointments grant / revoke the seat's role; contact emails; Board setup (D-141..D-143, D-151, D-156, D-157); `9B`, `9D`, `9I`, `9J` | — |
| E-18 Two-level dues + national controls | 🟡 | National-first two payments, chapter dues none / optional / required, price range, "chapters use our levels" (D-146) | **"Suggested" level structures** from the national (D-055: locked *or suggested*); national standing next to chapter standing on the chapter's Members page; linked renewals; national-dues reminder in "Actions needed" |
| E-19 Rules + attribute-based pricing | ✅ | Declarative conditions shared by SQL and TypeScript, pricing per term, quotes (D-147); `9G` | Pricing step in setup; reuse for eligibility and approvers comes with E-24 / E-27 / E-31 |
| E-20 Postpaid dues | ⬜ | Nothing built (no balances, invoices or due dates) | Whole epic (D-053, D-054, Q-15, R-14) |
| E-21 Per-org gateways, PayPal, national fee | 🟠 | Each org connects its own Stripe (Direct mode) | **Stripe Connect mode and the national fee** (D-041, D-049, R-01); **PayPal adapter** (D-043, R-02); fee-by-invoice fallback (D-048) |
| E-22 Custom domains | ⬜ | Nothing built; needs a reverse proxy, so F-11 first; per-org addresses (E-07) are deferred too | Whole epic; recommend keeping it deferred until hosting is decided (R-08, Q-14) |
| E-23 National roll-ups | ✅ | Reports for the org and every org below it (chapter admins: their chapter), overview numbers (D-145, D-152); `9E`, `9I` | Revenue export across chapters with the transaction CSV (D-047) |

**Exit check:** national creates a chapter through the wizard ✅, seats its officers ✅, the chapter collects its own dues ✅, national sees roll-ups ✅.

### Phase 3: Governance and documents

| Epic | Status | Evidence | Remaining |
|---|---|---|---|
| E-24 Approval workflow engine | ⬜ | Membership approval is a single built-in step, not the generic engine | Whole epic: chains, approver resolution (role and/or rank, D-081), escalation, delegation to national (D-083), batch approval, signed links with confirmation page (D-084, Q-07). Needs E-08 for links |
| E-25 Governance compliance | 🟠 | Good standing for officers (D-056); vacancies and terms past their end in Reports and the Overview | **Board reports** (types, schedules, submit, review, D-073); **vacancy alerts** (needs E-08); national **oversight dashboard** that combines vacancies, overdue reports and document compliance |
| E-26 Document repository | ⬜ | — | Whole epic (D-075): libraries, national categories, required types, versions, visibility, change alerts, compliance view; private storage bucket per `architecture.md` §11; virus scanning stays deferred (F-06) |
| E-27 Elections | ⬜ | — | Whole epic (D-074, R-13): positions linked to seats, eligibility (rules engine), nominations, voting windows, single and ranked choice, hybrid entry, certification, auto-appointment into the board, immutable results |
| E-28 Automation engine expansion | ⬜ | No jobs table or scheduled routes yet (D-103 decided, E-08 deferred) | Triggers and schedules from `architecture.md` §10, after E-08 |

**Exit check:** national sees vacancies ✅ (Reports, Overview), overdue reports ⬜ and document changes ⬜ at a glance; a chapter can run an election that seats its new board ⬜.

## 3. Plan

Work in waves. Each item follows the commit rules (tests, docs, migration conventions D-125) and ships its setup flow, audit events and permissions with it (`instructions.md` §7).

### Wave A: close Phase 1–2 gaps that need no new infrastructure (≈ 1–2 sprints)

| # | Item | Epic | Notes |
|---|---|---|---|
| A1 | Live Stripe test-mode run on a non-demo test org: connect, join, webhook, refund, decline with refund | E-12 | Steps in `user-testing.md` §10. Add the outcome to the smoke suite if a Stripe test key can be stored as a CI secret |
| A2 | Playwright end-to-end tests for join → test checkout → approval → renewal, Membership setup, Board setup, chapter wizard | cross-cutting | Chromium is available; run against a local build with a seeded database. Closes the §5 gap |
| A3 | Transaction CSV export (payments, refunds, receiving org, tax treatment), audited, for one org and for a national's tree | E-12, E-23 | D-047; reuse the report-export audit (`log_report_export`) |
| A4 | National-suggested level structures: the national publishes template levels; a chapter adopts one (copy, then edit within the price range) | E-18 | D-055. Needs a decision: copy-on-adopt vs. live link |
| A5 | National standing on the chapter's Members page; national-dues reminder in "Actions needed" | E-18 | Read-only; aggregate through a definer function so chapters don't read the national's roster |
| A6 | Pricing step in Membership setup | E-19, E-10 | Writes `pricing_rules` through `apply_setup` |
| A7 | Members "everyone" view: chosen fields as columns; export across chapters applying each chapter's directory rule per row | E-14 | D-154 follow-up |

### Wave B: infrastructure that unblocks the rest (≈ 2 sprints)

| # | Item | Epic | Notes |
|---|---|---|---|
| B1 | **Un-defer E-08:** jobs table, scheduled server routes (D-103), email provider, templates, signed-action links (single-use, expiring, confirmation page; never change state on GET) | E-08 | Decide Q-05 (sender identity) and the provider. Respect `emails_allowed` for demo orgs (D-148). Then work the email list in `roadmap.md` (Deferred) |
| B2 | Lapse job and renewal reminders | E-13 | First consumer of B1 |

### Wave C: money features (≈ 3–4 sprints, can run in parallel with Wave D)

| # | Item | Epic | Notes |
|---|---|---|---|
| C1 | Postpaid dues: balances, invoices, due dates, delinquency, admin-defined enforcement, manual payment against an invoice | E-20 | D-053, D-054; settle Q-15 (reminder cadence) and R-14 (overall standing with mixed levels) first |
| C2 | Stripe Connect mode with the optional national fee | E-21 | D-049, R-01; national onboarding of connected accounts; Direct mode stays the default |
| C3 | PayPal adapter (direct, no fee split) | E-21 | R-02; the fee falls back to invoicing (D-048) |
| — | Custom domains | E-22 | **Keep deferred** until F-11 and a hosting decision; record it in `epic.md` like E-07 / E-08 |

### Wave D: Phase 3 (≈ 6–8 sprints)

| # | Item | Epic | Notes |
|---|---|---|---|
| D1 | Approval engine, first real consumer: board report review | E-24 + E-25 | "Engines ship with their first real consumer." Generic chains (role and/or rank), escalation to national, batch approval with a meeting date, approve in-portal and by signed link (needs B1). Keep award specifics out (D-081..D-085 are Phase 4) |
| D2 | Board reports: national defines types and schedules, chapters submit, national reviews, overdue tracking | E-25 | D-073; setup flow §6.5 "Board report types and schedules" |
| D3 | Vacancy alerts and the national oversight dashboard (vacancies, overdue reports, document compliance) | E-25 | Alerts need B1; the dashboard extends Reports |
| D4 | Document repository | E-26 | D-075; private bucket under `<org_id>/`, signed URLs (like branding, D-109); review flow through the approval engine; setup flow §6.7 |
| D5 | Elections | E-27 | D-074, R-13; eligibility through the rules engine; certification makes results immutable and appoints through `appoint_officer`; setup flow §6.6 |
| D6 | Automation engine: the `architecture.md` §10 inventory on top of B1 | E-28 | Consolidates the reminders and alerts built in B2, D2, D3 |

### Decisions needed before starting

| For | Question |
|---|---|
| A4 | Suggested level structures: copy-on-adopt or a live link to the national's template? |
| B1 | Email provider and sender identity (Q-05); signed-link confirmation (Q-07, recommended: confirmation page) |
| C1 | Postpaid reminder cadence (Q-15) and how overall standing combines prepaid and postpaid levels (R-14) |
| C2 | Is Connect mode needed for the first national, or is Direct + invoiced fee enough for now? |
| D5 | Ballot secrecy beyond D-074 (admin-visible votes accepted)? Ranked-choice method (instant runoff)? |

## 4. Documentation updates

Done with this review:
- `docs/epic.md`: a status column for Phases 1–3 and a pointer to this plan.
- `roadmap.md`: "Open" now follows the waves above.
- `docs/setup-engine.md` §6.5: three "used by" choices and changing them (D-151, D-157).
- `docs/architecture.md` §14: repository layout matches the real `src/modules` and `src/engines`.

To do as each wave lands (owner: whoever ships the item):
- `README.md` "Where it stands" and `docs/user-testing.md` for every user-facing change.
- `docs/data-domains.md` "Built" markers for new tables (balances, invoices, approvals, reports, documents, elections, jobs).
- `docs/architecture.md` §6 (approval and automation engines), §8 (Connect, PayPal), §10 (automation inventory status), §11 (documents storage), each with its diagram description.
- `docs/glossary.md`: board report, approval chain, ballot, certification, invoice / balance, role email, member view.
- `docs/risks-and-open-questions.md`: close Q-05, Q-07, Q-15 when decided; update R-01, R-02, R-13, R-14.
- `docs/testing.md`: an end-to-end section once A2 lands.
- `docs/instructions.md` §9: CI doesn't yet have the pre-commit hook, coverage gate or docs check it describes. Either add them (small, in Wave A) or mark them as planned so the doc stays true.
