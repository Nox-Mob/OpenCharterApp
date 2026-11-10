# OpenCharterApp

An open-source membership platform for associations that have a **national organization and local chapters**, and for single local groups too. Each organization runs its own members, dues, money and governance, and the national sets the rules its chapters work within.

> Built on TanStack Start (React, SSR) and Supabase (Postgres, Auth, Storage), deployed as a Cloudflare Worker. OpenCharterApp is becoming one of the apps of **OpenAppHub** (one sign-in, organization and billing across the suite, `docs/SHARED-SPEC.md`); it keeps running on its own when self-hosted. Progress: [`docs/MIGRATION-NOTES.md`](docs/MIGRATION-NOTES.md).

## Purpose

Non-profit associations with chapters (veterans' groups, fraternal and professional societies, clubs) usually juggle spreadsheets, a separate payment account per chapter, and a lot of manual chasing. OpenCharterApp gives them one place where:

- a **local association** runs itself: members, dues, events, donations, board and documents
- a **national** runs many chapters: sets the rules, defines the board structure, and sees compliance at a glance, while each chapter still operates on its own
- **each level collects its own money** into its own Stripe account and issues its own receipts
- **governance is built in**: required board seats, reports, elections, document compliance and award approvals
- organizations **configure it to match how they work** through guided setup, not a developer

The full vision, scope and feature map are in [`docs/README.md`](docs/README.md) and [`docs/epic.md`](docs/epic.md).

## Goals

1. **Configurable, not hard-coded.** Membership levels, term lengths, titles, ranks and approval chains are defined by each organization.
2. **National sets guardrails, chapters operate within them.** Every national setting can be inherited, overridden or locked.
3. **Each tax entity stands alone.** Money, receipts and records belong to the organization that received them.
4. **Everything important is audited.**
5. **Automate the chase.** The system, not a person, notices vacancies, overdue reports, pending approvals and expiring memberships.
6. **Self-hostable by design.** The same code serves self-hosters and the hosted service.
7. **Shared engines built once:** attributes, rules, setup, approvals, forms and automations, reused by every module.

### Where it stands

**Next milestone: the MVP release (v0.1.0)**, the first version a real national or standalone association can run on, hosted on Lovable Cloud. It is built, live and checked automatically on every push (CI and the live demo checks). What's left before tagging, and who does it, is in [`docs/plans/release-v0.1.0.md`](docs/plans/release-v0.1.0.md): Lovable applies one migration, and the owner runs a live Stripe test, adds the licence file and does a final pass of the user-testing guide. What's in it: [`CHANGELOG.md`](CHANGELOG.md). Phases 1 and 2 of the [epic map](docs/epic.md) meet their exit criteria; what's left in Phases 1–3 is in [`docs/plans/phases-1-3-review.md`](docs/plans/phases-1-3-review.md).

Working today:

- **Accounts and organizations:** sign-in (email / password, Google), invitations, the national → region → chapter hierarchy, a chapter creation wizard, demo organizations for testing
- **How membership works**, chosen once by each national when it's created (with both options explained side by side) or later in Settings:
  - **separate memberships:** the national and each chapter have their own members, levels and dues, with optional two-level dues
  - **national membership with a home chapter:** one membership at the national, and each member picks their chapter (or an at-large chapter such as an online chapter) and can change it any time
- **Permissions:** roles, including custom roles, with permissions that flow down only; an append-only audit log; settings a national can lock for its chapters
- **Configuration:** guided setup (membership, including prices by member fields, and board), member and chapter fields, membership levels and terms, pricing rules by member fields, levels a national suggests to its chapters (copied, or linked with a price rule), branding and logos
- **Members and money:** memberships and standing, joining and renewing online (Stripe, or a test gateway in demo orgs) with the member returned to the app, payments recorded by hand, numbered receipts, an audited payments export for bookkeeping, member lists with filters, saved views, chosen columns and audited exports (also across a national's chapters), national standing for chapter admins, a member directory with each member's privacy choice
- **Getting started and keeping it tidy:** import members from a spreadsheet (checked before saving), take records off the roster and restore them, share your join page from the Overview, an account page for your name, email, password and the organization that opens after signing in (no separate dashboard: switch organizations from the sidebar), privacy policy and terms pages (operated by OpenAppHub)
- **Audit log:** each change reads "time, who did what", with every field's previous and current value, one entry per save
- **Governance:** board seats (for one org, its chapters, or both), each org's own terms from its by-laws, appointments that grant and remove the seat's role, and a contact for each seat: a role email or the officer's sign-in email
- **The org page:** a left-hand menu (Overview, Members or Directory, Board, Reports, Chapters, Settings); everything that configures the organization, including the board's seats, terms and contact emails, is under Settings, and the other pages show information or let you act
  - admins see overview numbers and reports (chapter admins for their chapter only), and every member of the orgs they manage
  - members see what they need to do, their profile, their chapter, their roles and seats, and who to contact
  - admins can preview the page "as a member"

Not in the MVP: automatic email (the first update after it), postpaid dues and invoices, PayPal, custom domains, approvals, board reports, documents, elections. Progress and what's next: [`roadmap.md`](roadmap.md).

Every migration (up to `0045`) is applied to the live database; none is waiting (see [`roadmap.md`](roadmap.md)). For demos, the demo national **Test-Demo** looks like a real association: 15 chapters, about 500 members with years of history, and a full board ([`docs/demo-data.md`](docs/demo-data.md)). The security, accessibility and performance review is in [`docs/security-review.md`](docs/security-review.md), and a map of every table is in [`docs/tables.md`](docs/tables.md).

## Install and run

### Prerequisites

- [Bun](https://bun.sh) 1.x. The project uses Bun as its package manager (decision D-104), so don't use npm, Yarn or pnpm.
- Git.
- PostgreSQL 16 or newer, only for running the database rule tests locally.
- For the end-to-end tests: Playwright 1.64.1 (pinned) with Chromium (`bunx playwright install chromium`) or Google Chrome (`E2E_BROWSER_CHANNEL=chrome`), and network access to the Supabase backend in `.env.local`. The test browser runs with its sandbox on and may only reach the app and its backend (`docs/testing.md`).

### Set up

```sh
git clone https://github.com/Nox-Mob/OpenCharterApp.git
cd OpenCharterApp
bun install
```

Copy [`.env.example`](.env.example) to `.env.local` (git-ignored) and fill in your Supabase project's URL and publishable key; the file lists every variable and what it's for. No `.env` file is committed (spec §7.1): deployed Workers get their public settings from [`wrangler.jsonc`](wrangler.jsonc) and their secrets from the Worker's settings.

### Run the app

```sh
bun run dev
```

Then open the URL Vite prints. To sign in with test accounts, use the demo users in [`docs/demo-data.md`](docs/demo-data.md). They're temporary and are removed before launch.

### Checks (run before every commit, CI runs the same)

```sh
bun run lint
bun run format:check
bun run typecheck
bun run test                 # unit and component tests (Vitest)
bun run check:migrations     # Lovable's migration rules
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres bun run test:db
bun run build
bun run test:e2e             # end-to-end, in Chromium (needs network; see docs/testing.md)
```

Install the pre-commit hook once per clone with `bun run hooks:install`; it runs the fast checks on every commit. `bun run test:perf` (with `TEST_DATABASE_URL`) times the heavy reads with 5,000, 10,000 and 20,000 members and fails over budget; `bun run test:smoke` checks the backend flows against the live demo.

GitHub runs all of these (D-197): `ci.yml` on every push and pull request, and `live.yml` (the smoke test, then the end-to-end tests against the live demo) on pushes to `main` and `BoardUpdates`, pull requests to `main`, daily and on demand. See [`docs/testing.md`](docs/testing.md).

`test:db` creates and drops its own throwaway database (`oc_rules_test`), applies every migration and runs `db/tests/*.sql`. **Never point it at the real project database.** Details are in [`docs/testing.md`](docs/testing.md). For checking the app by hand, follow [`docs/user-testing.md`](docs/user-testing.md).

### Database changes

- Schema changes are SQL migrations in [`drizzle/migrations`](drizzle/migrations). They follow Lovable's import rules: full grants with row-level security and no dropping tables or columns.
- **Moving off Lovable Cloud (Phase 0, D-211):** [`supabase/migrations`](supabase/migrations) is the single ordered history the new Supabase project is built from (the same files, plus fixes as new migrations). The "Supabase database" workflow rebuilds it on every pull request and deploys it by hand after approval. **`drizzle/` and `drizzle.config.ts` are legacy**: kept only while Lovable still applies `drizzle/migrations`, until the cutover. See [`docs/migration/`](docs/migration/).
- Lovable applies them to the live database in order (and adds a small "confirm" migration of its own when it does). Until a migration is applied, screens that need it show "needs a database update" or leave the feature out instead of failing.
- Migrations waiting to be applied are listed at the top of [`roadmap.md`](roadmap.md), with steps in [`docs/lovable-handoff.md`](docs/lovable-handoff.md). An applied migration is never edited; fixes ship as new migrations.

### Hosting and deploys (spec §10, v2.2)

- The hosted app is a Cloudflare Worker. In [`wrangler.jsonc`](wrangler.jsonc), the **top level is production** (`charter.openapphub.org`, Worker `opencharterapp`) and `env.staging` is staging (`charter-staging.openapphub.org`, Worker `opencharterapp-staging`), each with its public settings.
- **Merging to `main` deploys production** through Cloudflare's Git integration: build `bun run build:hosted`, deploy `npx wrangler deploy --config .output/server/wrangler.json`. Staging: `bun run build:hosted:staging`, then the same deploy command with `--env staging`. There are no deploy workflows and no Cloudflare secrets in GitHub.
- Every rendered page gets security headers from the server entry (`src/server.ts`, `src/lib/security-headers.ts`): `nosniff`, `strict-origin-when-cross-origin`, `X-Frame-Options: DENY` and a CSP allowing only the app, its Supabase project and Google Fonts.
- Server secrets (`SUPABASE_SERVICE_ROLE_KEY`, `GATEWAY_ENCRYPTION_KEY`) are set on each Worker.

### Self-hosting

- `bun run build` builds the self-hosted app from your own `.env` / `.env.local` (copy `.env.example`); it never uses the hosted values in `wrangler.jsonc`. With `VITE_HOSTED=false` (the default) the app keeps its own sign-in and doesn't link to openapphub.org.
- To deploy your own Worker: copy [`wrangler.selfhosted.example.jsonc`](wrangler.selfhosted.example.jsonc) over `wrangler.jsonc`, replace the placeholder values with your project's, run `bun run build`, then `npx wrangler deploy --config .output/server/wrangler.json`, and set the two secrets on the Worker.

### Git history

- **Don't rewrite published history**: no force pushes and no rebasing or amending pushed commits.

## Contributing

Start with [`docs/instructions.md`](docs/instructions.md). It holds the working rules, and [`AGENTS.md`](AGENTS.md) summarizes them for AI assistants. In short:

- every change ships with tests and updated docs
- tenant data is isolated by row-level security
- authorization goes through the policy layer
- decisions are recorded in [`docs/decisions.md`](docs/decisions.md)
- user-facing flows get end-to-end tests (`e2e/`, Playwright)

## License

AGPL-3.0 (decision D-020): free to self-host. Modified versions offered as a network service must share their source.
