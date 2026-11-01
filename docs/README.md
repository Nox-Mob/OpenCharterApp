# Membership Platform — Planning Docs

> Name: **OpenCharterApp**. An open-source (AGPL), multi-tenant membership management platform for non-profit associations with national organizations and local chapters. Feature set modeled on Tendenci, plus governance, elections, documents, and awards.

## Purpose of these docs

These documents are the shared reference for the whole build. At any point in development they should answer: *what are we building, why, and in what order.* They are deliberately high level. Database design, API design, and UI design come next and will be derived from these.

## Document index

| Doc | What it answers |
|---|---|
| [`README.md`](README.md) | This index, the vision, scope, and how to use the docs |
| [`instructions.md`](instructions.md) | **Start here if you are joining the codebase.** Working rules, commit requirements (tests, docs), and PR checklist |
| [`decisions.md`](decisions.md) | Every decision made so far, with IDs we can cite in tickets |
| [`architecture.md`](architecture.md) | How the system is structured: tiers, tenancy, engines, modules, deployment |
| [`epic.md`](epic.md) | Phased roadmap, epic map, dependencies, and scrum guidance |
| [`setup-engine.md`](setup-engine.md) | The guided setup/configuration engine design |
| [`data-domains.md`](data-domains.md) | Entity inventory by domain, the input to database design |
| [`glossary.md`](glossary.md) | Shared vocabulary |
| [`risks-and-open-questions.md`](risks-and-open-questions.md) | What is still unresolved, and what could hurt us |
| [`testing.md`](testing.md) | How to run checks locally, how CI works, and how database rule tests are built |
| [`demo-data.md`](demo-data.md) | Temporary demo accounts and organizations, and how to remove them |
| [`plans/`](plans/) | Agreed plans for upcoming epics, e.g. [`e12-e13-payments-and-joining.md`](plans/e12-e13-payments-and-joining.md) |

## Vision

One platform where:

- A **local association** can run itself: members, dues, events, donations, board, documents.
- A **national organization** can run many chapters: set the rules, define the board structure, see compliance at a glance, and still let chapters operate independently.
- **Each level collects its own money** into its own Stripe or PayPal account and issues its own receipts.
- **Governance is built in**: required board seats, board reports, elections, document compliance, and award approvals routed to the right people automatically.
- Organizations **configure it to match how they actually work** (custom attributes, custom terms, custom titles) through a guided setup rather than a developer.

## Scope

**In scope:** organizations and chapters, users and roles, custom attributes, membership and dues (prepaid and postpaid, two-level), member lists and exports, governance and board management, elections, document repository, awards, payments and receipts, donations and fundraising, events and registration, corporate memberships, public sites and custom domains, communications, reporting, generic accounting CSV export, platform admin and hosting billing.

**Out of scope (for now):** migration from other systems (CSV bulk-add only), tool-specific accounting formats, a general merchandise store, vendor and inventory tracking, delegate-based national elections, regional approval tier, reply-by-email approvals. Several of these are designed for but not built (see `epic.md` → Future).

## Guiding principles

1. **Configurable, not hard-coded.** Term lengths, tier names, titles, ranks, and approval chains are all org-defined. Examples in conversation (1/3/lifetime, E1–E6) are never assumptions in code.
2. **National sets guardrails, chapters operate within them.** Every national-controllable setting has a clear "inherit / override / locked" behavior.
3. **Each tax entity stands alone.** Money, receipts, and records belong to the org that received them.
4. **Everything important is audited.**
5. **Automate the chase.** The system, not a person, notices vacancies, overdue reports, pending approvals, and expiring memberships.
6. **Self-hostable by design.** Configuration is environment-driven and there is no vendor lock-in, so the hosted service runs the same code as self-hosters. Docker and Compose packaging comes later (backlog item F-11), once there is a working app to package.
7. **Build shared engines once** (attributes, rules, approvals, forms, automations, setup) and reuse them across modules.

## How to use these docs with Scrum

- **Epics** in `epic.md` map one-to-one to backlog epics. Each has an ID (`E-xx`).
- **Decisions** in `decisions.md` have IDs (`D-xxx`). Reference them in stories and acceptance criteria.
- Stories are written when an epic is pulled into planning, not up front.
- When a decision changes, update `decisions.md` and note the superseded ID rather than deleting it.
- Update `risks-and-open-questions.md` at each sprint review.

## Diagram convention

Every diagram (Mermaid or image) is followed by a **"Diagram description"** block that explains in plain prose what the picture shows: the shapes, the groupings, and what each arrow means. The description must be enough for someone who cannot see the picture, or for a tool that cannot interpret it, to understand the structure.

- Write the description when the diagram is created, and update it **in the same change** whenever the diagram changes.
- Describe structure and meaning, not styling. Say what sits above, below, or inside what, and what an arrow means.
- Keep the description factual. Explanatory prose stays in the surrounding text.

## Current status

Built so far: sign-in, organization hierarchy, roles with downward-only permissions, org-defined custom roles and a role assignment screen, audit log, invitations, tax profiles, inherited and locked settings, logos, custom member and chapter fields (chapter fields can be locked by the national), membership levels and terms, and the guided setup engine with its first Membership flow. See `/roadmap.md` for what's left.

### Previous status

Planning complete through v5 of the plan. **Next milestone:** database design, beginning with the "Foundation" and "Membership" domains in `data-domains.md`.
