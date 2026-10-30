-- Invitations are single-use, expire, and bind to one email (D-107)
begin;
select tests.fixture();
create temp table t (token text);
grant all on t to authenticated;

select tests.as_user('11111111-0000-4000-8000-000000000002');
insert into t select public.create_invitation('22222222-0000-4000-8000-000000000002', 'X@Test.org', 'member');
-- only admins with roles.manage may invite as org_admin; chapter admin has it for own chapter
select public.create_invitation('22222222-0000-4000-8000-000000000002', 'y@test.org', 'org_admin');
-- cannot invite into a sibling chapter
select tests.throws($$select public.create_invitation('22222222-0000-4000-8000-000000000003', 'z@test.org')$$, 'not allowed');
-- token is never stored in plain text
select tests.eq((select count(*) from public.invitations i, t where i.token_hash = t.token), 0::bigint, 'token hashed');
select tests.reset_role();

-- a different person cannot use the invite
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.throws($$select public.accept_invitation((select token from t))$$, 'different email');
select tests.reset_role();

-- the invited person accepts once
select tests.as_user('11111111-0000-4000-8000-000000000004');
select public.accept_invitation((select token from t));
select tests.eq(public.is_org_member(auth.uid(), '22222222-0000-4000-8000-000000000002'), true, 'joined');
select tests.throws($$select public.accept_invitation((select token from t))$$, 'not valid');
select tests.reset_role();

-- an expired invite cannot be used
select tests.as_user('11111111-0000-4000-8000-000000000002');
truncate t;
insert into t select public.create_invitation('22222222-0000-4000-8000-000000000002', 'x@test.org', 'member');
select tests.reset_role();
update public.invitations set expires_at = now() - interval '1 minute' where email = 'x@test.org' and accepted_at is null;
select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.throws($$select public.accept_invitation((select token from t))$$, 'not valid');
select tests.reset_role();
rollback;
