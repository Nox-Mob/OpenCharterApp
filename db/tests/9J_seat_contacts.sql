-- Board contact emails: a role email per seat, or each officer's own email (0026, D-156)
begin;
select tests.fixture();
update charter.member_profiles set display_name = 'Avery' where id = '33333333-0000-4000-8000-000000000002';
update charter.member_profiles set display_name = 'Morgan' where id = '33333333-0000-4000-8000-000000000003';
insert into charter.membership_tiers (id, unit_id, key, name) values
  ('55555555-0000-4000-8000-0000000000a1', '22222222-0000-4000-8000-000000000001', 'reg', 'Regular');
insert into charter.tier_terms (id, tier_id, unit_id, key, label, length_count, length_unit, price_minor) values
  ('66666666-0000-4000-8000-0000000000a1', '55555555-0000-4000-8000-0000000000a1', '22222222-0000-4000-8000-000000000001', '1_year', '1 year', 1, 'year', 2500);
insert into charter.memberships (unit_id, profile_id, tier_id, term_id, status, joined_on, paid_through)
  select '22222222-0000-4000-8000-000000000002', p, '55555555-0000-4000-8000-0000000000a1', '66666666-0000-4000-8000-0000000000a1',
    'active', '2020-01-01', current_date + 300
  from unnest(array['33333333-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000003']::uuid[]) p;

create temp table ids (k text primary key, id uuid);
grant all on ids to authenticated;

-- national defines President and Secretary for its chapters; Treasurer for itself only
select tests.as_user('11111111-0000-4000-8000-000000000001');
insert into ids select 'president', charter.define_seat('22222222-0000-4000-8000-000000000001', 'president', 'President', '', true, 1, null, null, null, 'chapters', 1);
insert into ids select 'secretary', charter.define_seat('22222222-0000-4000-8000-000000000001', 'secretary', 'Secretary', '', false, 1, null, null, null, 'chapters', 2);
insert into ids select 'treasurer', charter.define_seat('22222222-0000-4000-8000-000000000001', 'treasurer', 'Treasurer');
select tests.reset_role();

-- chapter A appoints Avery as President and Morgan as Secretary
select tests.as_user('11111111-0000-4000-8000-000000000002');
select charter.appoint_officer('22222222-0000-4000-8000-000000000002', (select id from ids where k = 'president'), '33333333-0000-4000-8000-000000000002', current_date);
select charter.appoint_officer('22222222-0000-4000-8000-000000000002', (select id from ids where k = 'secretary'), '33333333-0000-4000-8000-000000000003', current_date);
select tests.reset_role();

-- ----- default: each officer's own email -----
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.eq((select string_agg(title || ':' || display_name || ':' || email || ':' || email_source, ',' order by sort_order)
  from charter.org_board_contacts('22222222-0000-4000-8000-000000000002')),
  'President:Avery:a@test.org:officer,Secretary:Morgan:m@test.org:officer', 'a member sees officers'' own emails by default');
-- members can't read other members' records directly
select tests.eq((select count(*) from charter.member_profiles where id = '33333333-0000-4000-8000-000000000002'), 0::bigint, 'profiles stay private');
-- and can't set contacts
select tests.throws(format('select charter.set_seat_contact(%L, %L, %L)', '22222222-0000-4000-8000-000000000002',
  (select id from ids where k = 'president'), 'president@a.org'), 'not allowed');
select tests.throws(format('insert into charter.seat_contacts (unit_id, template_id, role_email) values (%L, %L, %L)',
  '22222222-0000-4000-8000-000000000002', (select id from ids where k = 'president'), 'x@a.org'), 'row-level security');
select tests.reset_role();

-- ----- a role email replaces the officer's own (either / or) -----
select tests.as_user('11111111-0000-4000-8000-000000000002');
select charter.set_seat_contact('22222222-0000-4000-8000-000000000002', (select id from ids where k = 'president'), '  President@DemoAustin.xyz ');
select tests.eq((select email || ':' || email_source from charter.org_board_contacts('22222222-0000-4000-8000-000000000002') where title = 'President'),
  'president@demoaustin.xyz:role', 'role email shown instead of the officer''s');
