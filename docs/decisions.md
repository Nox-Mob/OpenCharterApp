# Decisions Log

Status key: **Decided** (final for now), **Default** (working assumption, confirm when relevant), **Deferred** (intentionally postponed).

## Technology and delivery

| ID | Decision | Status |
|---|---|---|
| D-001 | Framework: Next.js (App Router) + TypeScript, as a modular monolith | Decided |
| D-002 | Package manager: **npm only** (no Bun) | Decided |
| D-003 | Database: PostgreSQL, with row-level security as a tenant-isolation safety net | Decided |
| D-004 | ORM: Drizzle or Prisma (pick at schema design) | Default |
| D-005 | Auth: Better Auth or Auth.js (pick at Phase 0) | Default |
| D-006 | UI: Tailwind + shadcn/ui. Validation: Zod | Decided |
| D-007 | Background jobs: pg-boss (Postgres-backed) | Decided |
| D-008 | Email: Resend or Postmark with React Email templates | Default |
| D-009 | File storage: S3-compatible (S3, R2, MinIO) | Decided |
| D-010 | Testing: Vitest (unit/integration) + Playwright (end-to-end) | Decided |
| D-011 | Deployment neutrality: configuration is environment-driven with no dependency on one vendor's proprietary features, so self-hosted and hosted installs run the same code. A reverse proxy such as Caddy remains the intended approach for wildcard subdomains and automatic SSL | Decided |
| D-012 | **Docker image, Docker Compose, and reverse-proxy packaging are deferred to the future backlog (F-11).** Packaging is only useful once the app is functional end to end. Early development uses a plain local setup (local Postgres, env vars). F-11 is pulled forward no later than E-22 (custom domains) or E-42 (hosted billing) | Decided |
| D-013 | **Commit rules:** every commit must have passing tests, tests for any new or changed code, and updated root README and supporting documentation (including diagram descriptions). Enforced by pre-commit hooks and CI where possible. See `instructions.md` | Decided |

## Business model and licensing

| ID | Decision | Status |
|---|---|---|
| D-020 | License: **AGPL**. Free to self-host. We sell managed hosting | Decided |
| D-021 | No dual license or CLA for now | Decided |
| D-022 | Hosting pricing: base price per org plus a price per sub-chapter. Member-count pricing may apply past a chapter threshold (e.g., chapters > 5, unless members < ~100). Thresholds are configuration, not code | Default |
| D-023 | Platform meters org count, chapter count, and active members over time | Decided |

## Tenancy and structure

| ID | Decision | Status |
|---|---|---|
| D-030 | Hierarchy: Platform → National → (Region, optional) → Chapter. Platform tier is the installer (self-host) or us (hosted) | Decided |
| D-031 | Every tenant-owned record carries an org ID | Decided |
| D-032 | Permissions inherit downward only, never upward | Decided |
| D-033 | Subdomain is the default chapter address (`chapter.national.org`). Custom chapter domains are optional and configured in settings | Decided |
| D-034 | Data migration from other systems is out of scope. CSV import is for bulk-adding only | Decided |
| D-035 | **Region tier exists in the database from day one.** Region-specific features come later | Decided |
| D-036 | **A person is global to the install.** One account (login identity) can hold memberships and roles in many orgs. Signing up with an org when an account already exists with that email **adds the person to that org** rather than creating a second account | Decided |
| D-037 | **No data crosses orgs.** Profile fields, attributes, settings, and preferences entered for one org are never copied, pre-filled, or offered to another org. Orgs do not see which other orgs a person belongs to. Only the login identity is shared | Decided |
| D-038 | A person who is an admin or officer in several orgs can **switch between them** (org switcher). Each org context shows only that org's data and permissions | Decided |
| D-039 | Duplicate accounts from different emails are accepted. No cross-email merging is attempted (admins may merge manually later) | Decided |
| D-03A | **Branding and logos:** national sets the default logo and brand. A chapter may upload its own logo as an **override**. Resolution falls back chapter → region → national → platform. Receipts, emails, and public pages use the issuing org's resolved branding | Decided |

## Money, receipts, accounting

