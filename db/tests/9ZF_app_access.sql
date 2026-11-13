-- No access in OpenCharterApp (0014, core 0015): no staff permissions; their own membership stays.
begin;
select tests.fixture();
-- A Charter admin in Chapter A (role assignment) who is a member of the organization.
select tests.eq(charter.has_permission('11111111-0000-4000-8000-000000000002', 'members.manage', '22222222-0000-4000-8000-000000000002'),
  true, 'a chapter admin manages members');
select tests.as_user('11111111-0000-4000-8000-000000000001');
select public.set_app_access('22222222-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000002', 'charter', true);
select tests.reset_role();
select tests.eq(charter.has_permission('11111111-0000-4000-8000-000000000002', 'members.manage', '22222222-0000-4000-8000-000000000002'),
  false, 'No access: no staff permissions in Charter');
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.eq((select count(*)::int from charter.permitted_units('members.manage')), 0, 'and no units to manage');
select tests.reset_role();
select tests.eq(charter.has_permission('11111111-0000-4000-8000-000000000001', 'members.manage', '22222222-0000-4000-8000-000000000002'),
  true, 'the owner keeps everything');
rollback;
