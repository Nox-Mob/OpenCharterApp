-- 0037 (Sprint 4): remove/restore records, the membership check, the readable audit log,
-- member import, and helpers closed to anonymous callers.
begin;
select tests.fixture();
insert into charter.membership_tiers (id, unit_id, key, name) values
  ('55555555-0000-4000-8000-0000000000f1', '22222222-0000-4000-8000-000000000002', 'reg', 'Regular');
insert into charter.tier_terms (id, tier_id, unit_id, key, label, length_count, length_unit, price_minor) values
  ('66666666-0000-4000-8000-0000000000f1', '55555555-0000-4000-8000-0000000000f1', '22222222-0000-4000-8000-000000000002', '1_year', '1 year', 1, 'year', 2500),
  ('66666666-0000-4000-8000-0000000000f2', '55555555-0000-4000-8000-0000000000f1', '22222222-0000-4000-8000-000000000002', 'life', 'Lifetime', null, null, 50000);
insert into charter.attribute_definitions (id, unit_id, applies_to, key, label, data_type) values
  ('77777777-0000-4000-8000-0000000000f1', '22222222-0000-4000-8000-000000000002', 'member', 'branch', 'Branch', 'text');
-- the member (m) has an active membership and holds a seat with a role
insert into charter.memberships (unit_id, profile_id, tier_id, term_id, status, joined_on, paid_through) values
  ('22222222-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000003',
   '55555555-0000-4000-8000-0000000000f1', '66666666-0000-4000-8000-0000000000f1', 'active', current_date - 10, current_date + 300);

-- ===== U7: helpers closed to anonymous callers =====
set local role anon;
select tests.throws($$select charter.has_permission('11111111-0000-4000-8000-000000000001', 'org.view', '22222222-0000-4000-8000-000000000001')$$, 'permission denied');
select tests.throws($$select charter.is_org_member('11111111-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001')$$, 'permission denied');
-- public join pages still work (definer functions call the helpers themselves)
select tests.eq((charter.public_join_info('ch-a')->'org'->>'name'), 'Chapter A', 'join page info for anyone');
reset role;

-- ===== U2: remove from roster / restore =====
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.eq(charter.is_org_member('11111111-0000-4000-8000-000000000003', '22222222-0000-4000-8000-000000000002'), true, 'member before');
select tests.throws($$select charter.remove_member_record('33333333-0000-4000-8000-000000000003', '')$$, 'not allowed');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.throws($$select charter.remove_member_record('33333333-0000-4000-8000-000000000003', '')$$, 'not allowed');
select tests.reset_role();
-- the chapter admin can't remove themselves, nor someone holding a role given by hand
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$select charter.remove_member_record('33333333-0000-4000-8000-000000000002', '')$$, 'remove yourself');
select tests.reset_role();
insert into charter.role_assignments (user_id, role_id, unit_id, source)
  select '11111111-0000-4000-8000-000000000003', id, '22222222-0000-4000-8000-000000000002', 'manual'
  from charter.roles where key = 'org_admin' and unit_id is null;
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$select charter.remove_member_record('33333333-0000-4000-8000-000000000003', '')$$, 'they hold a role here');
select tests.reset_role();
delete from charter.role_assignments where user_id = '11111111-0000-4000-8000-000000000003'
  and role_id = (select id from charter.roles where key = 'org_admin' and unit_id is null);
select tests.as_user('11111111-0000-4000-8000-000000000002');
select charter.remove_member_record('33333333-0000-4000-8000-000000000003', 'Duplicate record');
select tests.reset_role();
select tests.eq((select left_at is not null from charter.member_profiles where id = '33333333-0000-4000-8000-000000000003'), true, 'left');
select tests.eq((select status::text from charter.memberships where profile_id = '33333333-0000-4000-8000-000000000003'), 'cancelled', 'membership ended');
select tests.eq((select note from charter.membership_events where kind = 'cancelled' order by created_at desc limit 1),
  'Removed from the roster. Duplicate record', 'history says why');
select tests.eq((select count(*) from charter.role_assignments where user_id = '11111111-0000-4000-8000-000000000003'
  and unit_id = '22222222-0000-4000-8000-000000000002'), 0::bigint, 'member role removed');
