-- Performance check (R6, docs/testing.md): a national with 20 chapters and 5,000 members,
-- each with a membership and a payment, read as the national admin. Prints each read's time;
-- the budget is under 1 second each (docs/security-review.md §R6 has the last results).
\set ON_ERROR_STOP on
\if :{?budget_ms}
\else
  \set budget_ms 1000
\endif
select tests.fixture();

-- 20 chapters under the fixture's national
insert into public.organizations (id, parent_id, type, name, slug)
select ('aaaaaaaa-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  '22222222-0000-4000-8000-000000000001', 'chapter', 'Perf chapter ' || i, 'perf-' || i
from generate_series(1, 20) i;

insert into public.membership_tiers (id, org_id, key, name) values
  ('55555555-0000-4000-8000-0000000000f1', '22222222-0000-4000-8000-000000000001', 'reg', 'Regular');
insert into public.tier_terms (id, tier_id, org_id, key, label, length_count, length_unit, price_minor) values
  ('66666666-0000-4000-8000-0000000000f1', '55555555-0000-4000-8000-0000000000f1',
   '22222222-0000-4000-8000-000000000001', '1_year', '1 year', 1, 'year', 2500);

-- 5,000 member records, 250 per chapter, without sign-in accounts (admin-added)
insert into public.org_member_profiles (id, org_id, user_id, display_name, email, source)
select ('bbbbbbbb-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  ('aaaaaaaa-0000-4000-8000-' || lpad((1 + i % 20)::text, 12, '0'))::uuid,
  null, 'Member ' || i, 'member' || i || '@perf.test', 'admin'
from generate_series(1, 5000) i;

-- one membership each: most active, some lapsed, some pending
insert into public.memberships (org_id, profile_id, tier_id, term_id, status, joined_on, paid_through)
select p.org_id, p.id, '55555555-0000-4000-8000-0000000000f1', '66666666-0000-4000-8000-0000000000f1',
  case when n % 10 = 0 then 'pending' else 'active' end::public.membership_status,
  case when n % 10 = 0 then null else current_date - (n % 300) end,
  case when n % 10 = 0 then null when n % 7 = 0 then current_date - 40 else current_date + (n % 300) end
from (select id, org_id, (row_number() over (order by id))::int n from public.org_member_profiles
      where email like '%@perf.test') p;

-- one paid payment per active membership this year
insert into public.payments (org_id, membership_id, profile_id, purpose, amount_minor, status, gateway, method, livemode, received_on)
select m.org_id, m.id, m.profile_id, 'join', 2500, 'paid', 'manual', 'check', true, m.joined_on
from public.memberships m where m.joined_on is not null;
analyze;

begin;
select tests.as_user('11111111-0000-4000-8000-000000000001');
\timing on
\echo '--- Overview numbers (org_overview_stats)'
select roster, current_members from public.org_overview_stats('22222222-0000-4000-8000-000000000001');
\echo '--- Reports: members by chapter (org_rollup_members)'
select count(*) from public.org_rollup_members('22222222-0000-4000-8000-000000000001');
\echo '--- Reports: revenue by chapter (org_rollup_revenue)'
select count(*) from public.org_rollup_revenue('22222222-0000-4000-8000-000000000001', current_date - 365, current_date);
\echo '--- Members "everyone" view: profiles with memberships across the tree, under RLS'
select count(*) from public.org_member_profiles p
  left join public.memberships m on m.profile_id = p.id
  where p.org_id in (select id from public.organizations);
\echo '--- Directory of one chapter (member_directory)'
select count(*) from public.member_directory('aaaaaaaa-0000-4000-8000-000000000001');
\echo '--- Export payments across the tree (export_payments)'
select count(*) from public.export_payments('22222222-0000-4000-8000-000000000001', current_date - 365, current_date, true);
\timing off

-- Budget (D-181): each heavy read must finish within :budget_ms milliseconds (default 1000; CI
-- passes a looser one for its shared runners). Fails the run when one doesn't.
select set_config('perf.budget_ms', :'budget_ms', true);
do $$
declare _t timestamptz; _ms numeric; _budget numeric := current_setting('perf.budget_ms')::numeric;
  _slow text := '';
  _nat uuid := '22222222-0000-4000-8000-000000000001';
  _ch uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
begin
  _t := clock_timestamp(); perform * from public.org_overview_stats(_nat);
  _ms := extract(epoch from clock_timestamp() - _t) * 1000; raise notice 'overview % ms', round(_ms);
  if _ms > _budget then _slow := _slow || ' overview'; end if;
  _t := clock_timestamp(); perform * from public.org_rollup_members(_nat);
  _ms := extract(epoch from clock_timestamp() - _t) * 1000; raise notice 'members roll-up % ms', round(_ms);
  if _ms > _budget then _slow := _slow || ' members-rollup'; end if;
  _t := clock_timestamp(); perform * from public.org_rollup_revenue(_nat, current_date - 365, current_date);
  _ms := extract(epoch from clock_timestamp() - _t) * 1000; raise notice 'revenue roll-up % ms', round(_ms);
  if _ms > _budget then _slow := _slow || ' revenue-rollup'; end if;
  _t := clock_timestamp(); perform * from public.member_directory(_ch);
  _ms := extract(epoch from clock_timestamp() - _t) * 1000; raise notice 'directory % ms', round(_ms);
  if _ms > _budget then _slow := _slow || ' directory'; end if;
  _t := clock_timestamp(); perform * from public.org_member_profiles p
    left join public.memberships m on m.profile_id = p.id where p.org_id in (select id from public.organizations);
  _ms := extract(epoch from clock_timestamp() - _t) * 1000; raise notice 'everyone view % ms', round(_ms);
  if _ms > _budget then _slow := _slow || ' everyone-view'; end if;
  if _slow <> '' then raise exception 'over the % ms budget:%', _budget, _slow; end if;
end $$;
rollback;

-- Security catalogue checks (docs/security-review.md §1.1, §1.2), printed for the review:
\echo '--- Tables in public without row-level security (expect none)'
select tablename from pg_tables where schemaname = 'public' and not rowsecurity;
\echo '--- DELETE (or ALL) policies (expect org_settings and member_segments only)'
select tablename, policyname from pg_policies where schemaname = 'public' and cmd in ('DELETE', 'ALL');
\echo '--- Definer functions callable without signing in (expect the four in §1.2)'
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
  and has_function_privilege('anon', p.oid, 'execute') order by 1;
