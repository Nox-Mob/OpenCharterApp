-- Tasks for the hub (S-15): join requests, vacant required seats and renewals due, read-only,
-- with the caller's own row security.
begin;
select tests.fixture();
insert into charter.membership_tiers (id, unit_id, key, name) values
  ('55555555-0000-4000-8000-000000000081', '22222222-0000-4000-8000-000000000002', 'regular', 'Regular');
insert into charter.tier_terms (id, tier_id, unit_id, key, label, length_count, length_unit, price_minor) values
  ('66666666-0000-4000-8000-000000000081', '55555555-0000-4000-8000-000000000081', '22222222-0000-4000-8000-000000000002', '1_year', '1 year', 1, 'year', 0);
update charter.member_profiles set display_name = 'Morgan' where id = '33333333-0000-4000-8000-000000000003';
-- Morgan asked to join Chapter A; Avery's membership expires in ten days.
insert into charter.memberships (unit_id, profile_id, tier_id, term_id, status) values
  ('22222222-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000003', '55555555-0000-4000-8000-000000000081', '66666666-0000-4000-8000-000000000081', 'pending');
insert into charter.memberships (unit_id, profile_id, tier_id, term_id, status, joined_on, paid_through) values
  ('22222222-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000002', '55555555-0000-4000-8000-000000000081', '66666666-0000-4000-8000-000000000081', 'active', current_date - 355, current_date + 10);
-- The national requires a President in every chapter; none is appointed.
insert into charter.seat_templates (unit_id, key, title, required, scope) values
  ('22222222-0000-4000-8000-000000000001', 'president', 'President', true, 'chapters');

select tests.eq((select bool_and(c.reloptions @> array['security_invoker=true']) from pg_class c
  join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'charter' and c.relname = 'api_tasks'),
  true, 'the view runs with the caller''s rights (security_invoker)');

select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.eq((select title from charter.api_tasks where kind = 'join_request'), 'Review join request: Morgan', 'a join request to review');
select tests.eq((select count(*) from charter.api_tasks where kind = 'vacant_seat'), 2::bigint, 'the required seat is vacant in both chapters');
select tests.eq((select title from charter.api_tasks where kind = 'renewals_due'), '1 membership expires in the next 30 days', 'renewals due, counted per unit');
select tests.eq((select current_members || '/' || pending_requests || '/' || renewals_due from charter.api_member_summary
  where org_id = '22222222-0000-4000-8000-000000000001'), '1/1/1', 'membership at a glance: current, pending, renewals due');
select tests.eq((select link from charter.api_tasks where kind = 'join_request'), '/orgs/22222222-0000-4000-8000-000000000002?tab=members', 'where to do it');
select tests.reset_role();

-- Someone outside the organization sees no tasks.
select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.eq((select count(*) from charter.api_tasks), 0::bigint, 'an outsider sees no tasks');
select tests.reset_role();
rollback;
