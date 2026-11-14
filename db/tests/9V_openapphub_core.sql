-- Charter on the OpenAppHub core (spec §3.4, §3.9, §4.3, §4.5, §6.3): the customer on
-- every row, core roles around Charter's permissions, read-only when the plan lapses
-- (payments still recorded), organizations from the hub, core invitations, deletion.
begin;
select tests.fixture();

-- The national is the core organization; its units carry it as org_id.
select tests.eq((select org_id from charter.units where id = '22222222-0000-4000-8000-000000000001'),
  '22222222-0000-4000-8000-000000000001'::uuid, 'the top unit is its organization');
select tests.eq((select org_id from charter.units where id = '22222222-0000-4000-8000-000000000002'),
  '22222222-0000-4000-8000-000000000001'::uuid, 'a chapter belongs to the national''s organization');
select tests.eq((select org_id from charter.member_profiles where id = '33333333-0000-4000-8000-000000000003'),
  '22222222-0000-4000-8000-000000000001'::uuid, 'rows carry the customer');

-- Core roles around Charter's permissions.
select tests.eq((select count(*) from public.memberships where org_id = '22222222-0000-4000-8000-000000000001'
  and user_id = '11111111-0000-4000-8000-000000000003'), 0::bigint, 'a dues member has no core membership');
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.eq(charter.is_portal_member('22222222-0000-4000-8000-000000000001', null), true, 'the dues member is a portal member');
select tests.reset_role();
-- H-09: an OpenAppHub admin isn't an OpenCharterApp admin by itself; an OpenCharterApp admin
-- (set on the hub, without any Charter role) holds org_admin's permissions in the whole tree.
insert into auth.users (id, email) values ('11111111-0000-4000-8000-000000000005', 'coreadmin@test.org');
insert into public.memberships (org_id, user_id, role) values
  ('22222222-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000005', 'admin');
select tests.eq(charter.has_permission('11111111-0000-4000-8000-000000000005', 'members.manage', '22222222-0000-4000-8000-000000000003'),
  false, 'an OpenAppHub admin alone has no Charter permissions');
insert into public.app_role_overrides (org_id, user_id, app, role) values
  ('22222222-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000005', 'charter', 'admin');
select tests.eq(charter.has_permission('11111111-0000-4000-8000-000000000005', 'members.manage', '22222222-0000-4000-8000-000000000003'),
  true, 'an OpenCharterApp admin manages members anywhere in the tree');
select tests.eq((select role::text from public.memberships where org_id = '22222222-0000-4000-8000-000000000001'
  and user_id = '11111111-0000-4000-8000-000000000005'), 'admin', 'and the OpenAppHub role is untouched');
-- A chapter admin made a viewer in OpenCharterApp loses staff permissions.
insert into public.app_role_overrides (org_id, user_id, app, role) values
  ('22222222-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000002', 'charter', 'viewer')
on conflict (org_id, user_id, app) do update set role = 'viewer';
select tests.eq(charter.has_permission('11111111-0000-4000-8000-000000000002', 'members.manage', '22222222-0000-4000-8000-000000000002'),
  false, 'a viewer in OpenCharterApp can''t use staff permissions');
update public.app_role_overrides set role = 'member' where org_id = '22222222-0000-4000-8000-000000000001'
  and user_id = '11111111-0000-4000-8000-000000000002' and app = 'charter';
-- A named role grants a Charter permission across the organization, without a unit role.
insert into auth.users (id, email) values ('11111111-0000-4000-8000-0000000000a6', 'named@test.org');
insert into public.org_named_roles (id, org_id, name, app_roles, permissions) values
  ('77777777-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001', 'Payments clerk',
   '{"charter":"member"}', '{"charter":["payments.view"]}');
insert into public.memberships (org_id, user_id, role, named_role_id) values
  ('22222222-0000-4000-8000-000000000001', '11111111-0000-4000-8000-0000000000a6', 'member', '77777777-0000-4000-8000-000000000001');
select tests.eq(charter.has_permission('11111111-0000-4000-8000-0000000000a6', 'payments.view', '22222222-0000-4000-8000-000000000003'),
  true, 'a named role''s permission applies in every unit');
select tests.eq(charter.has_permission('11111111-0000-4000-8000-0000000000a6', 'members.manage', '22222222-0000-4000-8000-000000000003'),
  false, 'and only that permission');
select tests.as_user('11111111-0000-4000-8000-0000000000a6');
select tests.eq((select count(*) > 0 from charter.permitted_units('payments.view')), true, 'permitted_units follows it too');
select tests.reset_role();
-- Giving someone a staff role makes them a core member.
select tests.as_user('11111111-0000-4000-8000-000000000002');
select charter.create_role('22222222-0000-4000-8000-000000000002', 'helper', 'Helper', '', array['members.view']);
select charter.assign_role('22222222-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000003', 'helper');
select tests.reset_role();
select tests.eq((select role::text from public.memberships where org_id = '22222222-0000-4000-8000-000000000001'
  and user_id = '11111111-0000-4000-8000-000000000003'), 'member', 'staff get a core membership');
