-- Board seats, each org's own terms, and appointments (E-17, D-141, D-142)
begin;
select tests.fixture();
-- y: limited officer manager at A; z: holds the treasurer role by hand; w: member without a login
insert into auth.users (id, email) values
  ('11111111-0000-4000-8000-000000000021', 'y@test.org'),
  ('11111111-0000-4000-8000-000000000022', 'z@test.org');
insert into public.org_member_profiles (id, org_id, user_id, display_name, email, source) values
  ('33333333-0000-4000-8000-000000000021', '22222222-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000021', 'Yusuf', 'y@test.org', 'signup'),
  ('33333333-0000-4000-8000-000000000022', '22222222-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000022', 'Zoe', 'z@test.org', 'signup'),
  ('33333333-0000-4000-8000-000000000023', '22222222-0000-4000-8000-000000000002', null, 'Walt', '', 'admin');
update public.org_member_profiles set display_name = 'Morgan' where id = '33333333-0000-4000-8000-000000000003';
insert into public.membership_tiers (id, org_id, key, name) values
  ('55555555-0000-4000-8000-000000000041', '22222222-0000-4000-8000-000000000002', 'local', 'Local');
insert into public.tier_terms (id, tier_id, org_id, key, label, length_count, length_unit, price_minor) values
  ('66666666-0000-4000-8000-000000000041', '55555555-0000-4000-8000-000000000041', '22222222-0000-4000-8000-000000000002', '1_year', '1 year', 1, 'year', 2500);
insert into public.memberships (org_id, profile_id, tier_id, term_id, status, joined_on, paid_through)
  select '22222222-0000-4000-8000-000000000002', p, '55555555-0000-4000-8000-000000000041', '66666666-0000-4000-8000-000000000041',
    'active', '2020-01-01', current_date + 300
  from unnest(array['33333333-0000-4000-8000-000000000003', '33333333-0000-4000-8000-000000000021',
    '33333333-0000-4000-8000-000000000022']::uuid[]) p;

create temp table ids (k text primary key, id uuid);
grant all on ids to authenticated;

-- ----- the national defines seats for its chapters -----
select tests.as_user('11111111-0000-4000-8000-000000000001');
insert into ids select 'treasurer_role', public.create_role('22222222-0000-4000-8000-000000000001', 'treasurer', 'Treasurer', '', array['payments.view']);
insert into ids select 'manager_role', public.create_role('22222222-0000-4000-8000-000000000001', 'board_clerk', 'Board clerk', '', array['governance.manage']);
insert into ids select 'president', public.define_seat('22222222-0000-4000-8000-000000000001', 'president', 'President', 'Leads the chapter',
  true, 1, 2, 'year', null, 'chapters', 1);
insert into ids select 'treasurer', public.define_seat('22222222-0000-4000-8000-000000000001', 'treasurer', 'Treasurer', '',
  false, 1, 1, 'year', (select id from ids where k = 'treasurer_role'), 'chapters', 2);
select tests.throws($$select public.define_seat('22222222-0000-4000-8000-000000000001', 'president', 'Again')$$, 'already exists');
select tests.throws($$select public.define_seat('22222222-0000-4000-8000-000000000001', 'odd', 'Odd', '', false, 1, 2, null)$$, 'number and a unit');
select tests.reset_role();

-- ----- a chapter adds its own seat; only nationals and regions define seats for chapters -----
select tests.as_user('11111111-0000-4000-8000-000000000002');
insert into ids select 'chaplain', public.define_seat('22222222-0000-4000-8000-000000000002', 'chaplain', 'Chaplain');
select tests.throws($$select public.define_seat('22222222-0000-4000-8000-000000000002', 'x', 'X', '', false, 1, null, null, null, 'chapters')$$,
  'only a national or region');
