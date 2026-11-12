-- A different role in each app (core 0010, 0010_app_roles): an admin of OpenCharterApp only.
begin;
select tests.fixture();
-- The member (m@test.org) becomes an admin in OpenCharterApp, nowhere else.
insert into public.memberships (org_id, user_id, role) values
  ('22222222-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000003', 'member');
select tests.as_user('11111111-0000-4000-8000-000000000001');
select public.set_app_role('22222222-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000003', 'charter', 'admin');
select tests.reset_role();
select tests.eq((select count(*) from charter.role_assignments a join charter.roles r on r.id = a.role_id
  where a.user_id = '11111111-0000-4000-8000-000000000003' and r.key = 'org_admin'
    and a.unit_id = '22222222-0000-4000-8000-000000000001' and a.source = 'hub'), 1::bigint, 'organization admin in Charter');
select tests.eq(charter.has_permission('11111111-0000-4000-8000-000000000003', 'org.manage', '22222222-0000-4000-8000-000000000002'),
  true, 'manages the chapters too');
select tests.eq((select role::text from public.memberships where user_id = '11111111-0000-4000-8000-000000000003'
  and org_id = '22222222-0000-4000-8000-000000000001'), 'member', 'still a member in OpenAppHub');
-- Back to member: the assignment the hub made goes; the chapter role stays.
select tests.as_user('11111111-0000-4000-8000-000000000001');
select public.set_app_role('22222222-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000003', 'charter', 'member');
select tests.reset_role();
select tests.eq((select count(*) from charter.role_assignments where user_id = '11111111-0000-4000-8000-000000000003' and source = 'hub'),
  0::bigint, 'the hub''s admin role is removed');
select tests.eq((select count(*) from charter.role_assignments where user_id = '11111111-0000-4000-8000-000000000003'),
  1::bigint, 'the chapter member role stays');
rollback;
