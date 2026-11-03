-- 0038 (D-196): creating a chapter doesn't put its creator on the chapter's roster; creating a
-- top-level organization still makes its creator a member and admin there.
begin;
select tests.fixture();
select tests.as_user('11111111-0000-4000-8000-000000000001');
create temp table c as select public.create_organization('Chapter C', 'ch-c', 'chapter', '22222222-0000-4000-8000-000000000001') as id;
select tests.reset_role();
select tests.eq((select count(*) from public.org_member_profiles where org_id = (select id from c)), 0::bigint, 'no record in the new chapter');
select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.eq(public.has_permission('11111111-0000-4000-8000-000000000001', 'members.manage', (select id from c)), true, 'still manages it from the national');
select tests.eq(public.is_org_member('11111111-0000-4000-8000-000000000001', (select id from c)), false, 'not a chapter member');
select tests.eq((select count(*) from public.org_rollup_members('22222222-0000-4000-8000-000000000001') where name = 'Chapter C' and profiles = 0), 1::bigint, 'the chapter has nobody on its roster');
-- a new national: the creator is a member and admin, as before
create temp table n as select public.create_organization('Other National', 'other-nat', 'national') as id;
select tests.reset_role();
select tests.eq((select count(*) from public.org_member_profiles where org_id = (select id from n) and user_id = '11111111-0000-4000-8000-000000000001'), 1::bigint, 'creator on the national roster');
select tests.eq((select count(*) from public.role_assignments ra join public.roles r on r.id = ra.role_id
  where ra.org_id = (select id from n) and r.key = 'org_admin'), 1::bigint, 'creator is its admin');
rollback;