select tests.reset_role();
insert into public.org_settings (org_id, key, value, mode)
  values ('22222222-0000-4000-8000-000000000001', 'governance.chapter_extra_seats_allowed', 'false', 'override');
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$select public.define_seat('22222222-0000-4000-8000-000000000002', 'historian', 'Historian')$$, 'parent organization manages board seats');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.throws($$select public.define_seat('22222222-0000-4000-8000-000000000002', 'historian', 'Historian')$$, 'not allowed');
select tests.throws($$insert into public.seat_templates (org_id, key, title) values ('22222222-0000-4000-8000-000000000002', 'h', 'H')$$, 'row-level security');

-- ----- which seats apply where -----
select tests.eq((select string_agg(key, ',' order by key) from public.org_board('22222222-0000-4000-8000-000000000002')),
  'chaplain,president,treasurer', 'A: national seats plus its own');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.eq((select string_agg(key, ',' order by key) from public.org_board('22222222-0000-4000-8000-000000000003')),
  'president,treasurer', 'B: national seats only');
select tests.eq((select count(*) from public.org_board('22222222-0000-4000-8000-000000000001')), 0::bigint, 'chapter seats don''t apply at the national');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.throws($$select * from public.org_board('22222222-0000-4000-8000-000000000002')$$, 'not allowed');
select tests.reset_role();

-- ----- each org's own term, with its by-law history -----
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.eq((select term_count || ' ' || term_unit || ' ' || term_source from public.org_board('22222222-0000-4000-8000-000000000002') where key = 'president'),
  '2 year default', 'the national''s suggested default until the chapter sets its own');
select public.set_seat_term('22222222-0000-4000-8000-000000000002', (select id from ids where k = 'president'), 1, 'year', '2020-01-01', 'Bylaws Art. IV §2');
select tests.eq((select term_count || ' ' || term_unit || ' ' || term_source || ' ' || bylaw_reference
  from public.org_board('22222222-0000-4000-8000-000000000002') where key = 'president'),
  '1 year org Bylaws Art. IV §2', 'the chapter''s own term');
select tests.throws($$select public.set_seat_term('22222222-0000-4000-8000-000000000002', (select id from ids where k = 'president'), 1, null, '2020-01-01')$$, 'number and a unit');
select tests.throws($$select public.set_seat_term('22222222-0000-4000-8000-000000000003', (select id from ids where k = 'president'), 3, 'year', '2020-01-01')$$, 'not allowed');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.eq((select term_count from public.org_board('22222222-0000-4000-8000-000000000003') where key = 'president'), 2, 'B keeps the default');
select tests.reset_role();

-- ----- appointing: the term in force on the start date sets the planned end -----
select tests.as_user('11111111-0000-4000-8000-000000000002');
insert into ids select 'm_president', public.appoint_officer('22222222-0000-4000-8000-000000000002', (select id from ids where k = 'president'),
  '33333333-0000-4000-8000-000000000003', '2024-03-01');
select tests.eq((select planned_end from public.appointments where id = (select id from ids where k = 'm_president')), '2025-02-28'::date, 'one-year term');
select tests.throws($$select public.appoint_officer('22222222-0000-4000-8000-000000000002', (select id from ids where k = 'president'),
  '33333333-0000-4000-8000-000000000021')$$, 'all seats are filled');
select tests.throws($$select public.appoint_officer('22222222-0000-4000-8000-000000000002', (select id from ids where k = 'president'),
  '33333333-0000-4000-8000-000000000003')$$, 'already holds');
select tests.throws($$select public.appoint_officer('22222222-0000-4000-8000-000000000003', (select id from ids where k = 'president'),
  '33333333-0000-4000-8000-000000000003')$$, 'not allowed');
select tests.throws($$select public.appoint_officer('22222222-0000-4000-8000-000000000002', (select id from ids where k = 'president'),
  '33333333-0000-4000-8000-000000000001')$$, 'not a member');

