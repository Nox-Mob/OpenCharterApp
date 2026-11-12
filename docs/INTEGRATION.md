# OpenCharterApp integration

What Charter publishes for OpenAppHub and the other apps (SHARED-SPEC §3.6). Everything here is a
**read-only view** in schema `charter`, created `with (security_invoker = true)`: it runs with
the caller's own row security, so a person sees exactly the rows they could read in Charter itself
(staff and members of the organization's tree; nobody else; signed-out visitors nothing).

Rules for consumers:

- **Feature-detect.** On a database without Charter (or before migration `0002`), the views don't
  exist. Treat "relation does not exist" (PostgREST `42P01` / `PGRST205`) as "Charter isn't here"
  and hide the integration.
- **Never write.** A change in Charter would go through a `security invoker` RPC documented here.
- **Columns are stable.** New columns are added at the end; none is removed or renamed.

Migration: [`db/migrations/0002_integration_views.sql`](../db/migrations/0002_integration_views.sql).
Tests: [`db/tests/9W_integration_views.sql`](../db/tests/9W_integration_views.sql).

## `charter.api_units`

The organization's tree: the national or standalone association (the top unit has the same id as
the OpenAppHub organization), its regions and its chapters.

| Column | Type | Meaning |
|---|---|---|
| `id` | uuid | The unit |
| `org_id` | uuid | The OpenAppHub organization (the top unit's id) |
| `parent_id` | uuid | Parent unit; null for the top |
| `type` | text | `national`, `region`, `chapter` or `standalone` |
| `name` | text | |
| `slug` | text | Used in the public join page address |
| `status` | text | `active`, or another state for a unit that's no longer active |
| `created_at` | timestamptz | |

## `charter.api_board_seats`

Filled board seats: who holds which seat at which unit now (appointments that haven't ended).

| Column | Type | Meaning |
|---|---|---|
| `id` | uuid | The appointment |
| `org_id` | uuid | The OpenAppHub organization |
| `unit_id` | uuid | Unit the seat belongs to |
| `unit_name` | text | |
| `seat_id` | uuid | The seat (seat template) |
| `title` | text | The unit's own title for the seat if it set one, else the seat's title |
| `seat_number` | int | For seats with more than one holder |
| `required` | boolean | Whether the bylaws require this seat |
| `holder_name` | text | The officer's display name; may be null |
| `starts_on` | date | |
| `planned_end` | date | End of the current term, if it has one |

Example (the hub's dashboard: officers of the top unit):

```sql
select title, holder_name from charter.api_board_seats
where org_id = :org and unit_id = :org order by title;
```

## `charter.api_unit_count`

Active units per organization (spec §6.1: kept in case pricing later depends on units).

| Column | Type | Meaning |
|---|---|---|
| `org_id` | uuid | The OpenAppHub organization |
| `units` | int | Active units, the top unit included |
