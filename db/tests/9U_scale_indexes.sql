-- 0044 (D-209): every foreign key on the tables that grow with the roster has an index that
-- starts with it, so per-member lookups stay fast at 10,000 and 20,000 members (bun run test:perf),
-- and the heavy reports skip JIT compilation.
begin;
select tests.eq((
  select count(*)::int
  from pg_constraint c
  where c.contype = 'f' and c.connamespace = 'charter'::regnamespace
    and c.conrelid in ('charter.memberships'::regclass, 'charter.member_profiles'::regclass,
      'charter.payments'::regclass, 'charter.receipts'::regclass, 'charter.membership_events'::regclass,
      'charter.affiliation_history'::regclass, 'charter.webhook_events'::regclass,
      'charter.role_assignments'::regclass, 'charter.appointments'::regclass)
    and not exists (select 1 from pg_index i
      where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])
), 0, 'foreign keys on member-scale tables are indexed');
select tests.eq(exists (select 1 from pg_indexes where schemaname = 'charter'
  and indexname = 'memberships_profile_id_idx'), true, 'memberships are found by member record');
select tests.eq((
  select count(*)::int from pg_proc p
  where p.pronamespace = 'charter'::regnamespace
    and p.proname in ('org_overview_stats', 'org_rollup_members', 'org_rollup_revenue',
      'export_payments', 'member_directory', 'audit_log')
    and 'jit=off' = any(p.proconfig)
), 6, 'the heavy reports run without JIT compilation');
-- still answers, and still refuses outsiders
select tests.fixture();
select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.eq((select roster from charter.org_overview_stats('22222222-0000-4000-8000-000000000001')) >= 0, true, 'overview still answers');
select tests.reset_role();
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.throws($$select charter.org_overview_stats('22222222-0000-4000-8000-000000000001')$$, 'not allowed'); -- still refused without members.view
select tests.reset_role();
rollback;