-- a by-law change: future appointments use it, current officers keep their planned end...
select public.set_seat_term('22222222-0000-4000-8000-000000000002', (select id from ids where k = 'president'), 2, 'year', '2025-01-01',
  'Bylaws Art. IV §2, amended 2025', 'Two-year terms');
select tests.eq((select planned_end from public.appointments where id = (select id from ids where k = 'm_president')), '2025-02-28'::date, 'unchanged');
select tests.eq((select count(*) from public.seat_terms where org_id = '22222222-0000-4000-8000-000000000002'), 2::bigint, 'old rule kept');
-- ...unless the admin applies it to current officers
select tests.eq(public.recalculate_planned_ends('22222222-0000-4000-8000-000000000002', (select id from ids where k = 'president')), 1, 'one officer updated');
select tests.eq((select planned_end from public.appointments where id = (select id from ids where k = 'm_president')), '2026-02-28'::date, 'two-year term');
select tests.reset_role();
select tests.eq((select count(*) from public.audit_events where action = 'recalculate'), 1::bigint, 'recalculation logged');
select tests.throws($$update public.seat_terms set length_count = 5$$, 'can''t be changed');
select tests.throws($$delete from public.seat_terms$$, 'can''t be changed');

-- ----- the seat's role: granted by the appointment, without escalation -----
select tests.as_user('11111111-0000-4000-8000-000000000002');
insert into ids select 'm_treasurer', public.appoint_officer('22222222-0000-4000-8000-000000000002', (select id from ids where k = 'treasurer'),
  '33333333-0000-4000-8000-000000000003');
select tests.reset_role();
select tests.eq(public.has_permission('11111111-0000-4000-8000-000000000003', 'payments.view', '22222222-0000-4000-8000-000000000002'), true, 'role granted');
select tests.eq((select ra.source from public.appointments a join public.role_assignments ra on ra.id = a.role_assignment_id
  where a.id = (select id from ids where k = 'm_treasurer')), 'seat', 'created by the seat');
-- y can appoint but doesn't hold payments.view, so can't hand out the treasurer role
insert into public.role_assignments (user_id, role_id, org_id) values
  ('11111111-0000-4000-8000-000000000021', (select id from ids where k = 'manager_role'), '22222222-0000-4000-8000-000000000002');
select tests.as_user('11111111-0000-4000-8000-000000000001');
select public.update_seat((select id from ids where k = 'treasurer'), 'Treasurer', '', false, 2, 1, 'year', (select id from ids where k = 'treasurer_role'), 2);
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000021');
select tests.throws($$select public.appoint_officer('22222222-0000-4000-8000-000000000002', (select id from ids where k = 'treasurer'),
  '33333333-0000-4000-8000-000000000022')$$, 'permissions you hold');
select tests.reset_role();

-- z already holds the role by hand: the appointment doesn't take it over
insert into public.role_assignments (user_id, role_id, org_id, source) values
  ('11111111-0000-4000-8000-000000000022', (select id from ids where k = 'treasurer_role'), '22222222-0000-4000-8000-000000000002', 'manual');
select tests.as_user('11111111-0000-4000-8000-000000000002');
insert into ids select 'z_treasurer', public.appoint_officer('22222222-0000-4000-8000-000000000002', (select id from ids where k = 'treasurer'),
  '33333333-0000-4000-8000-000000000022');
select tests.eq((select seat_number from public.appointments where id = (select id from ids where k = 'z_treasurer')), 2, 'second seat');
select tests.eq((select role_assignment_id from public.appointments where id = (select id from ids where k = 'z_treasurer')), null::uuid, 'role not owned');
select tests.throws($$select public.update_seat((select id from ids where k = 'treasurer'), 'Treasurer', '', false, 1, 1, 'year', null, 2)$$, 'not allowed');

