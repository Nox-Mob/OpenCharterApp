-- Performance check (R6, D-181, D-209, docs/testing.md): grows the roster to :members member
-- records (250 per chapter, so 5,000 → 20 chapters, 20,000 → 80), each with a membership and a
-- payment, then times the heavy reads as the national admin. Run after setup.sql, once per size
-- in increasing order; each run adds only what's missing. Each read must stay under :budget_ms.
\set ON_ERROR_STOP on
\if :{?budget_ms}
\else
  \set budget_ms 1000
\endif
\if :{?members}
\else
  \set members 5000
\endif
select set_config('perf.members', :'members', false);
\echo
\echo '=== Roster of' :members 'members'

-- one chapter per 250 members under the fixture's national
insert into public.organizations (id, parent_id, type, name, slug)
select ('aaaaaaaa-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  '22222222-0000-4000-8000-000000000001', 'chapter', 'Perf chapter ' || i, 'perf-' || i
from generate_series(1, greatest(1, :members / 250)) i
on conflict (id) do nothing;

-- member records without sign-in accounts (admin-added), spread over the chapters
insert into public.org_member_profiles (id, org_id, user_id, display_name, email, source)
select ('bbbbbbbb-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  ('aaaaaaaa-0000-4000-8000-' || lpad((1 + i % greatest(1, :members / 250))::text, 12, '0'))::uuid,
  null, 'Member ' || i, 'member' || i || '@perf.test', 'admin'
from generate_series(1, :members) i
on conflict (id) do nothing;

-- one membership each for the new records: most active, some lapsed, some pending
insert into public.memberships (org_id, profile_id, tier_id, term_id, status, joined_on, paid_through)
select p.org_id, p.id, '55555555-0000-4000-8000-0000000000f1', '66666666-0000-4000-8000-0000000000f1',
  case when n % 10 = 0 then 'pending' else 'active' end::public.membership_status,
  case when n % 10 = 0 then null else current_date - (n % 300) end,
  case when n % 10 = 0 then null when n % 7 = 0 then current_date - 40 else current_date + (n % 300) end
from (select id, org_id, (substr(id::text, 25))::int n from public.org_member_profiles p
      where email like '%@perf.test'
        and not exists (select 1 from public.memberships m where m.profile_id = p.id)) p;

-- one paid payment per active membership without one
insert into public.payments (org_id, membership_id, profile_id, purpose, amount_minor, status, gateway, method, livemode, received_on)
select m.org_id, m.id, m.profile_id, 'join', 2500, 'paid', 'manual', 'check', true, m.joined_on
from public.memberships m
where m.joined_on is not null
  and not exists (select 1 from public.payments x where x.membership_id = m.id);
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
  _t := clock_timestamp(); perform * from public.export_payments(_nat, current_date - 365, current_date, true);
  _ms := extract(epoch from clock_timestamp() - _t) * 1000; raise notice 'payments export % ms', round(_ms);
  if _ms > _budget then _slow := _slow || ' payments-export'; end if;
  if _slow <> '' then
    raise exception 'with % members, over the % ms budget:%', current_setting('perf.members'), _budget, _slow;
  end if;
end $$;
rollback;

