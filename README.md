# OpenCharterApp

An open-source membership platform for associations that have a **national organization and local chapters**, and for single local groups too. Each organization runs its own members, dues, money and governance, and the national sets the rules its chapters work within.

> Built with [Lovable](https://lovable.dev) on TanStack Start and Lovable Cloud (Postgres, Auth, Storage).
> Continue in the [Lovable editor](https://lovable.dev/projects/a277e9cf-7b39-4b4c-8f66-7fe163d6b7e9) or work locally as described below.

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

Working today:

- sign-in and invitations
- national / chapter hierarchy
- roles, including custom roles with downward-only permissions
- audit log
- settings with locks
- branding and logos
- member and chapter fields
- guided setup
- membership levels and terms

Built and waiting for a database update:

- memberships with standing and recorded payments

Next:

- Stripe payments per organization
- online joining and renewal
- member lists and exports
- receipts

Progress lives in [`roadmap.md`](roadmap.md).

## Install and run

### Prerequisites

- [Bun](https://bun.sh) 1.x. The project uses Bun as its package manager (decision D-104), so don't use npm, Yarn or pnpm.
- Git.
- PostgreSQL 16 or newer, only for running the database rule tests locally.

### Set up

```sh
git clone https://github.com/Nox-Mob/OpenCharterApp.git
cd OpenCharterApp
bun install
```

The committed `.env` holds the Lovable Cloud project's **publishable** settings, which are safe to share. Server-only secrets are never committed. [`.env.example`](.env.example) lists every variable and what it's for.

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
```

`test:db` creates and drops its own throwaway database (`oc_rules_test`), applies every migration and runs `db/tests/*.sql`. **Never point it at the real project database.** Details are in [`docs/testing.md`](docs/testing.md).

### Database changes

- Schema changes are SQL migrations in [`drizzle/migrations`](drizzle/migrations). They follow Lovable's import rules: full grants with row-level security and no dropping tables or columns.
- Lovable applies them to the live database in order. Until it does, screens that need a new migration show "needs a database update" instead of failing.
- The list of migrations waiting to be applied is at the top of [`roadmap.md`](roadmap.md).

### Working with Lovable

- Changes made in Lovable are committed to this repository, and changes merged into `main` sync back to Lovable.
- **Don't rewrite published history**: no force pushes and no rebasing or amending pushed commits. Rewriting history breaks Lovable's project history.
- Keep `main` in a working state, because Lovable builds from it.

## Contributing

Start with [`docs/instructions.md`](docs/instructions.md). It holds the working rules, and [`AGENTS.md`](AGENTS.md) summarizes them for AI assistants. In short:

- every change ships with tests and updated docs
- tenant data is isolated by row-level security
- authorization goes through the policy layer
- decisions are recorded in [`docs/decisions.md`](docs/decisions.md)

## License

AGPL-3.0 (decision D-020): free to self-host. Modified versions offered as a network service must share their source.
