-- Seats for an org and its chapters, changing a seat's scope, and the overview numbers (0024)
begin;
select tests.fixture();
-- Region R under the national, with chapter C under it
insert into charter.units (id, parent_id, type, name, slug) values
  ('22222222-0000-4000-8000-000000000091', '22222222-0000-4000-8000-000000000001', 'region', 'Region R', 'reg-r');
insert into charter.units (id, parent_id, type, name, slug) values
  ('22222222-0000-4000-8000-000000000092', '22222222-0000-4000-8000-000000000091', 'chapter', 'Chapter C', 'ch-c');
insert into charter.membership_tiers (id, unit_id, key, name) values
  ('55555555-0000-4000-8000-000000000091', '22222222-0000-4000-8000-000000000001', 'reg', 'Regular');
insert into charter.tier_terms (id, tier_id, unit_id, key, label, length_count, length_unit, price_minor) values
  ('66666666-0000-4000-8000-000000000091', '55555555-0000-4000-8000-000000000091', '22222222-0000-4000-8000-000000000001', '1_year', '1 year', 1, 'year', 2500),
  ('66666666-0000-4000-8000-000000000092', '55555555-0000-4000-8000-000000000091', '22222222-0000-4000-8000-000000000001', 'life', 'Lifetime', null, null, 50000);
-- Members: n (national, lifetime), m (chapter A, current), a (chapter A admin, also a member of
-- the national: one person), Old (A, lapsed), Bea (B, pending), Cal (C, current, no login)
insert into charter.member_profiles (id, unit_id, user_id, display_name, email, source) values
  ('33333333-0000-4000-8000-000000000091', '22222222-0000-4000-8000-000000000002', null, 'Old', '', 'admin'),
  ('33333333-0000-4000-8000-000000000092', '22222222-0000-4000-8000-000000000003', null, 'Bea', '', 'admin'),
  ('33333333-0000-4000-8000-000000000093', '22222222-0000-4000-8000-000000000092', null, 'Cal', '', 'admin'),
  ('33333333-0000-4000-8000-000000000094', '22222222-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000002', 'A at national', 'a@test.org', 'signup');
insert into charter.memberships (unit_id, profile_id, tier_id, term_id, status, joined_on, paid_through, lifetime) values
  ('22222222-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000001', '55555555-0000-4000-8000-000000000091', '66666666-0000-4000-8000-000000000092', 'active', '2015-01-01', null, true),
  ('22222222-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000094', '55555555-0000-4000-8000-000000000091', '66666666-0000-4000-8000-000000000091', 'active', current_date - 5, current_date + 200, false),
  ('22222222-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000002', '55555555-0000-4000-8000-000000000091', '66666666-0000-4000-8000-000000000091', 'active', '2020-01-01', current_date + 200, false),
  ('22222222-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000003', '55555555-0000-4000-8000-000000000091', '66666666-0000-4000-8000-000000000091', 'active', '2020-01-01', current_date + 10, false),
  ('22222222-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000091', '55555555-0000-4000-8000-000000000091', '66666666-0000-4000-8000-000000000091', 'active', '2019-01-01', '2019-12-31', false),
  ('22222222-0000-4000-8000-000000000003', '33333333-0000-4000-8000-000000000092', '55555555-0000-4000-8000-000000000091', '66666666-0000-4000-8000-000000000091', 'pending', null, null, false),
  ('22222222-0000-4000-8000-000000000092', '33333333-0000-4000-8000-000000000093', '55555555-0000-4000-8000-000000000091', '66666666-0000-4000-8000-000000000091', 'active', '2021-01-01', current_date + 100, false);

create temp table ids (k text primary key, id uuid);
grant all on ids to authenticated;

-- ----- a seat for the national and every org below it -----
select tests.as_user('11111111-0000-4000-8000-000000000001');
insert into ids select 'president', charter.define_seat('22222222-0000-4000-8000-000000000001', 'president', 'President', '',
  true, 1, 2, 'year', null, 'self_and_chapters', 1);
insert into ids select 'secretary', charter.define_seat('22222222-0000-4000-8000-000000000001', 'secretary', 'Secretary', '',
  false, 1, null, null, null, 'chapters', 2);
select tests.eq((select string_agg(key, ',' order by key) from charter.org_board('22222222-0000-4000-8000-000000000001')),
  'president', 'national: its own and-chapters seat applies; the chapters-only seat doesn''t');
select tests.eq((select string_agg(key, ',' order by key) from charter.org_board('22222222-0000-4000-8000-000000000002')),
  'president,secretary', 'chapter A: both');
select tests.eq((select string_agg(key, ',' order by key) from charter.org_board('22222222-0000-4000-8000-000000000092')),
  'president,secretary', 'chapter C below a region: both');
select tests.eq((select scope::text from charter.org_board('22222222-0000-4000-8000-000000000001') where key = 'president'),
  'self_and_chapters', 'scope reported');
-- the national and chapter A each fill their own President seat
insert into ids select 'nat_pres', charter.appoint_officer('22222222-0000-4000-8000-000000000001', (select id from ids where k = 'president'),
  '33333333-0000-4000-8000-000000000001', current_date);
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000002');
insert into ids select 'a_pres', charter.appoint_officer('22222222-0000-4000-8000-000000000002', (select id from ids where k = 'president'),
  '33333333-0000-4000-8000-000000000003', current_date);
