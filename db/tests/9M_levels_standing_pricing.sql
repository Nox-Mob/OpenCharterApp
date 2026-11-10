-- Sprint 2/3 (0032): national standing for chapters (A5), suggested levels copy/linked (A4),
-- pricing rules through setup (A6)
begin;
select tests.fixture();
insert into charter.membership_tiers (id, unit_id, key, name) values
  ('55555555-0000-4000-8000-0000000000d1', '22222222-0000-4000-8000-000000000001', 'reg', 'Regular');
insert into charter.tier_terms (id, tier_id, unit_id, key, label, length_count, length_unit, price_minor) values
  ('66666666-0000-4000-8000-0000000000d1', '55555555-0000-4000-8000-0000000000d1', '22222222-0000-4000-8000-000000000001', '1y', '1 year', 1, 'year', 5000),
  ('66666666-0000-4000-8000-0000000000d2', '55555555-0000-4000-8000-0000000000d1', '22222222-0000-4000-8000-000000000001', 'life', 'Lifetime', null, null, 30000);

-- ----- A5: m (member of A) also holds a current national membership -----
insert into charter.member_profiles (id, unit_id, user_id, display_name, email, source) values
  ('33333333-0000-4000-8000-0000000000d1', '22222222-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000003', 'Morgan', 'm@test.org', 'signup');
insert into charter.memberships (unit_id, profile_id, tier_id, term_id, status, joined_on, paid_through) values
  ('22222222-0000-4000-8000-000000000001', '33333333-0000-4000-8000-0000000000d1', '55555555-0000-4000-8000-0000000000d1',
   '66666666-0000-4000-8000-0000000000d1', 'active', '2024-01-01', current_date + 100);
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.eq((select national_standing from charter.chapter_national_standing('22222222-0000-4000-8000-000000000002')
  where profile_id = '33333333-0000-4000-8000-000000000003'), 'good', 'chapter admin sees the member''s national standing');
select tests.eq((select national_standing from charter.chapter_national_standing('22222222-0000-4000-8000-000000000002')
  where profile_id = '33333333-0000-4000-8000-000000000002'), 'none', 'no national membership');
select tests.throws($$select * from charter.chapter_national_standing('22222222-0000-4000-8000-000000000003')$$, 'not allowed');
-- the chapter admin still can't read the national's memberships
select tests.eq((select count(*) from charter.memberships where unit_id = '22222222-0000-4000-8000-000000000001'), 0::bigint, 'standing only');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.throws($$select * from charter.chapter_national_standing('22222222-0000-4000-8000-000000000002')$$, 'not allowed');
select tests.reset_role();

-- ----- A4: the national suggests its level -----
create temp table ids (k text primary key, id uuid);
grant all on ids to authenticated;
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$select charter.adopt_suggested_level('22222222-0000-4000-8000-000000000002', '55555555-0000-4000-8000-0000000000d1', 'copy')$$,
  'isn''t suggested to you');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000001');
update charter.membership_tiers set suggested = true where id = '55555555-0000-4000-8000-0000000000d1';
select tests.reset_role();

select tests.as_user('11111111-0000-4000-8000-000000000002');
insert into ids select 'copy', charter.adopt_suggested_level('22222222-0000-4000-8000-000000000002', '55555555-0000-4000-8000-0000000000d1', 'copy');
insert into ids select 'linked', charter.adopt_suggested_level('22222222-0000-4000-8000-000000000002', '55555555-0000-4000-8000-0000000000d1', 'linked', 'minus_percent', 20);
select tests.eq((select key || ':' || link_mode from charter.membership_tiers where id = (select id from ids where k = 'linked')), 'reg_2:linked', 'unique key, linked');
select tests.eq((select string_agg(key || '=' || price_minor, ',' order by key) from charter.tier_terms where tier_id = (select id from ids where k = 'linked')),
  '1y=4000,life=24000', '20% off the national''s prices');
select tests.eq((select string_agg(key || '=' || price_minor, ',' order by key) from charter.tier_terms where tier_id = (select id from ids where k = 'copy')),
  '1y=5000,life=30000', 'a copy starts at the national''s prices');
-- a copy is the chapter's own; a linked level isn't
update charter.membership_tiers set name = 'Austin Regular' where id = (select id from ids where k = 'copy');
update charter.tier_terms set price_minor = 4500 where tier_id = (select id from ids where k = 'copy') and key = '1y';
select tests.throws(format('update charter.membership_tiers set name = %L where id = %L', 'X', (select id from ids where k = 'linked')), 'make it your own');
select tests.throws(format('update charter.tier_terms set price_minor = 1 where tier_id = %L', (select id from ids where k = 'linked')), 'make it your own');
select tests.throws(format('update charter.membership_tiers set link_mode = %L where id = %L', 'linked', (select id from ids where k = 'copy')), 'start from a suggested level');
select tests.throws($$insert into charter.membership_tiers (unit_id, key, name, source_tier_id, link_mode) values
  ('22222222-0000-4000-8000-000000000002', 'sneaky', 'S', '55555555-0000-4000-8000-0000000000d1', 'linked')$$, 'start from a suggested level');
select tests.reset_role();

