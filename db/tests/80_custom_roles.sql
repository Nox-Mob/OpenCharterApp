-- Org-defined custom roles (E-05): inheritance, no escalation, retire not delete
begin;
select tests.fixture();

-- national admin defines a role; it applies to chapters too (D-032)
select tests.as_user('11111111-0000-4000-8000-000000000001');
select public.create_role('22222222-0000-4000-8000-000000000001', 'treasurer', 'Treasurer', 'Handles money', array['members.view','audit.view']);
select public.create_role('22222222-0000-4000-8000-000000000001', 'role_manager', 'Role manager', '', array['roles.manage','members.view']);
-- reserved and duplicate keys are rejected
select tests.throws($$select public.create_role('22222222-0000-4000-8000-000000000001', 'org_admin', 'Boss', '', '{}')$$, 'reserved');
select tests.throws($$select public.create_role('22222222-0000-4000-8000-000000000001', 'treasurer', 'Treasurer 2', '', '{}')$$, 'already exists');
select tests.throws($$select public.create_role('22222222-0000-4000-8000-000000000001', 'x', 'X', '', array['no.such'])$$, 'unknown permission');
-- writes only go through the RPCs
select tests.throws($$insert into public.roles (org_id, key, name) values ('22222222-0000-4000-8000-000000000001', 'sneaky', 'Sneaky')$$, 'permission denied');
select tests.throws($$insert into public.role_permissions (role_id, permission_key) select id, 'org.manage' from public.roles where key = 'treasurer'$$, 'permission denied');
select tests.reset_role();
select tests.eq((select count(*) from public.audit_events where target_type = 'role_permissions'), 2::bigint, 'permission changes audited');

-- chapter admin sees the national role, and a key used anywhere in the tree can't be reused
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.eq((select count(*) from public.roles where key = 'treasurer'), 1::bigint, 'chapter sees national role');
select tests.throws($$select public.create_role('22222222-0000-4000-8000-000000000002', 'treasurer', 'Treasurer', '', '{}')$$, 'already exists');
select public.create_role('22222222-0000-4000-8000-000000000002', 'secretary', 'Secretary', '', array['members.view']);
-- chapter admin can't edit national's role or the platform roles
select tests.throws($$select public.update_role((select id from public.roles where key = 'treasurer'), 'T', '', '{}')$$, 'not allowed');
select tests.throws($$select public.update_role((select id from public.roles where key = 'org_admin' and org_id is null), 'Admin', '', '{}')$$, 'not allowed');
-- chapter admin assigns the national role in the chapter; it grants its permissions there
select public.assign_role('22222222-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000003', 'role_manager');
select tests.reset_role();
select tests.eq(public.has_permission('11111111-0000-4000-8000-000000000003', 'roles.manage', '22222222-0000-4000-8000-000000000002'), true, 'custom role grants');
select tests.eq(public.has_permission('11111111-0000-4000-8000-000000000003', 'roles.manage', '22222222-0000-4000-8000-000000000001'), false, 'never upward');

-- a limited role manager cannot escalate
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.throws($$select public.create_role('22222222-0000-4000-8000-000000000002', 'auditor', 'Auditor', '', array['audit.view'])$$, 'permissions you hold');
select tests.throws($$select public.assign_role('22222222-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000003', 'treasurer')$$, 'permissions you hold');
select tests.throws($$select public.assign_role('22222222-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000003', 'org_admin')$$, 'permissions you hold');
select tests.throws($$select public.create_invitation('22222222-0000-4000-8000-000000000002', 'new@test.org', 'treasurer')$$, 'not allowed');
select tests.throws($$select public.update_role((select id from public.roles where key = 'secretary'), 'Secretary', '', array['members.view','audit.view'])$$, 'permissions you hold');
-- but may manage roles within what it holds, and remove permissions it lacks
select public.update_role((select id from public.roles where key = 'secretary'), 'Club secretary', 'Minutes', array['members.view']);
select tests.reset_role();
select tests.eq((select name from public.roles where key = 'secretary'), 'Club secretary', 'renamed');

-- outsiders see no org roles
select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.eq((select count(*) from public.roles where org_id is not null), 0::bigint, 'outsider sees no org roles');
select tests.eq((select count(*) from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.org_id is not null), 0::bigint, 'outsider sees no org role permissions');
select tests.reset_role();

-- retire, never delete: blocked while assigned, then retired roles can't be assigned
select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.throws($$select public.set_role_active((select id from public.roles where key = 'role_manager'), false)$$, 'remove this role');
select public.remove_role((select ra.id from public.role_assignments ra join public.roles r on r.id = ra.role_id where r.key = 'role_manager'));
select public.set_role_active((select id from public.roles where key = 'role_manager'), false);
select tests.throws($$select public.assign_role('22222222-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000003', 'role_manager')$$, 'unknown role');
select public.set_role_active((select id from public.roles where key = 'role_manager'), true);
select public.assign_role('22222222-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000003', 'role_manager');
-- pending invitations also block retiring
select public.create_invitation('22222222-0000-4000-8000-000000000002', 'new@test.org', 'secretary');
select tests.throws($$select public.set_role_active((select id from public.roles where key = 'secretary'), false)$$, 'pending invitations');
select tests.reset_role();
rollback;