select tests.eq((select jsonb_array_length(holders) from charter.org_board('22222222-0000-4000-8000-000000000002') where key = 'president'),
  1, 'chapter A''s president is its own');
select tests.eq((select jsonb_array_length(holders) from charter.org_board('22222222-0000-4000-8000-000000000001') where key = 'president'),
  1, 'the national''s president is its own');
-- a chapter can't use the new scope, nor change a seat it doesn't own
select tests.throws($$select charter.define_seat('22222222-0000-4000-8000-000000000002', 'x', 'X', '', false, 1, null, null, null, 'self_and_chapters')$$,
  'only a national or region');
select tests.throws(format('select charter.set_seat_scope(%L, %L)', (select id from ids where k = 'president'), 'self'), 'not allowed');
select tests.reset_role();

-- ----- the governance roll-up counts it at the national and its chapters -----
select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.eq((select string_agg(name || ':' || required_seats, ',' order by depth, name)
  from charter.org_rollup_governance('22222222-0000-4000-8000-000000000001')),
  'Nat:1,Chapter A:1,Chapter B:1,Region R:1,Chapter C:1', 'required seat counted everywhere it applies');

-- ----- changing who uses a seat -----
select tests.throws(format('select charter.set_seat_scope(%L, %L)', (select id from ids where k = 'president'), 'chapters'),
  'no longer be used');
select tests.throws(format('select charter.set_seat_scope(%L, %L)', (select id from ids where k = 'president'), 'self'),
  'no longer be used');
select charter.set_seat_scope((select id from ids where k = 'secretary'), 'self_and_chapters');
select tests.eq((select count(*) from charter.org_board('22222222-0000-4000-8000-000000000001') where key = 'secretary'),
  1::bigint, 'widened: now used at the national too');
select charter.end_appointment((select id from ids where k = 'nat_pres'), 'stepped down', current_date);
select charter.set_seat_scope((select id from ids where k = 'president'), 'chapters');
select tests.eq((select count(*) from charter.org_board('22222222-0000-4000-8000-000000000001') where key = 'president'),
  0::bigint, 'narrowed to chapters once the national''s term ended');
select tests.eq((select count(*) from charter.org_board('22222222-0000-4000-8000-000000000002') where key = 'president'),
  1::bigint, 'chapter A keeps the seat and its president');
select tests.reset_role();
-- a chapter-level org can't be given a chapters scope
select tests.as_user('11111111-0000-4000-8000-000000000002');
insert into ids select 'chaplain', charter.define_seat('22222222-0000-4000-8000-000000000002', 'chaplain', 'Chaplain');
select tests.throws(format('select charter.set_seat_scope(%L, %L)', (select id from ids where k = 'chaplain'), 'self_and_chapters'),
  'only a national or region');
select tests.reset_role();
select tests.eq((select count(*) from charter.audit_events where target_type = 'seat_templates' and action = 'update'
  and target_id = (select id from ids where k = 'secretary')::text) > 0, true, 'scope change audited');

-- ----- overview numbers -----
select tests.as_user('11111111-0000-4000-8000-000000000001');
create temp table s as select * from charter.org_overview_stats('22222222-0000-4000-8000-000000000001');
grant all on s to authenticated;
select tests.eq((select chapters || '/' || orgs_below from s), '3/4', 'national: chapters A, B, C; four orgs below');
-- people: n, a, m, Old, Bea, Cal = 6 (a counted once though in two orgs)
select tests.eq((select roster from s), 6, 'roster counts people once');
-- current: n (lifetime), a, m, Cal = 4; lifetime: n
select tests.eq((select current_members || '/' || lifetime_members from s), '4/1', 'current and lifetime');
-- current memberships at chapters: a@A, m@A, Cal@C = 3 → 1 per chapter
select tests.eq((select chapter_memberships from s), 3, 'current memberships in chapters');
select tests.eq((select pending_members || '/' || joined_30d || '/' || expiring_30 from s), '1/1/1', 'pending, new, expiring');
select tests.reset_role();

-- a chapter admin sees only their chapter; members and outsiders are refused
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.eq((select chapters || '/' || roster || '/' || current_members || '/' || lifetime_members
  from charter.org_overview_stats('22222222-0000-4000-8000-000000000002')), '0/3/2/0', 'chapter A only');
select tests.throws($$select * from charter.org_overview_stats('22222222-0000-4000-8000-000000000001')$$, 'not allowed');
select tests.throws($$select * from charter.org_overview_stats('22222222-0000-4000-8000-000000000003')$$, 'not allowed');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.throws($$select * from charter.org_overview_stats('22222222-0000-4000-8000-000000000002')$$, 'not allowed');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.throws($$select * from charter.org_overview_stats('22222222-0000-4000-8000-000000000002')$$, 'not allowed');
select tests.reset_role();
-- anon can't call it
set local role anon;
select tests.throws($$select * from charter.org_overview_stats('22222222-0000-4000-8000-000000000001')$$, 'permission denied');
reset role;

rollback;
