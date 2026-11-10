# Demo data (staging)

The suite has **one demo and one test account**, the same in OpenAppHub and every app, on staging
(and local development databases) only. OpenAppHub resets them **every 12 hours** (its
`demo-reset` workflow, `hub.reset_suite_demo`), so they're always in the same shape for
screenshots and demonstrations. Sign in through OpenAppHub (hosted, every app sends you there),
or on an app's own sign-in page when self-hosted.

| Account | Password | What it is |
|---|---|---|
| `demo@demo.openapphub.org` (Alex Morgan) | `OpenAppHubDemo2026` | Owner of **Riverside Community Association**, a neighbourhood association with about three months of history in every app |
| `test@demo.openapphub.org` (Test Account) | `OpenAppHubDemo2026` | An active account with no organization and no data, to try everything as a new customer |

In OpenCharterApp (`db/seed/0001_charter_demo.sql`, `charter.demo_fill`), Riverside has:

- About 140 households on the roster: Household ($40), Individual ($25) and Senior ($15) levels, one year each.
- Dues paid by check, card, cash and bank transfer, each with its receipt; most joined or renewed in the last three months. Standing: about 115 good, 10 in grace, 11 lapsed, 4 cancelled.
- Member fields Street and "Wants to volunteer".
- A board of six: Alex Morgan (President), Jordan Lee, Sam Chen, Taylor Brooks, Priya Patel and Marcus Johnson, the same people as in OpenBoardApp.
- Test payments (no real money). It's a demo organization, so it never sends email.

The organization's id is `de000000-0000-4000-8000-0000000000a1`; the accounts are
`de000000-0000-4000-8000-000000000001` (demo) and `…-000000000002` (test). Anything made by
either account is removed at the next reset.

The older Charter-only demo below (Demo National, Test-Demo and the `@opencharter.test` accounts)
is retired: the smoke and end-to-end tests that used it need rewriting for the suite demo.

## Retired: the Charter-only demo

### Accounts

All accounts share the same password: `OpenCharterDemo!2026` (the smoke and end-to-end tests read `SMOKE_DEMO_PASSWORD` if it changes).

| Email | ID | Name | Roles (as of 2026-11-02) |
|---|---|---|---|
| demo-national@opencharter.test | d0000000-…-0001 | Nora National | Organization admin of Demo National Association, with a lifetime Regular membership there. Also has a record and the Member role in Demo Austin (accepted an invitation during testing) |
| demo-chapter@opencharter.test | d0000000-…-0002 | Chris Chapter | Organization admin of Demo Austin Chapter |
| demo-member@opencharter.test | d0000000-…-0003 | Morgan Member | Member role in Demo Austin Chapter, with no membership at the moment; not a member of the national. Use them to try joining and the member view |

All three are platform operators (they can create and delete demo organizations).

## Organizations

| Name | ID | Type | Notes |
|---|---|---|---|
| Demo National Association (`demo-national`) | d1000000-…-0001 | National | Test payments on; levels and seats for its chapters (below) |
| Demo Austin Chapter (`demo-austin`) | d1000000-…-0002 | Chapter | Admin: Chris Chapter |
| Demo Dallas Chapter (`demo-dallas`) | d1000000-…-0003 | Chapter | No admin or members yet |

## How the demo national is set up

- **Membership model:** not chosen yet, so memberships are separate (D-166). Don't choose one on Demo National unless you mean to: the choice is permanent. To try the home-chapter model, create a new demo national (below).
- **Levels:** one level, Regular, with 1 year ($150), 3 years ($250) and Lifetime ($500). Chapters use the national's levels (no chapter levels or chapter dues); national dues aren't required separately.
- **Joining:** new members are accepted automatically (no approval), for the national and its chapters. Grace period: 45 days, locked for chapters.
- **Member fields:** Rank (required since migration 0027, so join pages ask for it), Join date (admins only), Salutation (members can edit).
- **Chapter fields:** Charter date and Chapter number.
- **Board:** six required seats for every chapter: President, Vice-President, Secretary, Treasurer, VP of Awards, VP of Membership.
- **Payments:** the test gateway is connected at the national (no real money).

Smoke and end-to-end runs add and then remove their own records (D-150), so counts can change briefly while they run. Some end-to-end specs (`lifecycle`, `levels`) create their own throwaway demo nationals named "E2E National …" or "E2E Levels …" and delete them afterwards; the lifecycle spec also deletes "E2E National …" orgs left over from earlier runs.

## The sales demo: Test-Demo (D-199)

