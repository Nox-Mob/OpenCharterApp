-- Role assignment rules (E-05)
begin;
select tests.fixture();

-- chapter admin promotes a member of their chapter
select tests.as_user('11111111-0000-4000-8000-000000000002');
select public.assign_role('22222222-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000003', 'org_admin');
select tests.eq(public.has_permission('11111111-0000-4000-8000-000000000003', 'org.manage', '22222222-0000-4000-8000-000000000002'), true, 'promoted');
-- assigning twice is idempotent
select public.assign_role('22222222-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000003', 'org_admin');
-- cannot assign to a non-member
select tests.throws($$select public.assign_role('22222222-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000004', 'member')$$, 'not a member');
-- cannot assign in the national
select tests.throws($$select public.assign_role('22222222-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'member')$$, 'not allowed');
select tests.throws($$select public.assign_role('22222222-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000003', 'owner')$$, 'unknown role');
select tests.reset_role();

-- national admin can manage chapter roles (downward inheritance) and remove them
select tests.as_user('11111111-0000-4000-8000-000000000001');
select public.remove_role((select ra.id from public.role_assignments ra join public.roles r on r.id = ra.role_id
  where ra.user_id = '11111111-0000-4000-8000-000000000003' and r.key = 'org_admin'));
select tests.eq(public.has_permission('11111111-0000-4000-8000-000000000003', 'org.manage', '22222222-0000-4000-8000-000000000002'), false, 'demoted');
-- the last admin of a top-level org cannot be removed
select tests.throws($$select public.remove_role((select ra.id from public.role_assignments ra join public.roles r on r.id = ra.role_id
  where ra.org_id = '22222222-0000-4000-8000-000000000001' and r.key = 'org_admin'))$$, 'at least one admin');
select tests.reset_role();

-- a member cannot remove anyone's role
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.throws($$select public.remove_role((select id from public.role_assignments limit 1))$$, 'not allowed');
select tests.reset_role();
rollback;
