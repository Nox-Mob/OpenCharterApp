-- 0034 (R6): roll-ups resolve grace days once per org; each membership still uses its own
-- org's grace days, and the directory still honours each member's choice and the default.
begin;
select tests.fixture();
-- Chapter A gives 5 days' grace, Chapter B 30 (the default)
insert into charter.org_settings (unit_id, key, value) values
  ('22222222-0000-4000-8000-000000000002', 'membership.grace_days', '5');
insert into charter.member_profiles (id, unit_id, user_id, display_name, email, source, directory_listed) values
  ('33333333-0000-4000-8000-0000000000e1', '22222222-0000-4000-8000-000000000003', null, 'Bea', '', 'admin', null);
insert into charter.membership_tiers (id, unit_id, key, name) values
  ('55555555-0000-4000-8000-0000000000e1', '22222222-0000-4000-8000-000000000001', 'reg', 'Regular');
insert into charter.tier_terms (id, tier_id, unit_id, key, label, length_count, length_unit, price_minor) values
  ('66666666-0000-4000-8000-0000000000e1', '55555555-0000-4000-8000-0000000000e1', '22222222-0000-4000-8000-000000000001', '1_year', '1 year', 1, 'year', 2500);
-- both paid through 10 days ago: lapsed in A (5 days' grace), in grace in B (30)
insert into charter.memberships (unit_id, profile_id, tier_id, term_id, status, joined_on, paid_through) values
  ('22222222-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000003',
   '55555555-0000-4000-8000-0000000000e1', '66666666-0000-4000-8000-0000000000e1', 'active', current_date - 400, current_date - 10),
  ('22222222-0000-4000-8000-000000000003', '33333333-0000-4000-8000-0000000000e1',
   '55555555-0000-4000-8000-0000000000e1', '66666666-0000-4000-8000-0000000000e1', 'active', current_date - 400, current_date - 10);

select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.eq((select lapsed || '/' || grace from charter.org_rollup_members('22222222-0000-4000-8000-000000000001') where name = 'Chapter A'),
  '1/0', 'A uses its own 5 days');
select tests.eq((select lapsed || '/' || grace from charter.org_rollup_members('22222222-0000-4000-8000-000000000001') where name = 'Chapter B'),
  '0/1', 'B uses the default 30 days');
select tests.eq((select current_members from charter.org_overview_stats('22222222-0000-4000-8000-000000000001')), 1,
  'overview counts only the member in grace');
select tests.eq((select count(*) from charter.member_directory('22222222-0000-4000-8000-000000000003')), 1::bigint,
  'directory: B member in grace, listed by default');
select tests.eq((select count(*) from charter.member_directory('22222222-0000-4000-8000-000000000002')), 0::bigint,
  'directory: lapsed A member left out');
select tests.reset_role();
-- B's default changes to "not listed": Bea (no choice of her own) drops out; her own choice wins
insert into charter.org_settings (unit_id, key, value) values
  ('22222222-0000-4000-8000-000000000003', 'directory.listed_by_default', 'false');
select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.eq((select count(*) from charter.member_directory('22222222-0000-4000-8000-000000000003')), 0::bigint,
  'directory: org default off');
select tests.reset_role();
update charter.member_profiles set directory_listed = true where id = '33333333-0000-4000-8000-0000000000e1';
select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.eq((select count(*) from charter.member_directory('22222222-0000-4000-8000-000000000003')), 1::bigint,
  'directory: member opted in');
-- permission checks unchanged
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.throws($$select * from charter.org_overview_stats('22222222-0000-4000-8000-000000000001')$$, 'not allowed');
select tests.throws($$select * from charter.org_rollup_members('22222222-0000-4000-8000-000000000001')$$, 'not allowed');
select tests.throws($$select * from charter.member_directory('22222222-0000-4000-8000-000000000003')$$, 'not allowed');
rollback;