On staging, **`db/seed/0001_charter_demo.sql`** creates the demo accounts, Demo National with Austin and Dallas, and fills Test-Demo (Nora National as admin) with about 500 people, including 15 pending applications (made-up accounts with no password, waiting for approval). The **Migrate** workflow runs it once with `--seed` on staging; the demo password is the `DEMO_PASSWORD` secret. It refuses production and databases with real organizations. The TypeScript script below does the same from a computer with bun, without the pending applications.

**Test-Demo** (`test-demo`, d60400ef-…) is a demo national set up to look like a real association, for sales demos and for checking screens that need judgement with realistic numbers. It uses the **home-chapter model** (members belong to the national and pick a chapter). Filled on 2026-11-03 by `bun scripts/seed-sales-demo.ts`:

- **15 chapters** in the Southwest and Colorado (Los Alamos is the at-large chapter), each with a charter date.
- **501 people:** 415 current members (40 of them lifetime, 30 on three-year terms, 15 associates), 38 who joined in the last 30 days, about 20 renewing within 30 days, 25 in their grace period, 55 lapsed, 15 who cancelled, and 16 prospects with no membership. Most have years of renewals behind them (up to ten), each with a payment and a receipt: 1,792 payments in all, $13,610 of them this year so far.
- **Member fields:** Rank (E-3 to O-6, required), Branch and Veteran, filled in for everyone. **Levels:** Regular (1 year $45, 3 years $120), Life Member ($600), Associate (1 year $25). Test payments are on, so the join page works.
- **Board:** President, Vice President, Secretary and Treasurer, required for the national and every chapter: all 64 seats are filled by members in good standing.
- Nora National (demo-national) is its admin.

The script refuses to run on an organization that already has members, and works only on demo organizations in the home-chapter model (`--org <id>` seeds another one). The smoke and end-to-end tests never touch Test-Demo.

## Creating your own demo organizations (D-148)

Platform operators can mark a new national or standalone org as a demo when creating it ("This is a demo organization" in the create dialog). Its chapters are demo too. A demo org:
- shows a **Demo** badge everywhere it appears
- can use test payments
- never sends email (once email exists, E-08)
- can be deleted with everything in it: Settings → General → "Delete this demo organization", then type its name. People's accounts stay; one audit event records the deletion.

The flag can't be changed after creation, in either direction.

**Platform operators** are listed in `private.platform_operators` (not reachable through the API). Migration 0022 adds the three demo accounts. To add someone, as the database owner:

```sql
insert into private.platform_operators (user_id)
  select id from auth.users where lower(email) = 'qa-person@example.org'
on conflict do nothing;
```

To remove someone, delete their row. At launch, remove the demo accounts from this list.

## Cleanup

The demo data stays through the MVP (D-171) and is removed before a second real national is onboarded.

Run these steps in order.

1. Switch off the smoke-test cleanup: add a migration that replaces `public.purge_smoke_data` with a function that only raises "smoke cleanup is disabled" (D-150), and stop running `bun run test:smoke` against production.
2. Delete every demo organization. For each top-level demo org (`select id, name from public.organizations where is_demo and parent_id is null`), sign in as an operator, open it, and go to Settings → General → "Delete this demo organization". This removes its chapters and data, and its logos. Steps 3–5 below are only needed if you'd rather clean up by hand, or before migration 0022.
   Then empty `private.platform_operators` of the demo accounts.
3. Delete the files under `branding/d1000000-*` in storage.
4. Delete the rows in `seat_title_overrides` and `seat_templates` (their `seat_terms` and `appointments` go with them), `receipt_counters` (receipts go with their payments), `member_segments`, `webhook_events` and `gateway_connections`, and in `private.gateway_secrets` (as the database owner), then the rows in `payments` (they are kept even when a membership goes), then `memberships` (their `membership_events` go with them), then `tier_terms`, `membership_tiers`, `attribute_values`, `attribute_options`, `attribute_definitions`, `setup_states`, `org_settings`, `tax_profiles`, `invitations`, `role_assignments` and `org_member_profiles` whose `org_id` starts with `d1000000-`.
5. Delete the chapters, then the national. Parents are protected while they still have children.
6. Delete the `auth.users` rows whose `id` starts with `d0000000-`.
7. Audit events stay in the log by design (the log is append-only). Add a note in the risks doc if you want them purged too.

Note: smoke runs delete their own rows (D-150), including receipts, so receipt numbers in the demo orgs can skip. That's expected for demo data only.
