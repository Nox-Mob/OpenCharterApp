-- Member privacy and the directory (E-14, D-139)
begin;
select tests.fixture();
insert into auth.users (id, email) values ('11111111-0000-4000-8000-000000000011', 'y@test.org');
insert into charter.member_profiles (id, unit_id, user_id, display_name, email, source) values
  ('33333333-0000-4000-8000-000000000011', '22222222-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000011', 'Yara', 'y@test.org', 'signup'),
  ('33333333-0000-4000-8000-000000000012', '22222222-0000-4000-8000-000000000002', null, 'Old Lapsed', '', 'admin');
update charter.member_profiles set display_name = 'Morgan' where id = '33333333-0000-4000-8000-000000000003';
insert into charter.membership_tiers (id, unit_id, key, name) values
  ('55555555-0000-4000-8000-000000000031', '22222222-0000-4000-8000-000000000002', 'local', 'Local');
insert into charter.tier_terms (id, tier_id, unit_id, key, label, length_count, length_unit, price_minor) values
  ('66666666-0000-4000-8000-000000000031', '55555555-0000-4000-8000-000000000031', '22222222-0000-4000-8000-000000000002', '1_year', '1 year', 1, 'year', 2500);
insert into charter.memberships (unit_id, profile_id, tier_id, term_id, status, joined_on, paid_through) values
  ('22222222-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000003', '55555555-0000-4000-8000-000000000031', '66666666-0000-4000-8000-000000000031', 'active', current_date, current_date + 300),
  ('22222222-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000011', '55555555-0000-4000-8000-000000000031', '66666666-0000-4000-8000-000000000031', 'active', current_date, current_date + 300),
  ('22222222-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000012', '55555555-0000-4000-8000-000000000031', '66666666-0000-4000-8000-000000000031', 'active', '2019-01-01', '2019-12-31');
insert into charter.attribute_definitions (id, unit_id, key, label, data_type, visibility, show_in_directory) values
  ('44444444-0000-4000-8000-000000000041', '22222222-0000-4000-8000-000000000002', 'rank', 'Rank', 'text', 'members', true),
  ('44444444-0000-4000-8000-000000000042', '22222222-0000-4000-8000-000000000002', 'phone', 'Phone', 'text', 'admins', true),
  ('44444444-0000-4000-8000-000000000043', '22222222-0000-4000-8000-000000000002', 'nick', 'Nickname', 'text', 'members', false);
insert into charter.attribute_values (unit_id, definition_id, entity_id, value) values
  ('22222222-0000-4000-8000-000000000002', '44444444-0000-4000-8000-000000000041', '33333333-0000-4000-8000-000000000003', '"E-4"'),
  ('22222222-0000-4000-8000-000000000002', '44444444-0000-4000-8000-000000000042', '33333333-0000-4000-8000-000000000003', '"555-0100"'),
  ('22222222-0000-4000-8000-000000000002', '44444444-0000-4000-8000-000000000043', '33333333-0000-4000-8000-000000000003', '"Mo"');

-- ----- the directory shows current, listed members with directory fields only -----
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.eq((select string_agg(display_name, ',' order by display_name) from charter.member_directory('22222222-0000-4000-8000-000000000002')),
  'Morgan,Yara', 'current members only (no lapsed, no non-members)');
select tests.eq((select fields from charter.member_directory('22222222-0000-4000-8000-000000000002') where display_name = 'Morgan'),
  '{"Rank": "E-4"}'::jsonb, 'only directory fields members may see');
select tests.throws($$select * from charter.member_directory('22222222-0000-4000-8000-000000000003')$$, 'not allowed');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.throws($$select * from charter.member_directory('22222222-0000-4000-8000-000000000002')$$, 'not allowed');
select tests.throws($$select charter.set_my_directory_listing('22222222-0000-4000-8000-000000000002', false)$$, 'not a member');
select tests.reset_role();

-- ----- a member opts out -----
select tests.as_user('11111111-0000-4000-8000-000000000011');
select charter.set_my_directory_listing('22222222-0000-4000-8000-000000000002', false);
select tests.eq((select count(*) from charter.member_directory('22222222-0000-4000-8000-000000000002') where display_name = 'Yara'), 0::bigint, 'opted out');
select tests.reset_role();

-- ----- the org's default: not listed unless a member opts in -----
insert into charter.org_settings (unit_id, key, value, mode) values ('22222222-0000-4000-8000-000000000002', 'directory.listed_by_default', 'false', 'override');
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.eq((select count(*) from charter.member_directory('22222222-0000-4000-8000-000000000002')), 0::bigint, 'nobody listed by default');
select charter.set_my_directory_listing('22222222-0000-4000-8000-000000000002', true);
select tests.eq((select string_agg(display_name, ',') from charter.member_directory('22222222-0000-4000-8000-000000000002')), 'Morgan', 'opted in');
-- back to the default
select charter.set_my_directory_listing('22222222-0000-4000-8000-000000000002', null);
select tests.eq((select count(*) from charter.member_directory('22222222-0000-4000-8000-000000000002')), 0::bigint, 'default again');
select tests.reset_role();

-- ----- exports: including opted-out members needs the national's permission -----
select tests.as_user('11111111-0000-4000-8000-000000000002');
select charter.log_member_export('22222222-0000-4000-8000-000000000002', 3, array['Name'], '{"include_opted_out": true}');
select tests.reset_role();
select tests.eq((select (after ->> 'included_opted_out')::boolean from charter.audit_events where action = 'export'), true, 'override recorded');
insert into charter.org_settings (unit_id, key, value, mode) values ('22222222-0000-4000-8000-000000000001', 'privacy.admin_override_allowed', 'false', 'locked');
select tests.eq(charter.privacy_admin_override_allowed('22222222-0000-4000-8000-000000000002'), false, 'national forbids override');
select tests.eq(charter.privacy_admin_override_allowed('22222222-0000-4000-8000-000000000001'), true, 'rule applies below, not to itself');
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$select charter.log_member_export('22222222-0000-4000-8000-000000000002', 3, array['Name'], '{"include_opted_out": true}')$$, 'opted out can''t be exported');
select charter.log_member_export('22222222-0000-4000-8000-000000000002', 2, array['Name']);
select tests.reset_role();
-- a chapter can't give itself the right
select tests.throws($$insert into charter.org_settings (unit_id, key, value, mode) values ('22222222-0000-4000-8000-000000000002', 'privacy.admin_override_allowed', 'true', 'override')$$, 'locked by a parent');
rollback;
