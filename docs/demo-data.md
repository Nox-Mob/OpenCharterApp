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

## Configuration created during testing

- The national ran Membership setup. It adds the Rank and Join date member fields, requires approval, sets a 45-day grace period, and locks joining rules for chapters.
- Morgan Member has Rank E-4 and Join date 2024-05-01.

## Cleanup

Run these steps in order.

1. Delete the files under `branding/d1000000-*` in storage.
2. Delete the rows in `receipt_counters` (receipts go with their payments), `member_segments`, `webhook_events` and `gateway_connections`, and in `private.gateway_secrets` (as the database owner), then the rows in `payments` (they are kept even when a membership goes), then `memberships` (their `membership_events` go with them), then `tier_terms`, `membership_tiers`, `attribute_values`, `attribute_options`, `attribute_definitions`, `setup_states`, `org_settings`, `tax_profiles`, `invitations`, `role_assignments` and `org_member_profiles` whose `org_id` starts with `d1000000-`.
3. Delete the chapters, then the national. Parents are protected while they still have children.
4. Delete the `auth.users` rows whose `id` starts with `d0000000-`.
5. Audit events stay in the log by design (the log is append-only). Add a note in the risks doc if you want them purged too.
