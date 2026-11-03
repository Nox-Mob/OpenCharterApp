# Changelog

All notable changes to OpenCharterApp. Versions follow [semantic versioning](https://semver.org) (D-172).

## [0.1.0] (MVP, unreleased)

The first version a national (with chapters) or a standalone association can run on, hosted on Lovable Cloud. The release checklist is in `docs/plans/wave-a-mvp.md` §6. The tag `v0.1.0` is created on `main` after the `BoardUpdates` pull request is merged.

### Organizations and access

- Sign-in with email and password, or Google; password reset; invitations as a copy-a-link.
- National → region → chapter hierarchy, created only through `create_organization`, with a chapter creation wizard.
- Roles, including custom roles. Permissions only flow down. Settings can be inherited, overridden or locked for chapters.
- Every important change goes to an append-only audit log that reads plainly: when, who, what, and each field's previous and current value, one entry per save, for that organization only.
- An account page for your name, sign-in email, password and default organization (opened after signing in; the sidebar dropdown switches organizations, with no separate dashboard page); privacy policy and terms of service pages (placeholder text until the operator replaces it).
- Demo organizations and accounts for testing (`docs/demo-data.md`), clearly badged and never emailed.

### How membership works

- Each national chooses once, when it's created or later in Settings, with both options explained side by side:
  - **separate memberships**, optionally with two-level dues
  - **national membership with a home chapter**, where members pick or change their chapter, or an at-large chapter; settings and setup questions about chapter acceptance, chapter levels and chapter dues are left out, since they don't apply
- Membership levels and terms, with pricing rules by member fields.
- Nationals can suggest levels to chapters, which **copy** them or **link** to them, with a linked price rule.
- Guided setup for membership (now including prices by member fields) and for the board.
- Member fields and chapter fields; branding and logos.

### Members and money

- Memberships and standing (good, grace, lapsed, pending), payments recorded by hand, numbered receipts.
- Joining and renewing online through each org's own Stripe account (direct payments), or a test gateway in demo orgs, with the member returned to the app.
- Members page:
  - filters and saved views
  - columns for member fields
  - audited exports, including a national's view of everyone across its chapters
- In the separate model, chapter admins see each member's national standing, and members are reminded when their national membership needs attention.
- A member directory that respects each member's privacy choice.
- An audited payments export for bookkeeping.
- Import members from a spreadsheet (checked before anything is saved; re-running updates instead of duplicating), and take records off the roster (history kept, restorable).
- A "Share your join page" card on the admin Overview.

### Governance and the org page

- Board seats for an org, its chapters, or both; each org's own terms; appointments that grant and remove the seat's role; a role email or the officer's own email per seat.
- A left-hand menu: Overview, Members or Directory, Board, Reports, Chapters, Settings. Everything that configures the organization is under Settings (including Settings → Board settings for seats, terms, contact emails and titles); the other pages show information or let you act.
- Admins see overview numbers and reports (chapter admins see their chapter only). Members see what they need to do, their profile, chapter, roles and who to contact. Admins can preview the page "as a member".

- Each seat's contact is shown as an address: the seat's role email, or the officer's sign-in email.
- A national's Membership levels page opens with how membership works there (model, approval, grace period, rules for chapters).

### Quality and safety

- Row-level security on every table, and permission checks in every database function the app calls. Reviewed in `docs/security-review.md`.
- Database rule tests, unit and component tests, and end-to-end tests in Chrome (including accessibility checks and about 40 steps of the user-testing guide), run by GitHub on every push and daily against the live demo.
- A sales demo, Test-Demo: 15 chapters, about 500 members with years of history, and a full board.
- A pre-commit hook and a docs check on pull requests.
- Large rosters stay fast: checked at 5,000, 10,000 and 20,000 members, with every heavy read under a second; lists beyond 1,000 rows are read in full.
- Dependencies up to date (TanStack Start 1.169, Vite 8.3, zod 4, ESLint 10, Vitest 5, TypeScript 6.0) with a 24-hour release-age guard; `bun audit` shows only 2 moderate advisories in development tooling. Playwright is pinned at 1.64.1 and its test browser hardened (sandbox on, Chrome stable in CI, other sites blocked).

### Known limits

- **No automatic email yet** (D-169). Invitations are links you copy and send, and there are no reminders. Email is the first update after 0.1.0.
- **Not included yet:**
  - postpaid dues and invoices, so chapters in the home-chapter model can't bill local dues in the app yet
  - PayPal, custom domains, approvals, board reports, documents, elections, automation
  - packaging for self-hosting
- **Receipt tax wording is a placeholder** until a CPA has reviewed it (R-07). Check it with your accountant before relying on it.