select tests.eq(charter.is_org_member('11111111-0000-4000-8000-000000000003', '22222222-0000-4000-8000-000000000002'), false, 'no longer a member');
select tests.eq((select after->>'reason' from charter.audit_events where action = 'remove'), 'Duplicate record', 'audited with the reason');
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$select charter.remove_member_record('33333333-0000-4000-8000-000000000003', '')$$, 'already removed');
select charter.restore_member_record('33333333-0000-4000-8000-000000000003');
select tests.reset_role();
select tests.eq(charter.is_org_member('11111111-0000-4000-8000-000000000003', '22222222-0000-4000-8000-000000000002'), true, 'restored');
select tests.eq((select count(*) from charter.role_assignments where user_id = '11111111-0000-4000-8000-000000000003'
  and unit_id = '22222222-0000-4000-8000-000000000002'), 1::bigint, 'member role back');
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$select charter.restore_member_record('33333333-0000-4000-8000-000000000003')$$, 'on the roster');
select tests.reset_role();

-- ===== U1: import =====
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.throws($$select charter.import_members('22222222-0000-4000-8000-000000000002', '[]', false)$$, 'not allowed');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000002');
create temp table r1 as select charter.import_members('22222222-0000-4000-8000-000000000002', '[
  {"row": 2, "name": "Ann Lee", "email": "ANN@x.org", "level": "Regular", "term": "1 year", "joined_on": "2020-05-01", "paid_through": "2027-04-30",
   "fields": {"77777777-0000-4000-8000-0000000000f1": "Navy"}},
  {"row": 3, "name": "Bo", "email": "", "level": "regular", "term": "Lifetime", "joined_on": "2001-01-01"},
  {"row": 4, "name": "", "email": "m@test.org"},
  {"row": 5, "name": "Cy", "email": "cy@x.org", "level": "Gold"},
  {"row": 6, "name": "Di", "email": "bad-email"},
  {"row": 7, "name": "Ann again", "email": "ann@x.org"},
  {"row": 8, "name": "Ed", "level": "Regular", "term": "1 year"},
  {"row": 9, "name": "Flo", "level": "Regular", "term": "1 year", "joined_on": "05/01/2020", "paid_through": "2027-01-01"},
  {"row": 10, "name": "Gus", "chapter": "Chapter B"}
]'::jsonb, true) as v;
select tests.eq((select (v->>'applied')::boolean from r1), false, 'errors: nothing applied');
select tests.eq((select string_agg(e->>'row', ',' order by (e->>'row')::int) from r1, jsonb_array_elements(v->'errors') e),
  '5,6,7,8,9,10', 'each bad row reported');
select tests.eq((select e->>'message' from r1, jsonb_array_elements(v->'errors') e where e->>'row' = '5'), 'there''s no active level called "Gold"', 'unknown level');
select tests.eq((select e->>'message' from r1, jsonb_array_elements(v->'errors') e where e->>'row' = '7'), 'this member is already in the file', 'duplicate in file');
select tests.eq((select e->>'message' from r1, jsonb_array_elements(v->'errors') e where e->>'row' = '8'), 'a 1 year membership needs a paid-through date', 'paid through needed');
select tests.eq((select e->>'message' from r1, jsonb_array_elements(v->'errors') e where e->>'row' = '9'), 'write dates as YYYY-MM-DD', 'date format');
select tests.eq((select e->>'message' from r1, jsonb_array_elements(v->'errors') e where e->>'row' = '10'), 'chapters are only imported in the home-chapter model', 'chapter only in home model');
select tests.eq((select count(*) from charter.member_profiles where email = 'ann@x.org'), 0::bigint, 'nothing written');
-- a clean file: preview, then apply
create temp table rows2 as select '[
  {"row": 2, "name": "Ann Lee", "email": "ANN@x.org", "level": "Regular", "term": "1 year", "joined_on": "2020-05-01", "paid_through": "2027-04-30",
   "fields": {"77777777-0000-4000-8000-0000000000f1": "Navy"}},
  {"row": 3, "name": "Bo", "email": "", "level": "regular", "term": "Lifetime", "joined_on": "2001-01-01"},
  {"row": 4, "name": "", "email": "m@test.org"}
]'::jsonb as j;
select tests.eq((select charter.import_members('22222222-0000-4000-8000-000000000002', j, false)->>'create' from rows2), '2', 'preview: two new');
select tests.eq((select count(*) from charter.member_profiles where email = 'ann@x.org'), 0::bigint, 'preview writes nothing');
select tests.eq((select charter.import_members('22222222-0000-4000-8000-000000000002', j, true)->>'applied' from rows2), 'true', 'applied');
select tests.reset_role();
select tests.eq((select m.paid_through::text || '/' || m.status from charter.memberships m join charter.member_profiles p on p.id = m.profile_id
  where p.email = 'ann@x.org'), '2027-04-30/active', 'imported membership');
