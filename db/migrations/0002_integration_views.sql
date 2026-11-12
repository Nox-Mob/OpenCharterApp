-- Integration views (SHARED-SPEC §3.6, S-03): the read-only data Charter publishes for the hub
-- and the other apps. `security_invoker` makes every view run with the caller's own row
-- security, so it shows exactly what the caller could read in Charter's own tables.
-- Consumers feature-detect: on a database without Charter these views don't exist.
-- Columns and meanings: docs/INTEGRATION.md. Add columns at the end; never remove or rename one.

-- The organization's tree: the national (or standalone association), its regions and chapters.
create view charter.api_units with (security_invoker = true) as
select
  u.id,
  u.org_id,
  u.parent_id,
  u.type::text as type,
  u.name,
  u.slug,
  u.status,
  u.created_at
from charter.units u;

-- Filled board seats: who holds which seat at which unit now (appointments not yet ended).
create view charter.api_board_seats with (security_invoker = true) as
select
  a.id,
  a.org_id,
  a.unit_id,
  u.name as unit_name,
  a.template_id as seat_id,
  coalesce(o.title, t.title) as title,
  a.seat_number,
  t.required,
  p.display_name as holder_name,
  a.starts_on,
  a.planned_end
from charter.appointments a
join charter.seat_templates t on t.id = a.template_id
join charter.units u on u.id = a.unit_id
left join charter.seat_title_overrides o on o.template_id = a.template_id and o.unit_id = a.unit_id
left join charter.member_profiles p on p.id = a.profile_id
where a.ended_on is null;

-- Active units per organization (spec §6.1: in case pricing later depends on units).
create view charter.api_unit_count with (security_invoker = true) as
select u.org_id, count(*)::int as units
from charter.units u
where u.status = 'active'
group by u.org_id;

comment on view charter.api_units is 'Charter units (the organization tree). docs/INTEGRATION.md';
comment on view charter.api_board_seats is 'Charter filled board seats. docs/INTEGRATION.md';
comment on view charter.api_unit_count is 'Charter active units per organization. docs/INTEGRATION.md';

grant select on charter.api_units, charter.api_board_seats, charter.api_unit_count to authenticated;
