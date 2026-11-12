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

## `charter.api_tasks` (S-15)

What needs doing in Charter, for the hub's task list. Each person sees the tasks for the units they
can see.

| Column | Type | Meaning |
|---|---|---|
| `org_id` | uuid | The OpenAppHub organization |
| `unit_id` | uuid | Unit the task is about |
| `kind` | text | `join_request` (one per request), `vacant_seat` (a required seat with fewer holders than seats, per unit), `renewals_due` (memberships expiring within 30 days, one per unit) |
| `title` | text | Ready to show, for example "Review join request: Morgan" |
| `unit_name` | text | |
| `due_on` | date | When it was asked (join requests) or the first expiry (renewals); null for seats |
| `item_id` | uuid | The membership or seat; null for renewals |
| `link` | text | Path in OpenCharterApp where it's done |

## Board members in sync with OpenBoardApp (S-14)

Officers at the organization level (the top unit) are kept in step with OpenBoardApp's terms
(migration `0005_board_sync.sql`): appointing, changing or ending one here updates Board; a term
added in Board becomes an appointment here when its position matches a seat and its person a
member; ending a linked term in Board ends the appointment here. Chapter officers stay in Charter.
Details, and why these sync functions are trigger-only `security definer` functions (an exception
to SHARED-SPEC §3.6): OpenBoardApp's `docs/INTEGRATION.md`.

## Uses from other apps (S-13)

The Reports tab's **Add to a board package** puts the reports PDF into an upcoming OpenBoardApp
meeting through `board.add_report_to_meeting` (shared `AddToBoardPackage`). Hidden when OpenBoardApp
isn't on this database.

## `charter.api_member_summary` (hub dashboard)

Membership at a glance, per organization (what the reader can see).

| Column | Type | Meaning |
|---|---|---|
| `org_id` | uuid | The OpenAppHub organization |
| `current_members` | int | Active memberships, paid up or lifetime |
| `pending_requests` | int | Join requests waiting for review |
| `renewals_due` | int | Active memberships expiring within 30 days |
