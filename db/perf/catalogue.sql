\set ON_ERROR_STOP on
-- Security catalogue checks (docs/security-review.md §1.1, §1.2), printed for the review:
\echo '--- Tables in public without row-level security (expect none)'
select tablename from pg_tables where schemaname = 'charter' and not rowsecurity;
\echo '--- DELETE (or ALL) policies (expect org_settings and member_segments only)'
select tablename, policyname from pg_policies where schemaname = 'charter' and cmd in ('DELETE', 'ALL');
\echo '--- Definer functions callable without signing in (expect the four in §1.2)'
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
  and has_function_privilege('anon', p.oid, 'execute') order by 1;
