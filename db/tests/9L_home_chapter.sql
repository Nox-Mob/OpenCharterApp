-- Membership model: national membership with a home chapter (0030, D-166)
begin;
select tests.fixture();
-- y: a national member with a login; w: a national record without a login
insert into auth.users (id, email) values ('11111111-0000-4000-8000-0000000000c1', 'y@test.org');
insert into charter.member_profiles (id, unit_id, user_id, display_name, email, source) values
  ('33333333-0000-4000-8000-0000000000c1', '22222222-0000-4000-8000-000000000001', '11111111-0000-4000-8000-0000000000c1', 'Yara', 'y@test.org', 'signup'),
  ('33333333-0000-4000-8000-0000000000c2', '22222222-0000-4000-8000-000000000001', null, 'Walt', 'w@test.org', 'admin');
insert into charter.membership_tiers (id, unit_id, key, name) values
  ('55555555-0000-4000-8000-0000000000c1', '22222222-0000-4000-8000-000000000001', 'reg', 'Regular');
insert into charter.tier_terms (id, tier_id, unit_id, key, label, length_count, length_unit, price_minor) values
  ('66666666-0000-4000-8000-0000000000c1', '55555555-0000-4000-8000-0000000000c1', '22222222-0000-4000-8000-000000000001', '1_year', '1 year', 1, 'year', 2500);
insert into charter.memberships (id, unit_id, profile_id, tier_id, term_id, status, joined_on, paid_through) values
  ('77777777-0000-4000-8000-0000000000c1', '22222222-0000-4000-8000-000000000001', '33333333-0000-4000-8000-0000000000c1',
   '55555555-0000-4000-8000-0000000000c1', '66666666-0000-4000-8000-0000000000c1', 'active', '2024-01-01', current_date + 200),
  ('77777777-0000-4000-8000-0000000000c2', '22222222-0000-4000-8000-000000000001', '33333333-0000-4000-8000-0000000000c2',
   '55555555-0000-4000-8000-0000000000c1', '66666666-0000-4000-8000-0000000000c1', 'active', '2024-01-01', current_date + 200);

-- ----- the model: separate until chosen; only the national; chosen once -----
select tests.eq(charter.membership_model('22222222-0000-4000-8000-000000000002'), 'separate', 'default model');
select tests.as_user('11111111-0000-4000-8000-0000000000c1');
select tests.throws($$select charter.set_home_chapter('22222222-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002')$$,
  'don''t choose a chapter here');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$insert into charter.org_settings (unit_id, key, value, mode) values ('22222222-0000-4000-8000-000000000002', 'membership.model', '"home_chapter"', 'override')$$,
  'only a national');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000001');
insert into charter.org_settings (unit_id, key, value, mode) values ('22222222-0000-4000-8000-000000000001', 'membership.model', '"home_chapter"', 'override');
select tests.eq((select mode::text from charter.org_settings where key = 'membership.model'), 'locked', 'locked for the tree');
select tests.eq(charter.membership_model('22222222-0000-4000-8000-000000000003'), 'home_chapter', 'chapters follow the national');
select tests.throws($$update charter.org_settings set value = '"separate"' where key = 'membership.model'$$, 'can''t be changed once chosen');
select tests.throws($$delete from charter.org_settings where key = 'membership.model'$$, 'can''t be changed once chosen');
select tests.throws($$insert into charter.org_settings (unit_id, key, value, mode) values ('22222222-0000-4000-8000-000000000001', 'membership.at_large_chapter', '"22222222-0000-4000-8000-000000000001"', 'override')$$,
  'one of your chapters');
insert into charter.org_settings (unit_id, key, value, mode) values ('22222222-0000-4000-8000-000000000001', 'membership.at_large_chapter', '"22222222-0000-4000-8000-000000000003"', 'override');
select tests.reset_role();
-- anyone can see what the join page offers
set local role anon;
select tests.eq((select (i->>'model') || '|' || (i->'national'->>'slug') || '|' || jsonb_array_length(i->'chapters') || '|' || (i->>'at_large_chapter')
  from charter.public_home_chapter_info('ch-a') i), 'home_chapter|nat|2|22222222-0000-4000-8000-000000000003', 'join page info');
reset role;

-- ----- the member picks chapter A -----
select tests.as_user('11111111-0000-4000-8000-0000000000c1');
select charter.set_home_chapter('22222222-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002');
select tests.throws($$select charter.set_home_chapter('22222222-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001')$$,
  'isn''t one of this organization''s chapters');