| ID | Decision | Status |
|---|---|---|
| D-040 | Each org (national and each chapter) collects into its **own** Stripe or PayPal account | Decided |
| D-041 | National may set an **optional** fee/cut on chapter transactions | Decided |
| D-042 | A member owing national and chapter dues **pays twice**, once to each tax entity. No split checkout | Decided |
| D-043 | Gateway abstraction with Stripe and PayPal adapters. Generic store and awards reuse the same connectors | Decided |
| D-044 | Receipts: automatic and manual, customizable templates (inherit from national), immutable once issued, corrections create a new version | Decided |
| D-045 | Each org has a tax profile (legal name, EIN, status). Mostly 501(c)(19), some 501(c)(3). Specific receipt wording deferred | Decided / Deferred |
| D-046 | Dues, donation, ticket, and award-purchase items carry a **tax treatment** field | Decided |
| D-047 | Accounting export: generic transaction CSV only. No tool-specific formats | Decided |
| D-048 | PayPal national-fee mechanism is decided later. Fallback is invoicing the chapter | Deferred |
| D-049 | **Two Stripe modes:** (a) *Connect*, national's account is the Connect platform and chapters are connected accounts, enabling automatic application fees. (b) *Direct*, each org uses its own account with no automatic fee, and national's fee is settled by invoice. The mode is per national and sits behind the gateway abstraction | Decided |

## Membership and dues

| ID | Decision | Status |
|---|---|---|
| D-050 | Each level (national, chapter) defines its own tiers and pricing | Decided |
| D-051 | Term lengths are fully org-defined. "1, 3, lifetime" is only an example | Decided |
| D-052 | Pricing can depend on member attributes (e.g., rank E1–E6 mapped to price bands). Attribute values and mappings are org-defined | Decided |
| D-053 | Prepaid and postpaid dues both supported, per tier or per org | Decided |
| D-054 | Postpaid enforcement (grace days, when standing changes) is set by admins at each level | Decided |
| D-055 | National controls whether chapters may charge separate dues (none / optional with range / required) and can provide locked or suggested tier structures | Decided |
| D-056 | Good standing is derived from membership state. Officers must be in good standing | Decided |

## Custom attributes and setup

| ID | Decision | Status |
|---|---|---|
| D-060 | Organizations define **custom member attributes** (rank, salutation, anything else). Attributes drive pricing, eligibility, and approvals | Decided |
| D-061 | Chapters have attributes too (e.g., charter date), **defined by national**, during setup (preferred) or after | Decided |
| D-062 | A **setup engine** asks guided questions per module and produces configuration (see `setup-engine.md`) | Decided |
| D-063 | Setup is re-runnable and editable after initial setup | Default |
| D-064 | Rules (pricing reductions, eligibility, approver rules) are declarative and built through a UI, not custom code | Default |
| D-065 | **Attribute values are stored as JSONB**, validated against attribute definitions (Zod), with indexes for filtered and sorted attributes | Decided |

## Governance, elections, documents

| ID | Decision | Status |
|---|---|---|
| D-070 | National defines board role templates, required seats, seat counts, term length, and linked permissions | Decided |
| D-071 | Chapters may use custom titles. Underlying role and permissions are unchanged | Decided |
| D-072 | Board seats link to permission sets. Appointment grants access, ending the term revokes it | Decided |
| D-073 | Board reports: national defines types and schedules, chapters submit, national reviews. Overdue reports are chased automatically | Decided |
| D-074 | Elections: admin-visible votes acceptable. Ranked choice is a chapter-level option | Decided |
| D-075 | Document repository per org with versioning, national-defined categories, required types, visibility levels, and change alerts to national | Decided |

## Awards

| ID | Decision | Status |
|---|---|---|
| D-080 | Each award has its own criteria, submission form, approval policy, and purchase options | Decided |
| D-081 | Approval policy is an ordered chain by tier. Approvers may be defined by role, by member rank, or both. Regional level can be added later | Decided |
| D-082 | Routing checks the nominee's chapter, whether the seat can approve, and whether the approver is eligible. The president can confirm an approver's rank, which sets a **"rank verified" flag** for national | Decided |
| D-083 | If no one can or does approve, **national can approve** (e.g., at a board meeting), including batch approval with a meeting date | Decided |
| D-084 | Approval is given via **signed one-click email link** (optionally with a comment) or in-portal. Reply-by-email is not built | Decided |
| D-085 | Approval **outcomes and appeals** (decline, appeal, final) are configured by the org level that defined the award | Decided |
| D-086 | **Payer is configurable**: per award and/or as a form question. Options include submitter, chapter, recipient, or any payer via link. A chapter may be allowed to override the default payer | Decided |
| D-087 | Awards support multiple purchase options and add-ons (e.g., express fee), purchased after approval | Decided |
| D-088 | National manages award shipment for now. Vendor and inventory tracking is scoped for later | Decided |
| D-089 | Awards may belong to a family/series with optional prerequisites (e.g., Bronze → Silver → Gold) | Default |

