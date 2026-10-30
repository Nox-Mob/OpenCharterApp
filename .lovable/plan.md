# Plan: Membership Platform — Phase 0 + Phase 1 MVP

The design rules from your docs stay the same. The tech changes to fit Lovable: TanStack Start + Lovable Cloud instead of Next.js, self-run Postgres, pg-boss, and Better Auth. Built in sprint-sized steps. Each step ships tests and updates the docs (instructions.md §3).

## Step 0 — Docs and decisions
- Copy the 9 planning docs into `/docs`. Link them from the root README and AGENTS.md.
- Add superseding decisions to `decisions.md`:
  - D-001 → TanStack Start
  - D-003 stays Postgres + RLS (on Cloud)
  - D-005 → Cloud Auth
  - D-007 → database queue + scheduled server routes
  - npm-only → bun, because the Lovable toolchain needs it
- Note in `risks-and-open-questions.md` how this affects self-hosting (principle 6).

## Step 1 — Phase 0 Foundation (E-01, E-03 to E-08)
- **E-01:** Lint, typecheck, and Vitest scripts. Zod at every boundary. Strict TS. `.env.example`.
- **E-03 Identity:** Email/password sign-in, email verification, password reset with a `/reset-password` page, and invitations. Responses never reveal whether an account exists (R-15). A person is a global login only (D-036). Each org gets its own `org_member_profiles` (D-037). Org switcher.
- **E-04 Org hierarchy:**
  - `organizations` (type standalone/national/region/chapter, parent, slug, branding, timezone), with a path column for "org and descendants".
  - `tax_profiles`, and `org_settings` with inherit/override/locked modes.
  - Logo upload to storage, with fallback chapter → national → platform.
- **E-05 RBAC:**
  - Tables: `roles`, `permissions`, `role_assignments` (person, role, org node, source).
  - Security-definer `has_permission(user, perm, org)` checks ancestor orgs, so permissions inherit downward only (D-032).
  - One policy-layer module used by every server function.
- **E-06 Audit:** Append-only `audit_events` written by triggers plus app hooks, with a viewer page.
- **E-07 Tenant context:** The org is resolved per request from the subdomain when present, otherwise from a `/o/$orgSlug` path. That path is needed because the preview has no wildcard subdomains. Tenant-isolation tests run against RLS.
- **E-08 Jobs/email:**
  - `jobs` table plus a cron-hit server route as the worker.
  - Lovable email for templates.
  - Signed-action tokens: single-use, expiring, bound to a person and a target, and they change state only on POST.

Exit: a national and a chapter exist, a chapter admin sees only their chapter, and every action is audited.

## Step 2 — Phase 1 Membership MVP (E-09 to E-15)
- **E-09 Attributes:** `attribute_definitions`, `attribute_options` (ordered, for ranks), and typed `attribute_values`. Includes an admin UI.
- **E-10 Setup engine:** A reusable flow framework (steps, Zod-validated answers, preview, apply as a transaction). The first flow covers members, attributes, tiers, and dues.
- **E-11 Tiers/terms:** `membership_tiers`, `term_options` (fully org-defined), and `dues_policies` (grace days).
- **E-12 Payments:**
  - A gateway interface with a Stripe adapter, using a Stripe Connect account per org so each org collects its own money.
  - `payments`, `payment_line_items`, and `refunds`.
  - A webhook at `/api/public/stripe` that checks the signature.
- **E-13 Signup/renewals:**
  - Public join page per org, optional approval step, and renewals.
  - Standing is worked out from paid-through date plus grace.
  - A scheduled job handles lapses.
- **E-14 Directory:** Roster with standing and time to expiration, filters, saved segments, and privacy-aware CSV export.
- **E-15 Receipts:** Auto receipt on payment from a default versioned template, plus receipt history. Receipts are numbered per org.

Exit: a standalone org completes setup, sells and renews memberships through Stripe, sees its roster, and exports a mailing list.

## Design direction
A civic, trustworthy look: deep ink-green primary, a warm paper background, serif display headings with a clean sans for body text, and dense admin tables. Everything uses semantic tokens with dark mode.

## Technical details
- Every tenant table has `org_id`, GRANTs, RLS through `has_permission` / org-membership helpers, and code-level policy checks too.
- Folders: `src/modules/<domain>/` (each with a public `index.ts`), `src/engines/` (attributes, setup, rules), `src/lib/policy/`.
- Signed-in pages live under `_authenticated/`. Public join and org pages are SSR routes.
- Tests:
  - Policy and permission inheritance
  - Standing calculation
  - Setup apply
  - Token single-use behavior
  - Webhook signature checks
  - Cross-org isolation
- To enable: Lovable Cloud, email auth, Stripe (via the Lovable Stripe integration, needs your keys later), and the email domain.

## Open items to confirm during build
- Product name (still TBD).
- Stripe Connect vs. a single account for the first MVP demo.
