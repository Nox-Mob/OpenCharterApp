-- Tenant isolation and downward-only permission inheritance (D-031, D-032)
begin;
select tests.fixture();

-- national admin sees the national and both chapters
select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.eq((select count(*) from public.organizations), 3::bigint, 'national admin org count');
select tests.eq((select count(*) from public.org_member_profiles), 3::bigint, 'national admin sees chapter members');
select tests.reset_role();

-- chapter A admin sees only chapter A
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.eq((select count(*) from public.organizations), 1::bigint, 'chapter admin org count');
select tests.eq((select id from public.organizations), '22222222-0000-4000-8000-000000000002'::uuid, 'chapter admin sees own chapter');
select tests.eq(public.has_permission(auth.uid(), 'org.view', '22222222-0000-4000-8000-000000000001'), false, 'no upward inheritance');
select tests.eq(public.has_permission(auth.uid(), 'org.view', '22222222-0000-4000-8000-000000000003'), false, 'no sibling inheritance');
select tests.reset_role();

-- member sees own profile only, no audit log
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.eq((select count(*) from public.org_member_profiles), 1::bigint, 'member sees only own profile');
select tests.eq((select count(*) from public.audit_events), 0::bigint, 'member cannot read audit log');
select tests.reset_role();

-- outsider sees nothing
select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.eq((select count(*) from public.organizations), 0::bigint, 'outsider sees no orgs');
select tests.eq((select count(*) from public.role_assignments), 0::bigint, 'outsider sees no roles');
select tests.reset_role();

-- anonymous has no table access
set local role anon;
select tests.throws('select count(*) from public.organizations', 'permission denied');
reset role;
rollback;