-- members can't set the link themselves
select tests.throws($$update charter.member_profiles set home_of = '77777777-0000-4000-8000-0000000000c2' where user_id = auth.uid()$$, 'permission denied');
select tests.eq((select count(*) from charter.affiliation_history), 1::bigint, 'the member reads their own history');
select tests.reset_role();
select tests.eq((select home_org_id from charter.memberships where id = '77777777-0000-4000-8000-0000000000c1'),
  '22222222-0000-4000-8000-000000000002'::uuid, 'home chapter stored on the national membership');
select tests.eq((select count(*) from charter.member_profiles where unit_id = '22222222-0000-4000-8000-000000000002'
  and home_of = '77777777-0000-4000-8000-0000000000c1' and display_name = 'Yara'), 1::bigint, 'a record in chapter A');

-- the chapter A admin sees them with their national standing; others don't
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.eq((select status::text from charter.memberships where id = '77777777-0000-4000-8000-0000000000c1'), 'active', 'chapter reads the national membership');
select tests.eq((select current_members from charter.org_overview_stats('22222222-0000-4000-8000-000000000002')), 1, 'counted in chapter A');
select tests.eq((select good from charter.org_rollup_members('22222222-0000-4000-8000-000000000002')), 1, 'chapter A report: good standing');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.eq((select string_agg(display_name, ',') from charter.member_directory('22222222-0000-4000-8000-000000000002')), 'Yara', 'in A''s directory');
select tests.eq((select count(*) from charter.memberships where id = '77777777-0000-4000-8000-0000000000c1'), 0::bigint, 'other members can''t read it');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.eq((select count(*) from charter.affiliation_history), 0::bigint, 'outsiders read no history');
select tests.reset_role();

-- ----- officers come from the members who chose the chapter, standing from the national -----
create temp table ids (k text primary key, id uuid);
grant all on ids to authenticated;
select tests.as_user('11111111-0000-4000-8000-000000000001');
insert into ids select 'president', charter.define_seat('22222222-0000-4000-8000-000000000001', 'president', 'President', '', true, 1, null, null, null, 'chapters', 1);
select tests.reset_role();
insert into ids select 'yara_a', id from charter.member_profiles where unit_id = '22222222-0000-4000-8000-000000000002' and home_of = '77777777-0000-4000-8000-0000000000c1';
select tests.as_user('11111111-0000-4000-8000-000000000002');
insert into ids select 'appt', charter.appoint_officer('22222222-0000-4000-8000-000000000002', (select id from ids where k = 'president'),
  (select id from ids where k = 'yara_a'), current_date);
select tests.reset_role();

-- ----- moving to chapter B ends the seat and the chapter A link -----
select tests.as_user('11111111-0000-4000-8000-0000000000c1');
select charter.set_home_chapter('22222222-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000003');
select tests.reset_role();
select tests.eq((select end_reason from charter.appointments where id = (select id from ids where k = 'appt')), 'changed chapter', 'seat ended');
select tests.eq((select left_at is not null from charter.member_profiles where id = (select id from ids where k = 'yara_a')), true, 'left chapter A');
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.eq((select count(*) from charter.memberships where id = '77777777-0000-4000-8000-0000000000c1'), 0::bigint, 'chapter A no longer reads it');
select tests.eq((select current_members from charter.org_overview_stats('22222222-0000-4000-8000-000000000002')), 0, 'no longer counted in A');
select tests.throws(format('select charter.appoint_officer(%L, %L, %L, current_date)', '22222222-0000-4000-8000-000000000002',
  (select id from ids where k = 'president'), (select id from ids where k = 'yara_a')), 'not a member of this organization');
select tests.reset_role();
select tests.eq((select string_agg(coalesce(from_org_id::text, '-') || '>' || coalesce(to_org_id::text, '-'), ',' order by created_at, to_org_id)
  from charter.affiliation_history), '->22222222-0000-4000-8000-000000000002,22222222-0000-4000-8000-000000000002>22222222-0000-4000-8000-000000000003', 'history kept');
-- national overview counts Yara once
select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.eq((select roster from charter.org_overview_stats('22222222-0000-4000-8000-000000000001')), 5, 'n, a, m, Yara and Walt, each once');
select tests.reset_role();

