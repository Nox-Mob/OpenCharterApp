-- Tasks for the hub's dashboard (S-15, SHARED-SPEC §3.6): what needs doing in Charter, read-only,
-- with the caller's own row security (so each person sees the tasks for the units they can see).
--   join_request  a membership waiting for an admin's review, one per request
--   vacant_seat   a required board seat with fewer holders than seats, one per seat and unit
--   renewals_due  memberships expiring in the next 30 days, one per unit
-- `link` is the path in OpenCharterApp where the task is done.
-- Columns and meanings: docs/INTEGRATION.md. Add columns at the end; never remove or rename one.
create view charter.api_tasks with (security_invoker = true) as
select
  m.org_id,
  m.unit_id,
  'join_request'::text as kind,
  'Review join request: ' || coalesce(nullif(p.display_name, ''), nullif(p.email, ''), 'New member') as title,
  u.name as unit_name,
  m.created_at::date as due_on,
  m.id as item_id,
  '/orgs/' || m.unit_id || '?tab=members' as link
from charter.memberships m
join charter.units u on u.id = m.unit_id
left join charter.member_profiles p on p.id = m.profile_id
where m.status = 'pending'
union all
select
  u.org_id,
  u.id,
  'vacant_seat',
  'Fill the ' || coalesce(o.title, t.title) || ' seat',
  u.name,
  null::date,
  t.id,
  '/orgs/' || u.id || '?tab=board'
from charter.seat_templates t
join charter.units u
  on u.status = 'active'
 and ((t.scope in ('self', 'self_and_chapters') and u.id = t.unit_id)
   or (t.scope in ('chapters', 'self_and_chapters') and u.type = 'chapter' and t.unit_id = any (u.ancestor_ids)))
left join charter.seat_title_overrides o on o.template_id = t.id and o.unit_id = u.id
where t.active and t.required
  and (select count(*) from charter.appointments a
       where a.template_id = t.id and a.unit_id = u.id and a.ended_on is null) < t.seat_count
union all
select
  m.org_id,
  m.unit_id,
  'renewals_due',
  count(*) || case when count(*) = 1 then ' membership expires' else ' memberships expire' end || ' in the next 30 days',
  u.name,
  min(m.paid_through),
  null::uuid,
  '/orgs/' || m.unit_id || '?tab=members'
from charter.memberships m
join charter.units u on u.id = m.unit_id
where m.status = 'active' and not m.lifetime
  and m.paid_through between current_date and current_date + 30
group by m.org_id, m.unit_id, u.name;

-- Membership at a glance for the hub's dashboard: current members (active, paid up or lifetime),
-- pending join requests and memberships expiring within 30 days, per organization.
create view charter.api_member_summary with (security_invoker = true) as
select
  m.org_id,
  count(*) filter (where m.status = 'active' and (m.lifetime or m.paid_through >= current_date))::int as current_members,
  count(*) filter (where m.status = 'pending')::int as pending_requests,
  count(*) filter (where m.status = 'active' and not m.lifetime
                     and m.paid_through between current_date and current_date + 30)::int as renewals_due
from charter.memberships m
group by m.org_id;

comment on view charter.api_member_summary is 'Charter membership counts per organization. docs/INTEGRATION.md';
comment on view charter.api_tasks is 'Charter tasks: join requests, vacant required seats, renewals due. docs/INTEGRATION.md';
grant select on charter.api_tasks, charter.api_member_summary to authenticated;
