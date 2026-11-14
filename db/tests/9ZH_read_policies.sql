-- Security review (0017): one read policy for memberships and for settings, same rows as before.
begin;
select tests.fixture();
select tests.eq((select count(*)::int from pg_policies where schemaname = 'charter' and tablename = 'memberships'
                 and cmd in ('SELECT', 'ALL') and permissive = 'PERMISSIVE'), 1, 'one read policy for memberships');
select tests.eq((select count(*)::int from pg_policies where schemaname = 'charter' and tablename = 'org_settings'
                 and cmd in ('SELECT', 'ALL') and permissive = 'PERMISSIVE'), 1, 'one read policy for settings');
select tests.eq((select count(*)::int from public.tuning_problems('charter')), 0, 'nothing left to tune');
rollback;