-- the national changes its level: linked follows, the copy doesn't
select tests.as_user('11111111-0000-4000-8000-000000000001');
update charter.tier_terms set price_minor = 6000 where id = '66666666-0000-4000-8000-0000000000d1';
insert into charter.tier_terms (tier_id, unit_id, key, label, length_count, length_unit, price_minor) values
  ('55555555-0000-4000-8000-0000000000d1', '22222222-0000-4000-8000-000000000001', '3y', '3 years', 3, 'year', 12000);
update charter.membership_tiers set name = 'Standard' where id = '55555555-0000-4000-8000-0000000000d1';
select tests.reset_role();
select tests.eq((select string_agg(key || '=' || price_minor, ',' order by key) from charter.tier_terms where tier_id = (select id from ids where k = 'linked')),
  '1y=4800,3y=9600,life=24000', 'linked prices and terms follow');
select tests.eq((select name from charter.membership_tiers where id = (select id from ids where k = 'linked')), 'Standard', 'linked name follows');
select tests.eq((select string_agg(key || '=' || price_minor, ',' order by key) from charter.tier_terms where tier_id = (select id from ids where k = 'copy')),
  '1y=4500,life=30000', 'the copy is unchanged');

-- price rules: an amount off; the national's range clamps
select tests.as_user('11111111-0000-4000-8000-000000000002');
select charter.set_linked_level_price((select id from ids where k = 'linked'), 'minus_amount', 1000);
select tests.eq((select price_minor from charter.tier_terms where tier_id = (select id from ids where k = 'linked') and key = '1y'), 5000, '$10 off');
select tests.throws(format('select charter.set_linked_level_price(%L, %L, 150)', (select id from ids where k = 'linked'), 'minus_percent'), 'percentage off');
select tests.reset_role();
insert into charter.org_settings (unit_id, key, value, mode) values
  ('22222222-0000-4000-8000-000000000001', 'membership.chapter_dues_max_minor', '20000', 'locked');
select tests.as_user('11111111-0000-4000-8000-000000000002');
select charter.set_linked_level_price((select id from ids where k = 'linked'), 'same', 0);
select tests.eq((select string_agg(key || '=' || price_minor, ',' order by key) from charter.tier_terms where tier_id = (select id from ids where k = 'linked')),
  '1y=6000,3y=12000,life=20000', 'kept within the national''s range');
select tests.reset_role();

-- the national retires its level: the linked one retires; "make it our own" ends the link
select tests.as_user('11111111-0000-4000-8000-000000000001');
update charter.membership_tiers set active = false where id = '55555555-0000-4000-8000-0000000000d1';
select tests.reset_role();
select tests.eq((select active from charter.membership_tiers where id = (select id from ids where k = 'linked')), false, 'linked level retired too');
select tests.eq((select active from charter.membership_tiers where id = (select id from ids where k = 'copy')), true, 'copy stays');
select tests.as_user('11111111-0000-4000-8000-000000000002');
select charter.make_level_own((select id from ids where k = 'linked'));
update charter.membership_tiers set name = 'Ours now' where id = (select id from ids where k = 'linked');
select tests.eq((select link_mode || ':' || name from charter.membership_tiers where id = (select id from ids where k = 'linked')), 'copy:Ours now', 'made our own');
select tests.reset_role();

-- members, outsiders and a parent rule refuse adoption
update charter.membership_tiers set active = true where id = '55555555-0000-4000-8000-0000000000d1';
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.throws($$select charter.adopt_suggested_level('22222222-0000-4000-8000-000000000002', '55555555-0000-4000-8000-0000000000d1', 'copy')$$, 'not allowed');
select tests.reset_role();
insert into charter.org_settings (unit_id, key, value, mode) values
  ('22222222-0000-4000-8000-000000000001', 'membership.child_levels_allowed', 'false', 'locked');
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$select charter.adopt_suggested_level('22222222-0000-4000-8000-000000000002', '55555555-0000-4000-8000-0000000000d1', 'copy')$$,
  'parent organization manages');
select tests.reset_role();

-- ----- A6: pricing rules through setup, applied twice -----
select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.eq('pricing_rules' = any(charter.apply_setup_sections()), true, 'setup knows pricing rules');
select charter.apply_setup('22222222-0000-4000-8000-000000000001', 'membership', '{}', $${"pricing_rules": [
  {"tier_key": "reg", "term_key": "1y", "label": "Veterans", "conditions": [], "discount_pct": 20, "sort_order": 1}]}$$);
select charter.apply_setup('22222222-0000-4000-8000-000000000001', 'membership', '{}', $${"pricing_rules": [
  {"tier_key": "reg", "term_key": "1y", "label": "Veterans", "conditions": [], "discount_pct": 25, "sort_order": 1}]}$$);
select tests.eq((select count(*)::int || ':' || max(discount_pct) from charter.pricing_rules where term_id = '66666666-0000-4000-8000-0000000000d1'),
  '1:25', 'one rule, updated in place');
select tests.throws($$select charter.apply_setup('22222222-0000-4000-8000-000000000001', 'membership', '{}',
  '{"pricing_rules": [{"tier_key": "reg", "term_key": "nope", "label": "X", "conditions": [], "discount_pct": 5}]}')$$, 'unknown level or term');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$select charter.apply_setup('22222222-0000-4000-8000-000000000001', 'membership', '{}',
  '{"pricing_rules": [{"tier_key": "reg", "term_key": "1y", "label": "Y", "conditions": [], "discount_pct": 5}]}')$$, 'not allowed');
select tests.reset_role();
rollback;
