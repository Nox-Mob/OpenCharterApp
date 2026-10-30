-- Write protections: column grants, append-only audit, org creation rules
begin;
select tests.fixture();
select tests.as_user('11111111-0000-4000-8000-000000000002');

-- hierarchy/identity columns cannot be changed from the client (D-110)
select tests.throws($$update public.organizations set parent_id = null where id = '22222222-0000-4000-8000-000000000002'$$, 'permission denied');
select tests.throws($$update public.organizations set slug = 'x' where id = '22222222-0000-4000-8000-000000000002'$$, 'permission denied');
select tests.throws($$update public.org_member_profiles set org_id = '22222222-0000-4000-8000-000000000003'$$, 'permission denied');
-- name can be changed by the chapter's admin
update public.organizations set name = 'A renamed' where id = '22222222-0000-4000-8000-000000000002';
-- audit log is append-only
select tests.throws($$insert into public.audit_events (action, target_type) values ('x','y')$$, 'permission denied');
select tests.throws($$delete from public.audit_events$$, 'permission denied');
-- direct role self-escalation is impossible
select tests.throws($$insert into public.role_assignments (user_id, role_id, org_id) select auth.uid(), id, '22222222-0000-4000-8000-000000000001' from public.roles limit 1$$, 'permission denied');
-- a chapter admin cannot create chapters under the national
select tests.throws($$select public.create_organization('C', 'ch-c', 'chapter', '22222222-0000-4000-8000-000000000001')$$, 'not allowed');
-- chapters need a parent
select tests.throws($$select public.create_organization('C', 'ch-c', 'chapter')$$, 'need a parent');
select tests.reset_role();

-- the rename was audited
select tests.eq((select count(*) from public.audit_events where target_type = 'organizations' and action = 'update'
  and target_id = '22222222-0000-4000-8000-000000000002'), 1::bigint, 'rename audited');

-- national admin may create a chapter; creator becomes a member of it
select tests.as_user('11111111-0000-4000-8000-000000000001');
select public.create_organization('C', 'ch-c', 'chapter', '22222222-0000-4000-8000-000000000001');
select tests.eq((select count(*) from public.organizations where slug = 'ch-c'), 1::bigint, 'chapter created');
select tests.reset_role();

-- any signed-in person can start a standalone org and becomes its admin
select tests.as_user('11111111-0000-4000-8000-000000000004');
select public.create_organization('Solo', 'solo', 'standalone');
select tests.eq(public.has_permission(auth.uid(), 'org.manage', (select id from public.organizations where slug = 'solo')), true, 'creator is admin');
select tests.reset_role();
rollback;