## Future (scoped, not built)

| ID | Decision | Status |
|---|---|---|
| D-090 | Generic store (merchandise, add-ons) using the same cart and gateway connectors | Deferred |
| D-091 | Vendor and inventory tracking for physical items | Deferred |
| D-092 | Delegate-based national elections | Deferred |
| D-093 | Regional-level approvals and regional tier features | Deferred |
| D-094 | Reply-by-email approvals (inbound email parsing) | Deferred |
| D-095 | Virus scanning for uploaded documents | Deferred |

## Lovable stack adaptation (2026-10-30)

| ID | Decision | Status |
|---|---|---|
| D-100 | Framework: TanStack Start (React 19, Vite) on edge workers. **Supersedes D-001** | Decided |
| D-101 | Database: Postgres with RLS, hosted on Lovable Cloud. Refines D-003 | Decided |
| D-102 | Auth: Lovable Cloud Auth (email/password + Google). **Supersedes D-005** | Decided |
| D-103 | Background jobs: Postgres jobs table + scheduled server routes. **Supersedes D-007** | Decided |
| D-104 | Package manager: bun (Lovable toolchain). Supersedes the npm-only rule in instructions.md | Decided |
| D-105 | Payments: each organization connects its own Stripe account as an org setup step; no platform account | Decided |
| D-106 | Product name: OpenCharterApp | Decided |
| D-107 | Invitations store only a SHA-256 hash of the token. Each one is single-use, expires after 14 days, and only works for the invited email. Accepting requires an explicit button press, never a page load | Decided |
| D-108 | Org settings resolve root → self. An ancestor's `locked` value wins and a database trigger blocks child writes to it. Otherwise the nearest `override` wins, then the registry default | Decided |
| D-109 | The branding bucket is private (workspace blocks public buckets), so logos load through short-lived signed URLs. Logo fallback runs chapter → national. When national turns off `branding.chapter_logo_allowed`, chapters show the top-most logo | Decided |
| D-110 | Columns that define hierarchy or identity (`parent_id`, `type`, `slug`, `org_id`, `user_id`) can't be updated from the client. Column-level grants enforce this | Decided |
| D-111 | E-07 (per-org web addresses) and E-08 (jobs, automatic emails) are deferred until the core membership features are done. Until then, standing is derived on read instead of set by scheduled jobs | Decided |
| D-112 | Attribute values are written only through `set_attribute_value`, which checks permission, scope and type. Removed choices and fields are retired, never deleted, so stored values keep their meaning | Decided |
| D-113 | Setup flows are TypeScript definitions (`src/engines/setup` + module flows). They produce a plan that `apply_setup` applies in one transaction. Re-running updates records by key and never duplicates | Decided |
| D-114 | A top-level organization must keep at least one admin. A chapter may have none, because its parent's admins still manage it | Decided |
| D-115 | CI runs lint, formatting, type checks, unit tests, database rule tests against a throwaway Postgres with a stub of the managed schemas, and a production build, on every push to any branch and on pull requests | Decided |
| D-116 | **Member records (resolves Q-06).** Every new self-signup has an email and an account. Admins may create a member record with no email or login for historical members; it can be claimed later by invitation | Decided |
| D-117 | Membership core first: tiers, memberships, standing and the roster work with admin-recorded payments before Stripe checkout is added | Decided |
| D-118 | Receipts are in-app only in Phase 1 (view and print in the portal). Email delivery comes with E-08 | Decided |
| D-119 | **Custom roles.** An org with `roles.manage` defines roles through `create_role` / `update_role` / `set_role_active` only. They apply to that org and its descendants. Platform roles can't be edited, `org_admin` and `member` are reserved, and role keys are unique across a hierarchy. Nobody can create, edit, assign or invite with a role holding a permission they don't hold at that org. Roles are retired, never deleted, and only once no one holds them and no invitation is pending | Decided |
| D-120 | **Chapter fields.** Only national and region orgs define chapter fields (database trigger). Values are set by anyone with `org.manage` on the chapter, so chapter admins and national admins. Required ones are asked for when a chapter is created. Member-only switches (self-edit, directory) don't apply to them | Decided |
| D-121 | **Locked chapter fields.** A national or region can lock a chapter field (for example Charter date). Then only admins of the org that defined it (`org.manage` there) can set or clear the value; chapter admins see it read-only. Member fields can't be locked. Enforced in `set_attribute_value` | Decided |
| D-122 | **Terms.** A term is a count plus a unit picked from Days / Months / Years, or Lifetime. A term covers through the day before the same date one term later (or that month's last day when the date doesn't exist, e.g. Jan 31 + 1 month → Feb 28). Prices are integer minor units with a currency code (USD for now). Levels and terms are retired, never deleted. Refines D-051 | Decided |
| D-123 | **Parent controls sub-org levels.** A national or region decides whether the orgs below it may create their own membership levels (`membership.child_levels_allowed`, set from Membership setup as a locked setting). The database resolves it from ancestors only, so a chapter can't grant itself the right. National controls over chapter dues amounts stay in E-18 (D-055) | Decided |
| D-124 | Billing timing (prepaid / postpaid) is not stored on levels yet; every level is prepaid until E-20 adds postpaid dues. Join approval stays an org setting (`membership.approval_required`) rather than a per-level flag | Decided |
| D-125 | **Lovable migration conventions.** From migration 0004 on, every tenant table has `org_id uuid not null references public.organizations(id)`, grants SELECT, INSERT, UPDATE and DELETE to `authenticated`, enables RLS, and has policies using `has_permission` / `is_org_member`. Migrations never use DROP TABLE or DROP COLUMN (`alter policy` / `create or replace trigger` instead of drop + create). "Retire, never delete" is enforced by having no DELETE policy, and immutable columns by trigger, instead of narrower grants. Checked in CI by `scripts/migration-rules.ts`. Refines D-110 for new tables | Decided |
| D-126 | **Single-level naming.** When an org offers only one membership level, its name is optional. Left blank, it is saved and shown as "Membership" (key `membership`), so lists and receipts still read well. Once there is more than one level, every level needs a name | Decided |
| D-131 | **Membership model.** One current `memberships` row per member and org (level, term, status pending / active / cancelled / declined, joined_on, paid_through or lifetime), with the history in append-only `membership_events`. All money, however it arrived, is a row in `payments` (gateway manual / stripe / test). Clients only read these tables; every change goes through definer RPCs. Payments are never deleted, not even with their membership. An org records memberships only in its own levels; selling a parent's levels comes with E-18 | Decided |
| D-132 | **Payment permissions.** New `payments.view` and `payments.manage` (seeded to org admins). `members.manage` records, approves, declines and cancels memberships; recording an amount also needs `payments.manage`, so a registrar role can keep the roster without handling money | Decided |
| D-133 | **Term start rules.** A renewal while in good standing or grace starts the day after paid_through (renewing early never loses paid days). A lapsed, cancelled, declined or new member starts on the date paid. An approved application starts on the approval day. Admins may set an earlier start for historical members. Grace days come from `membership.grace_days` resolved through the hierarchy (a locked ancestor wins; default 30) | Decided |
| D-134 | **Claiming a record.** Accepting an invitation to the same email as an admin-created member record without a login links that record to the login (`claimed_at`) instead of creating a second profile. Admins can fix a record's name and email until it is claimed; afterwards the member manages them | Decided |
| D-135 | **Readiness guard for unapplied migrations.** Migrations can be written and merged before Lovable applies them. Lovable regenerates `src/integrations/supabase/types.ts` from the live database, so types for pending migrations live in `src/lib/db/pending-schema.ts` and code that needs them uses its typed `db` client. Screens that need a pending migration check the live database first (`src/lib/db/readiness.ts`, a cheap probe per feature) and show a "needs a database update" notice instead of failing; older queries fall back to the columns that exist. The pending list in `roadmap.md` says what to apply next | Decided |
| D-130 | **Parent-set acceptance of new members.** A national or region decides how its chapters' new members are accepted with `membership.child_approval`: `auto` (accepted automatically), `review` (always reviewed by an admin) or `chapter` (each chapter decides, the default). It is resolved from ancestors only, so a chapter can't decide it for itself, and an `auto` / `review` rule overrides the chapter's own `membership.approval_required`. The national's own approval choice stays separate. In Membership setup v3 the "lock" switch covers only the grace period. Answers saved before v3 keep their meaning (a lock with approval → `review`, without → `auto`). Online joining (E-13b) uses the same rule | Decided |