-- ----- moving back to A reuses the record; then no chapter -----
select tests.as_user('11111111-0000-4000-8000-0000000000c1');
select charter.set_home_chapter('22222222-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002');
select charter.set_home_chapter('22222222-0000-4000-8000-000000000001', null);
select tests.reset_role();
select tests.eq((select count(*) from charter.member_profiles where unit_id = '22222222-0000-4000-8000-000000000002' and user_id = '11111111-0000-4000-8000-0000000000c1'),
  1::bigint, 'record reused, not duplicated');
select tests.eq((select home_org_id from charter.memberships where id = '77777777-0000-4000-8000-0000000000c1'), null::uuid, 'member at large');

-- ----- a national admin sets it for a record without a login; a chapter admin can't -----
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$select charter.set_member_home_chapter('77777777-0000-4000-8000-0000000000c2', '22222222-0000-4000-8000-000000000002')$$, 'not allowed');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000001');
select charter.set_member_home_chapter('77777777-0000-4000-8000-0000000000c2', '22222222-0000-4000-8000-000000000002');
select tests.reset_role();
select tests.eq((select source || ':' || coalesce(user_id::text, '-') from charter.member_profiles where unit_id = '22222222-0000-4000-8000-000000000002'
  and home_of = '77777777-0000-4000-8000-0000000000c2'), 'admin:-', 'record without a login in chapter A');
select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.eq((select roster from charter.org_overview_stats('22222222-0000-4000-8000-000000000001')), 5, 'Walt counted once too');
select tests.reset_role();

-- ----- deleting a whole demo national that used the model works (0033) -----
insert into charter.platform_operators (user_id) values ('11111111-0000-4000-8000-000000000001') on conflict do nothing;
insert into charter.units (id, type, name, slug, is_demo) values
  ('22222222-0000-4000-8000-0000000000e1', 'national', 'Demo HC', 'demo-hc', true);
insert into charter.units (id, parent_id, type, name, slug) values
  ('22222222-0000-4000-8000-0000000000e2', '22222222-0000-4000-8000-0000000000e1', 'chapter', 'Demo HC A', 'demo-hc-a');
insert into charter.org_settings (unit_id, key, value, mode) values ('22222222-0000-4000-8000-0000000000e1', 'membership.model', '"home_chapter"', 'locked');
insert into charter.member_profiles (id, unit_id, user_id, display_name, email, source) values
  ('33333333-0000-4000-8000-0000000000e1', '22222222-0000-4000-8000-0000000000e1', '11111111-0000-4000-8000-0000000000c1', 'Yara', 'y@test.org', 'signup');
insert into charter.membership_tiers (id, unit_id, key, name) values ('55555555-0000-4000-8000-0000000000e1', '22222222-0000-4000-8000-0000000000e1', 'reg', 'Regular');
insert into charter.tier_terms (id, tier_id, unit_id, key, label, length_count, length_unit, price_minor) values
  ('66666666-0000-4000-8000-0000000000e1', '55555555-0000-4000-8000-0000000000e1', '22222222-0000-4000-8000-0000000000e1', '1y', '1 year', 1, 'year', 100);
insert into charter.memberships (id, unit_id, profile_id, tier_id, term_id, status, joined_on, paid_through) values
  ('77777777-0000-4000-8000-0000000000e1', '22222222-0000-4000-8000-0000000000e1', '33333333-0000-4000-8000-0000000000e1',
   '55555555-0000-4000-8000-0000000000e1', '66666666-0000-4000-8000-0000000000e1', 'active', '2024-01-01', current_date + 30);
select tests.as_user('11111111-0000-4000-8000-0000000000c1');
select charter.set_home_chapter('22222222-0000-4000-8000-0000000000e1', '22222222-0000-4000-8000-0000000000e2');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.eq(array_length(charter.delete_demo_organization('22222222-0000-4000-8000-0000000000e1', 'Demo HC'), 1), 2,
  'a home-chapter demo national is deleted with its chapter');
select tests.reset_role();
select tests.eq((select count(*) from charter.affiliation_history where unit_id = '22222222-0000-4000-8000-0000000000e1'), 0::bigint, 'its history goes too');

-- history is append-only; internal function not callable
select tests.throws($$update charter.affiliation_history set to_org_id = null$$, 'can''t be changed');
select tests.as_user('11111111-0000-4000-8000-0000000000c1');
select tests.throws($$select charter.move_home_chapter('77777777-0000-4000-8000-0000000000c1', null)$$, 'permission denied');
select tests.reset_role();
rollback;
