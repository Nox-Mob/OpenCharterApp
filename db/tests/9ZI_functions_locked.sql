-- Security review round 2 (0018, core 0018): visitors who aren't signed in can call only the
-- public join page's two lookups (and only on a self-hosted install); nothing else in charter.
begin;
select tests.eq((select count(*)::int from public.tuning_problems('charter') where kind = 'callable without signing in'),
  0, 'no other charter function is open to visitors');
select tests.eq((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'charter' and p.prokind = 'f'
                   and has_function_privilege('anon', p.oid, 'EXECUTE')
                   and p.oid::regprocedure::text not in ('charter.public_join_info(text)', 'charter.public_home_chapter_info(text)')),
  0, 'only the join page lookups');
select tests.eq(has_function_privilege('authenticated', 'charter.has_permission(uuid,text,uuid)', 'EXECUTE'), true,
  'signed-in people keep what they had');
rollback;