select tests.eq((select count(*) from charter.org_board_contacts('22222222-0000-4000-8000-000000000002') where email = 'a@test.org'),
  0::bigint, 'the officer''s own email is not shown when the seat has a role email');
select tests.throws(format('select charter.set_seat_contact(%L, %L, %L)', '22222222-0000-4000-8000-000000000002',
  (select id from ids where k = 'secretary'), 'not-an-email'), 'valid email');
-- a seat that doesn't apply here
select tests.throws(format('select charter.set_seat_contact(%L, %L, %L)', '22222222-0000-4000-8000-000000000002',
  (select id from ids where k = 'treasurer'), 't@a.org'), 'not allowed');
-- a sibling chapter
select tests.throws(format('select charter.set_seat_contact(%L, %L, %L)', '22222222-0000-4000-8000-000000000003',
  (select id from ids where k = 'president'), 'p@b.org'), 'not allowed');

-- a vacant seat with a role email is still listed; without one it isn't
select charter.end_appointment((select id from charter.appointments where profile_id = '33333333-0000-4000-8000-000000000003'), '', current_date);
select tests.eq((select count(*) from charter.org_board_contacts('22222222-0000-4000-8000-000000000002') where title = 'Secretary'),
  0::bigint, 'vacant seat without a role email left out');
select charter.set_seat_contact('22222222-0000-4000-8000-000000000002', (select id from ids where k = 'secretary'), 'secretary@demoaustin.xyz');
select tests.eq((select coalesce(display_name, '(vacant)') || ':' || email from charter.org_board_contacts('22222222-0000-4000-8000-000000000002') where title = 'Secretary'),
  '(vacant):secretary@demoaustin.xyz', 'vacant seat with a role email listed');

-- clearing goes back to the officer's own email
select charter.set_seat_contact('22222222-0000-4000-8000-000000000002', (select id from ids where k = 'president'), '');
select tests.eq((select email || ':' || email_source from charter.org_board_contacts('22222222-0000-4000-8000-000000000002') where title = 'President'),
  'a@test.org:officer', 'cleared: officer''s own email again');
select tests.reset_role();
select tests.eq((select count(*) from charter.audit_events where target_type = 'seat_contacts') >= 3, true, 'changes audited');

-- ----- an officer without an email; a national admin can set it for a chapter -----
insert into charter.member_profiles (id, unit_id, user_id, display_name, email, source) values
  ('33333333-0000-4000-8000-0000000000a9', '22222222-0000-4000-8000-000000000002', null, 'Walt', '', 'admin');
insert into charter.memberships (unit_id, profile_id, tier_id, term_id, status, joined_on, paid_through) values
  ('22222222-0000-4000-8000-000000000002', '33333333-0000-4000-8000-0000000000a9', '55555555-0000-4000-8000-0000000000a1', '66666666-0000-4000-8000-0000000000a1', 'active', '2020-01-01', current_date + 300);
select tests.as_user('11111111-0000-4000-8000-000000000001');
select charter.set_seat_contact('22222222-0000-4000-8000-000000000002', (select id from ids where k = 'secretary'), null);
select charter.appoint_officer('22222222-0000-4000-8000-000000000002', (select id from ids where k = 'secretary'), '33333333-0000-4000-8000-0000000000a9', current_date);
select tests.eq((select coalesce(email, '-') || ':' || email_source from charter.org_board_contacts('22222222-0000-4000-8000-000000000002') where title = 'Secretary'),
  '-:none', 'officer with no email');
select tests.reset_role();

-- ----- outsiders and anon -----
select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.throws($$select * from charter.org_board_contacts('22222222-0000-4000-8000-000000000002')$$, 'not allowed');
select tests.eq((select count(*) from charter.seat_contacts), 0::bigint, 'outsiders read no contacts');
select tests.reset_role();
set local role anon;
select tests.throws($$select * from charter.org_board_contacts('22222222-0000-4000-8000-000000000002')$$, 'permission denied');
reset role;

rollback;
