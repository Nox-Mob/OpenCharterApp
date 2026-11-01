-- Membership levels and terms (E-11): isolation, term rules, parent control, retire not delete
begin;
select tests.fixture();

-- national admin defines a level with a yearly and a lifetime term
select tests.as_user('11111111-0000-4000-8000-000000000001');
insert into public.membership_tiers (id, org_id, key, name, tax_treatment) values
  ('55555555-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001', 'regular', 'Regular', 'non_deductible');
-- the term's org is always the level's org, whatever the client sends
insert into public.tier_terms (tier_id, org_id, key, label, length_count, length_unit, price_minor) values
  ('55555555-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001', '1_year', '1 year', 1, 'year', 2500),
  ('55555555-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001', 'lifetime', 'Lifetime', null, null, 30000);
select tests.throws($$insert into public.tier_terms (tier_id, org_id, key, label, length_count, length_unit, price_minor)
  values ('55555555-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001', 'bad', 'Bad', 3, null, 100)$$, 'check constraint');
select tests.throws($$insert into public.tier_terms (tier_id, org_id, key, label, length_count, length_unit, price_minor)
  values ('55555555-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001', 'zero', 'Zero', 0, 'month', 100)$$, 'check constraint');
select tests.throws($$insert into public.tier_terms (tier_id, org_id, key, label, length_count, length_unit, price_minor)
  values ('55555555-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001', 'neg', 'Neg', 1, 'day', -1)$$, 'check constraint');
-- retire, never delete: DELETE is granted (Lovable convention, D-125) but no policy allows it
delete from public.tier_terms where key = 'lifetime';
delete from public.membership_tiers where key = 'regular';
update public.tier_terms set active = false where key = 'lifetime';
-- identity columns can't be changed by the client
select tests.throws($$update public.membership_tiers set org_id = '22222222-0000-4000-8000-000000000002'$$, 'can''t be changed');
select tests.throws($$update public.membership_tiers set key = 'renamed'$$, 'can''t be changed');
select tests.throws($$update public.tier_terms set key = 'renamed' where key = '1_year'$$, 'can''t be changed');
select tests.reset_role();
select tests.eq((select count(*) from public.membership_tiers where key = 'regular'), 1::bigint, 'level not deleted');
select tests.eq((select count(*) from public.tier_terms), 2::bigint, 'terms not deleted');
select tests.eq((select active from public.tier_terms where key = 'lifetime'), false, 'term retired');

-- a member can read levels but not write them
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.eq((select count(*) from public.membership_tiers), 1::bigint, 'member sees national level');
select tests.throws($$insert into public.membership_tiers (org_id, key, name) values ('22222222-0000-4000-8000-000000000002', 'x', 'X')$$, 'row-level security');
select tests.reset_role();

-- by default chapters may create their own levels; a term written for another org is pulled to its level's org
select tests.as_user('11111111-0000-4000-8000-000000000002');
insert into public.membership_tiers (id, org_id, key, name) values
  ('55555555-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000002', 'local', 'Local');
insert into public.tier_terms (tier_id, org_id, key, label, length_count, length_unit, price_minor) values
  ('55555555-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000002', '6_months', '6 months', 6, 'month', 1000);
-- chapter can't write national's levels
select tests.throws($$insert into public.tier_terms (tier_id, org_id, key, label, length_count, length_unit, price_minor)
  values ('55555555-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'cheap', 'Cheap', 1, 'year', 1)$$, 'row-level security');
select tests.reset_role();
select tests.eq((select org_id from public.tier_terms where key = '6_months'), '22222222-0000-4000-8000-000000000002'::uuid, 'term org forced');
-- a term can't be moved to another org's level
select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.throws($$update public.tier_terms set tier_id = '55555555-0000-4000-8000-000000000001' where key = '6_months'$$, 'another level');
select tests.reset_role();

-- outsiders and sibling chapters see nothing of chapter A's levels
select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.eq((select count(*) from public.membership_tiers), 0::bigint, 'outsider sees no levels');
select tests.eq((select count(*) from public.tier_terms), 0::bigint, 'outsider sees no terms');
select tests.reset_role();

-- national turns off chapter levels: chapters can't add or restore levels, even with their own setting
insert into public.org_settings (org_id, key, value, mode) values
  ('22222222-0000-4000-8000-000000000001', 'membership.child_levels_allowed', 'false', 'override'),
  ('22222222-0000-4000-8000-000000000002', 'membership.child_levels_allowed', 'true', 'override');
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$insert into public.membership_tiers (org_id, key, name) values ('22222222-0000-4000-8000-000000000002', 'another', 'Another')$$, 'parent organization manages');
-- retiring an existing level is still fine; restoring it is not
update public.membership_tiers set active = false where key = 'local';
select tests.throws($$update public.membership_tiers set active = true where key = 'local'$$, 'parent organization manages');
-- the national itself (no parent) is never blocked
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000001');
insert into public.membership_tiers (org_id, key, name) values ('22222222-0000-4000-8000-000000000001', 'senior', 'Senior');
select tests.reset_role();

-- a locked "true" at the national wins over nothing below; allowing again lets chapters restore
update public.org_settings set value = 'true', mode = 'locked'
  where org_id = '22222222-0000-4000-8000-000000000001' and key = 'membership.child_levels_allowed';
select tests.as_user('11111111-0000-4000-8000-000000000002');
update public.membership_tiers set active = true where key = 'local';
select tests.reset_role();
select tests.eq((select active from public.membership_tiers where key = 'local'), true, 'restored when allowed');
rollback;
