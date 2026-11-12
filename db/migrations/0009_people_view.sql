-- H-04: people across the apps. OpenCharterApp's roles are assignments in units (Organization
-- admin in the national, Chapter admin in Post 12…), listed per person. Read-only, with the
-- caller's own row security (people who manage roles see everyone's; others see their own).
-- Add columns at the end.
create or replace view charter.api_people with (security_invoker = true) as
select a.org_id, a.user_id,
       string_agg(r.name || case when u.parent_id is null then '' else ' (' || u.name || ')' end, ', ' order by u.parent_id nulls first, u.name, r.name) as roles
from charter.role_assignments a
join charter.roles r on r.id = a.role_id
join charter.units u on u.id = a.unit_id
group by a.org_id, a.user_id;
comment on view charter.api_people is 'Charter roles per person (H-04). docs/INTEGRATION.md';
grant select on charter.api_people to authenticated;
