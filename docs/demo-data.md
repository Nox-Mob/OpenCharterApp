# Demo data (temporary)

Test data for trying out the app. **Delete it before launch.** Every demo record uses an ID prefix so it's easy to find and remove.

## Accounts

All accounts share the same password: `OpenCharterDemo!2026`

| Email | ID | Role |
|---|---|---|
| demo-national@opencharter.test | d0000000-…-0001 | Org admin of Demo National Association. Also a member of the Austin chapter, because it accepted an invitation during testing |
| demo-chapter@opencharter.test | d0000000-…-0002 | Org admin of Demo Austin Chapter |
| demo-member@opencharter.test | d0000000-…-0003 | Member and Org admin of Demo Austin Chapter (promoted during role-screen testing) |

## Organizations

| Name | ID | Type |
|---|---|---|
| Demo National Association (`demo-national`) | d1000000-…-0001 | National |
| Demo Austin Chapter (`demo-austin`) | d1000000-…-0002 | Chapter |
| Demo Dallas Chapter (`demo-dallas`) | d1000000-…-0003 | Chapter, no admin yet |

## Creating your own demo organizations (D-148)

Platform operators can mark a new national or standalone org as a demo when creating it ("This is a demo organization" in the create dialog). Its chapters are demo too. A demo org:
- shows a **Demo** badge everywhere it appears
- can use test payments
- never sends email (once email exists, E-08)
- can be deleted with everything in it: Settings tab → "Delete this demo organization", then type its name. People's accounts stay; one audit event records the deletion.

The flag can't be changed after creation, in either direction.

**Platform operators** are listed in `private.platform_operators` (not reachable through the API). Migration 0022 adds the three demo accounts. To add someone, as the database owner:

```sql
insert into private.platform_operators (user_id)
  select id from auth.users where lower(email) = 'qa-person@example.org'
on conflict do nothing;
```

To remove someone, delete their row. At launch, remove the demo accounts from this list.

## Configuration created during testing

- The national ran Membership setup. It adds the Rank and Join date member fields, requires approval, sets a 45-day grace period, and locks joining rules for chapters.
- Morgan Member has Rank E-4 and Join date 2024-05-01.

## Cleanup

Run these steps in order.

1. Switch off the smoke-test cleanup: add a migration that replaces `public.purge_smoke_data` with a function that only raises "smoke cleanup is disabled" (D-150), and stop running `bun run test:smoke` against production.
2. Delete every demo organization. For each top-level demo org (`select id, name from public.organizations where is_demo and parent_id is null`), sign in as an operator, open it, and go to Settings → "Delete this demo organization". This removes its chapters and data, and its logos. Steps 3–5 below are only needed if you'd rather clean up by hand, or before migration 0022.
   Then empty `private.platform_operators` of the demo accounts.
3. Delete the files under `branding/d1000000-*` in storage.
4. Delete the rows in `seat_title_overrides` and `seat_templates` (their `seat_terms` and `appointments` go with them), `receipt_counters` (receipts go with their payments), `member_segments`, `webhook_events` and `gateway_connections`, and in `private.gateway_secrets` (as the database owner), then the rows in `payments` (they are kept even when a membership goes), then `memberships` (their `membership_events` go with them), then `tier_terms`, `membership_tiers`, `attribute_values`, `attribute_options`, `attribute_definitions`, `setup_states`, `org_settings`, `tax_profiles`, `invitations`, `role_assignments` and `org_member_profiles` whose `org_id` starts with `d1000000-`.
5. Delete the chapters, then the national. Parents are protected while they still have children.
6. Delete the `auth.users` rows whose `id` starts with `d0000000-`.
7. Audit events stay in the log by design (the log is append-only). Add a note in the risks doc if you want them purged too.

Note: smoke runs delete their own rows (D-150), including receipts, so receipt numbers in the demo orgs can skip. That's expected for demo data only.
