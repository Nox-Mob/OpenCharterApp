# Demo data (temporary)

Test data for trying out the app. **Delete it before launch.** Every demo record uses an ID prefix so it's easy to find and remove.

## Accounts

All accounts share the same password: `OpenCharterDemo!2026`

| Email | ID | Role |
|---|---|---|
| demo-national@opencharter.test | d0000000-…-0001 | Org admin of Demo National Association. Also a member of the Austin chapter, because it accepted an invitation during testing |
| demo-chapter@opencharter.test | d0000000-…-0002 | Org admin of Demo Austin Chapter |
| demo-member@opencharter.test | d0000000-…-0003 | Member of Demo Austin Chapter |

## Organizations

| Name | ID | Type |
|---|---|---|
| Demo National Association (`demo-national`) | d1000000-…-0001 | National |
| Demo Austin Chapter (`demo-austin`) | d1000000-…-0002 | Chapter |
| Demo Dallas Chapter (`demo-dallas`) | d1000000-…-0003 | Chapter, no admin yet |

## Cleanup

Run these steps in order.

1. Delete the files under `branding/d1000000-*` in storage.
2. Delete the rows in `org_settings`, `tax_profiles`, `invitations`, `role_assignments` and `org_member_profiles` whose `org_id` starts with `d1000000-`.
3. Delete the chapters, then the national. Parents are protected while they still have children.
4. Delete the `auth.users` rows whose `id` starts with `d0000000-`.
5. Audit events stay in the log by design (the log is append-only). Add a note in the risks doc if you want them purged too.