select tests.eq(public.app_role('22222222-0000-4000-8000-000000000001', 'charter', '11111111-0000-4000-8000-000000000003')::text,
  'member', 'and are members in OpenCharterApp (not elsewhere)');
select tests.eq(public.app_role('22222222-0000-4000-8000-000000000001', 'ledger', '11111111-0000-4000-8000-000000000003')::text,
  'viewer', 'viewers in the other apps');

-- Read-only when the plan doesn't include Charter: no writes, no new joins; payments
-- members already made are still recorded.
create schema if not exists billing;
create table billing.test_lapsed (org_id uuid primary key);
insert into billing.test_lapsed values ('22222222-0000-4000-8000-000000000001');
create function billing.org_has_app_access(p_org uuid, p_app text) returns boolean language sql stable
  security definer set search_path = '' as $f$ select not exists (select 1 from billing.test_lapsed l where l.org_id = p_org) $f$;
update public.instance_settings set billing_enabled = true;
select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.throws($$update charter.units set name = 'Renamed while lapsed' where id = '22222222-0000-4000-8000-000000000002'$$, 'read-only');
select tests.throws($$select charter.admin_create_member('22222222-0000-4000-8000-000000000002', 'New Person')$$, 'read-only');
select tests.eq((select count(*) from charter.member_profiles where unit_id = '22222222-0000-4000-8000-000000000002'), 2::bigint,
  'read-only: everything stays readable');
select tests.reset_role();
-- A payment path (it sets charter.payment_recording) may still write.
select set_config('charter.payment_recording', 'on', true);
insert into charter.audit_events (unit_id, action, target_type) values ('22222222-0000-4000-8000-000000000002', 'insert', 'payment_record_check');
select set_config('charter.payment_recording', '', true);
select tests.eq((select org_id from charter.audit_events where target_type = 'payment_record_check'),
  '22222222-0000-4000-8000-000000000001'::uuid, 'payment recording still writes while read-only');
delete from billing.test_lapsed;
update public.instance_settings set billing_enabled = false;

-- An organization created in the hub opens in Charter once its owner sets up the top unit.
insert into auth.users (id, email) values ('11111111-0000-4000-8000-000000000006', 'hubowner@test.org');
select tests.as_user('11111111-0000-4000-8000-000000000006');
select public.create_organization('Hub Association') as hub_org \gset
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.throws(format($$select charter.ensure_top_unit(%L)$$, :'hub_org'), 'Only the owner or an OpenCharterApp admin');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000006');
select tests.eq(charter.ensure_top_unit(:'hub_org', 'standalone', 'hub-assoc'), :'hub_org'::uuid, 'the top unit has the organization''s id');
select tests.eq(charter.has_permission(auth.uid(), 'org.manage', :'hub_org'), true, 'the owner manages it in Charter');
select tests.eq(charter.ensure_top_unit(:'hub_org'), :'hub_org'::uuid, 'setting up twice is harmless');
select tests.reset_role();

-- Core invitations: one made in the hub for a chapter's dues member (no core role).
insert into auth.users (id, email) values ('11111111-0000-4000-8000-000000000007', 'newmember@test.org');
select tests.as_user('11111111-0000-4000-8000-000000000001');
select invitation_id as inv, token as tok from public.create_invitation('22222222-0000-4000-8000-000000000001',
  'newmember@test.org', null, 'charter', '{"unit_id":"22222222-0000-4000-8000-000000000002","role_key":"member"}', 14) \gset
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000007');
select public.accept_invitation(:'tok');
select tests.eq(charter.on_invitation_accepted(:'inv'), '22222222-0000-4000-8000-000000000002'::uuid, 'joined chapter A');
select tests.eq(charter.is_org_member(auth.uid(), '22222222-0000-4000-8000-000000000002'), true, 'a member record in chapter A');
select tests.eq(public.is_member('22222222-0000-4000-8000-000000000001'), false, 'a portal member only, not a core member');
select tests.reset_role();

-- Deleting the organization (core, owner) removes everything in Charter.
select tests.as_user('11111111-0000-4000-8000-000000000001');
-- "Confirm it's you" (core 0019): a session that just typed its password makes the pass.
select set_config('request.jwt.claims', json_build_object('sub', '11111111-0000-4000-8000-000000000001', 'role', 'authenticated', 'amr', json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint)))::text, true);
select public.delete_organization('22222222-0000-4000-8000-000000000001', 'Nat', public.begin_reauth('delete_organization'));
select tests.reset_role();
select tests.eq((select count(*) from charter.units where org_id = '22222222-0000-4000-8000-000000000001')
  + (select count(*) from charter.member_profiles where org_id = '22222222-0000-4000-8000-000000000001')
  + (select count(*) from charter.role_assignments where org_id = '22222222-0000-4000-8000-000000000001'), 0::bigint,
  'deleting the organization removes its units, members and roles');

-- Self-hosted (billing off): the public join page's lookups are open to anon.
select tests.eq(has_function_privilege('anon', 'charter.public_join_info(text)', 'execute'), true, 'self-hosted join page works');
select tests.eq(has_function_privilege('anon', 'charter.begin_join(uuid, uuid, jsonb)', 'execute'), false, 'nothing else for anon');
rollback;
