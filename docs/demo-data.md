# Demo data (temporary)

Test data for trying out the app. **Delete it before launch.** Every demo record uses an ID prefix so it's easy to find and remove.

## Accounts

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

Smoke and end-to-end runs add and then remove their own records (D-150), so counts can change briefly while they run. Some end-to-end specs (`lifecycle`, `levels`) create their own throwaway demo nationals named "E2E National …" or "E2E Levels …" and delete them afterwards; the lifecycle spec also deletes "E2E National …" orgs left over from earlier runs. Until migration 0033 is applied, home-chapter demo nationals can't be deleted, so a few "E2E National …" orgs may be listed for platform operators.

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