-- ending takes away only what the appointment granted
select public.end_appointment((select id from ids where k = 'z_treasurer'), 'Resigned');
select public.end_appointment((select id from ids where k = 'm_treasurer'), 'Term over');
select tests.throws($$select public.end_appointment((select id from ids where k = 'm_treasurer'))$$, 'already ended');
select tests.reset_role();
select tests.eq(public.has_permission('11111111-0000-4000-8000-000000000022', 'payments.view', '22222222-0000-4000-8000-000000000002'), true, 'manual role kept');
select tests.eq(public.has_permission('11111111-0000-4000-8000-000000000003', 'payments.view', '22222222-0000-4000-8000-000000000002'), false, 'seat role removed');
select tests.eq((select count(*) from public.role_assignments where user_id = '11111111-0000-4000-8000-000000000003'), 1::bigint, 'member role still there');

-- history is kept and can't be rewritten
select tests.throws($$delete from public.appointments$$, 'can''t be deleted');
select tests.throws($$update public.appointments set profile_id = '33333333-0000-4000-8000-000000000021'$$, 'can''t be changed');
select tests.throws($$update public.appointments set end_reason = 'x' where ended_on is not null$$, 'ended appointment');
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.eq((select count(*) from public.board_history('22222222-0000-4000-8000-000000000002')), 2::bigint, 'two past officers');
select tests.eq((select holders -> 0 ->> 'display_name' from public.org_board('22222222-0000-4000-8000-000000000002') where key = 'president'),
  'Morgan', 'current holder shown');
select tests.throws($$insert into public.appointments (org_id, template_id, profile_id, seat_number, starts_on)
  values ('22222222-0000-4000-8000-000000000002', (select id from ids where k = 'chaplain'), '33333333-0000-4000-8000-000000000003', 1, current_date)$$,
  'row-level security');
select tests.reset_role();

-- ----- officers in good standing (D-056) -----
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$select public.appoint_officer('22222222-0000-4000-8000-000000000002', (select id from ids where k = 'chaplain'),
  '33333333-0000-4000-8000-000000000023')$$, 'good standing');
select tests.throws($$select public.set_seat_active((select id from ids where k = 'president'), false)$$, 'not allowed');
select tests.reset_role();
insert into public.org_settings (org_id, key, value, mode)
  values ('22222222-0000-4000-8000-000000000002', 'governance.officers_good_standing', 'false', 'override');
select tests.as_user('11111111-0000-4000-8000-000000000002');
select public.appoint_officer('22222222-0000-4000-8000-000000000002', (select id from ids where k = 'chaplain'), '33333333-0000-4000-8000-000000000023');
select tests.throws($$select public.set_seat_active((select id from ids where k = 'chaplain'), false)$$, 'end the current appointments');

-- ----- custom titles for inherited seats (D-071) -----
select public.set_seat_title('22222222-0000-4000-8000-000000000002', (select id from ids where k = 'president'), 'Commander');
select tests.eq((select title || '/' || default_title from public.org_board('22222222-0000-4000-8000-000000000002') where key = 'president'),
  'Commander/President', 'custom title');
select tests.throws($$select public.set_seat_title('22222222-0000-4000-8000-000000000002', (select id from ids where k = 'chaplain'), 'Padre')$$, 'seat editor');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.eq((select title from public.org_board('22222222-0000-4000-8000-000000000003') where key = 'president'), 'President', 'B unaffected');
select tests.reset_role();
insert into public.org_settings (org_id, key, value, mode)
  values ('22222222-0000-4000-8000-000000000001', 'governance.custom_titles_allowed', 'false', 'override');
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$select public.set_seat_title('22222222-0000-4000-8000-000000000002', (select id from ids where k = 'president'), 'Chief')$$, 'sets the seat titles');
select public.set_seat_title('22222222-0000-4000-8000-000000000002', (select id from ids where k = 'president'), '');
select tests.eq((select title from public.org_board('22222222-0000-4000-8000-000000000002') where key = 'president'), 'President', 'back to the default');
select tests.reset_role();

rollback;