select tests.eq((select m.lifetime from charter.memberships m join charter.member_profiles p on p.id = m.profile_id
  where p.display_name = 'Bo'), true, 'lifetime');
select tests.eq((select v.value #>> '{}' from charter.attribute_values v join charter.member_profiles p on p.id = v.entity_id
  where p.email = 'ann@x.org'), 'Navy', 'field set');
select tests.eq((select source from charter.member_profiles where email = 'ann@x.org'), 'import', 'source import');
select tests.eq((select count(*) from charter.payments where unit_id = '22222222-0000-4000-8000-000000000002'), 0::bigint, 'no payment invented');
select tests.eq((select after->>'created' from charter.audit_events where action = 'import'), '2', 'audited');
-- running the same file again updates; nothing is duplicated
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.eq((select charter.import_members('22222222-0000-4000-8000-000000000002', j, true)->>'update' from rows2), '3', 'all matched');
select tests.reset_role();
select tests.eq((select count(*) from charter.member_profiles where unit_id = '22222222-0000-4000-8000-000000000002'), 4::bigint, 'no duplicates');
-- a sibling chapter's admin can't import here
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$select charter.import_members('22222222-0000-4000-8000-000000000003', '[]', false)$$, 'not allowed');
select tests.reset_role();

-- ===== U3: the audit log =====
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.throws($$select * from charter.audit_log('22222222-0000-4000-8000-000000000002')$$, 'not allowed');
select tests.reset_role();
-- a setup draft is hidden; an applied setup is shown
insert into charter.setup_states (unit_id, flow_id, answers) values ('22222222-0000-4000-8000-000000000002', 'membership', '{"a": 1}');
update charter.setup_states set answers = '{"a": 2}' where unit_id = '22222222-0000-4000-8000-000000000002';
update charter.setup_states set status = 'applied', applied_at = now() where unit_id = '22222222-0000-4000-8000-000000000002';
select tests.as_user('11111111-0000-4000-8000-000000000002');
create temp table log as select * from charter.audit_log('22222222-0000-4000-8000-000000000002');
select tests.eq((select count(*) from log where target_type = 'setup_states'), 1::bigint, 'only the applied setup');
select tests.eq((select actor_name from log where action = 'remove'), 'a@test.org', 'who: their email when they have no name');
select tests.eq((select refs->>'definition_id' from log where target_type = 'attribute_values' limit 1), 'Branch', 'names for referenced records');
select tests.eq((select bool_and(tx_id is not null) from log), true, 'new events carry their transaction');
select tests.eq((select count(distinct tx_id) from log where action = 'import'), 1::bigint, 'one import, one transaction');
select tests.eq((select count(*) from log where coalesce(after, before) ? 'token_hash'), 0::bigint, 'token hashes never shown');
select tests.reset_role();
-- each org sees only its own events: the national admin sees none of Chapter A's
select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.eq((select count(*) from charter.audit_log('22222222-0000-4000-8000-000000000001') where target_type = 'org_member_profiles'
  and target_id = '33333333-0000-4000-8000-000000000003'), 0::bigint, 'no events from below');
select tests.reset_role();
-- ===== U4: member records follow a confirmed new sign-in email =====
update auth.users set email = 'Morgan.New@test.org' where id = '11111111-0000-4000-8000-000000000003';
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.eq(charter.sync_my_email(), 1, 'one record updated');
select tests.eq(charter.sync_my_email(), 0, 'nothing left to update');
select tests.reset_role();
select tests.eq((select email from charter.member_profiles where id = '33333333-0000-4000-8000-000000000003'), 'morgan.new@test.org', 'email follows');
select tests.eq((select email from charter.member_profiles where id = '33333333-0000-4000-8000-000000000002'), 'a@test.org', 'others untouched');
set local role anon;
select tests.throws($$select charter.sync_my_email()$$, 'permission denied');
reset role;
rollback;
