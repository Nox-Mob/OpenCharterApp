-- Member exports and saved views (E-14): audited exports, permission checks, isolation
begin;
select tests.fixture();

-- chapter admin exports: an audit event records it
select tests.as_user('11111111-0000-4000-8000-000000000002');
select public.log_member_export('22222222-0000-4000-8000-000000000002', 2, array['Name', 'Email'], '{"standings": ["good"]}');
select tests.throws($$select public.log_member_export('22222222-0000-4000-8000-000000000002', 2, '{}')$$, 'nothing to export');
-- not for a sibling chapter
select tests.throws($$select public.log_member_export('22222222-0000-4000-8000-000000000003', 1, array['Name'])$$, 'not allowed');
select tests.reset_role();
select tests.eq((select after ->> 'rows' from public.audit_events where action = 'export'), '2', 'export audited');
select tests.eq((select actor_id from public.audit_events where action = 'export'), '11111111-0000-4000-8000-000000000002'::uuid, 'exporter recorded');

-- a member can't export
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.throws($$select public.log_member_export('22222222-0000-4000-8000-000000000002', 1, array['Name'])$$, 'not allowed');
-- and can't see or save views
select tests.throws($$insert into public.member_segments (org_id, name) values ('22222222-0000-4000-8000-000000000002', 'Mine')$$, 'row-level security');
select tests.reset_role();

-- saved views: managers save, viewers read, siblings see nothing
select tests.as_user('11111111-0000-4000-8000-000000000002');
insert into public.member_segments (org_id, name, filter) values ('22222222-0000-4000-8000-000000000002', 'Lapsed', '{"standings": ["lapsed"]}');
select tests.throws($$insert into public.member_segments (org_id, name, filter) values ('22222222-0000-4000-8000-000000000002', 'Bad', '[]')$$, 'check constraint');
select tests.throws($$insert into public.member_segments (org_id, name) values ('22222222-0000-4000-8000-000000000003', 'Other')$$, 'row-level security');
update public.member_segments set name = 'Lapsed members';
select tests.reset_role();
select tests.eq((select name from public.member_segments), 'Lapsed members', 'view renamed');
select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.eq((select count(*) from public.member_segments), 0::bigint, 'outsider sees no views');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.eq((select count(*) from public.member_segments), 1::bigint, 'national sees chapter views');
delete from public.member_segments;
select tests.reset_role();
select tests.eq((select count(*) from public.member_segments), 0::bigint, 'views can be removed');
rollback;
