-- Integration views (S-03, spec §3.6): read-only, the caller's own row security, and the
-- right rows (the tree, filled seats only, active units counted).
begin;
select tests.fixture();

select tests.eq((select bool_and(c.reloptions @> array['security_invoker=true']) from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'charter' and c.relname in ('api_units', 'api_board_seats', 'api_unit_count')),
  true, 'every view runs with the caller''s rights (security_invoker)');

-- A seat at Chapter A with a current holder, and one whose term has ended.
insert into charter.seat_templates (id, unit_id, key, title, required) values
  ('44444444-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'president', 'President', true);
update charter.member_profiles set display_name = 'Avery Admin' where id = '33333333-0000-4000-8000-000000000002';
insert into charter.appointments (unit_id, template_id, profile_id, seat_number, starts_on) values
  ('22222222-0000-4000-8000-000000000002', '44444444-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000002', 1, '2026-01-01');
insert into charter.appointments (unit_id, template_id, profile_id, seat_number, starts_on, ended_on) values
  ('22222222-0000-4000-8000-000000000002', '44444444-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000003', 1, '2025-01-01', '2025-12-31');

-- The national's owner reads the whole tree.
select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.eq((select count(*) from charter.api_units where org_id = '22222222-0000-4000-8000-000000000001'), 3::bigint,
  'the owner sees the national and both chapters');
select tests.eq((select units from charter.api_unit_count where org_id = '22222222-0000-4000-8000-000000000001'), 3,
  'three active units');
select tests.eq((select count(*) from charter.api_board_seats where unit_id = '22222222-0000-4000-8000-000000000002'), 1::bigint,
  'ended appointments are left out');
select tests.eq((select title || ': ' || holder_name from charter.api_board_seats), 'President: Avery Admin',
  'seat title and holder');
select tests.throws($$update charter.api_units set name = 'x'$$, '');
select tests.reset_role();

-- A unit's own title for the seat wins.
insert into charter.seat_title_overrides (unit_id, template_id, title) values
  ('22222222-0000-4000-8000-000000000002', '44444444-0000-4000-8000-000000000001', 'Chapter Chair');
select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.eq((select title from charter.api_board_seats), 'Chapter Chair', 'the unit''s seat title override');
select tests.reset_role();

-- Someone outside the organization sees nothing.
select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.eq((select count(*) from charter.api_units where org_id = '22222222-0000-4000-8000-000000000001'), 0::bigint,
  'an outsider sees no units');
select tests.eq((select count(*) from charter.api_board_seats), 0::bigint, 'an outsider sees no seats');
select tests.eq((select count(*) from charter.api_unit_count), 0::bigint, 'an outsider counts no units');
select tests.reset_role();
rollback;
