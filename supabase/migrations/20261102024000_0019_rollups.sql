-- ===== E-23 National roll-up reporting (D-145) =====
-- A national or region sees totals for itself and every org below it: members by standing,
-- revenue, and board vacancies. Only aggregates leave these functions (no names or emails), so a
-- roll-up never reveals a chapter's members. Each needs the matching permission at the org it's
-- asked for, which inherits downward (D-032): members.view, payments.view, org.view.
-- Exports of a report are audited (log_report_export). Additive only (D-125): no tables.

-- The org and everything below it, with its depth (0 = the org itself).
create or replace function public.org_subtree(_org uuid)
returns table (org_id uuid, name text, type public.org_type, parent_id uuid, depth int)
language sql stable security definer set search_path = public as $$
  select o.id, o.name, o.type, o.parent_id,
    coalesce(array_length(o.ancestor_ids, 1), 0) - coalesce((select array_length(r.ancestor_ids, 1) from public.organizations r where r.id = _org), 0)
  from public.organizations o
  where o.id = _org or _org = any(o.ancestor_ids)
$$;
revoke execute on function public.org_subtree(uuid) from public, anon, authenticated;

-- Members by standing per org. no_membership = a member profile with no membership.
create or replace function public.org_rollup_members(_org uuid)
returns table (org_id uuid, name text, type public.org_type, parent_id uuid, depth int,
  profiles int, good int, grace int, lapsed int, pending int, ended int, no_membership int,
  joined_30d int, expiring_30 int, expiring_60 int, expiring_90 int)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.has_permission(auth.uid(), 'members.view', _org) then
    raise exception 'not allowed';
  end if;
  return query
    with t as (select * from public.org_subtree(_org)),
    s as (
      select p.org_id, m.joined_on, m.paid_through, m.lifetime,
        case when m.id is null then 'none'
          else public.membership_standing(m.status, m.paid_through, m.lifetime, public.grace_days(p.org_id), current_date) end as standing
      from public.org_member_profiles p
      join t on t.org_id = p.org_id
      left join public.memberships m on m.profile_id = p.id and m.org_id = p.org_id
    )
    select t.org_id, t.name, t.type, t.parent_id, t.depth,
      count(s.org_id)::int,
      count(*) filter (where s.standing = 'good')::int,
      count(*) filter (where s.standing = 'grace')::int,
      count(*) filter (where s.standing = 'lapsed')::int,
      count(*) filter (where s.standing = 'pending')::int,
      count(*) filter (where s.standing in ('cancelled', 'declined'))::int,
      count(*) filter (where s.standing = 'none')::int,
      count(*) filter (where s.joined_on >= current_date - 30)::int,
      count(*) filter (where s.standing = 'good' and not s.lifetime and s.paid_through < current_date + 30)::int,
      count(*) filter (where s.standing = 'good' and not s.lifetime and s.paid_through < current_date + 60)::int,
      count(*) filter (where s.standing = 'good' and not s.lifetime and s.paid_through < current_date + 90)::int
    from t left join s on s.org_id = t.org_id
    group by t.org_id, t.name, t.type, t.parent_id, t.depth
    order by t.depth, t.name;
end $$;

-- Revenue per org and currency for payments received in [_from, _to]. Test payments are left out.
create or replace function public.org_rollup_revenue(_org uuid, _from date, _to date)
returns table (org_id uuid, name text, depth int, currency text, payments int,
  gross_minor bigint, refunded_minor bigint, net_minor bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.has_permission(auth.uid(), 'payments.view', _org) then
    raise exception 'not allowed';
  end if;
  if _from is null or _to is null or _to < _from then raise exception 'pick a date range'; end if;
  return query
    select t.org_id, t.name, t.depth, p.currency::text, count(*)::int,
      sum(p.amount_minor)::bigint, sum(p.refunded_amount_minor)::bigint,
      sum(p.amount_minor - p.refunded_amount_minor)::bigint
    from public.org_subtree(_org) t
    join public.payments p on p.org_id = t.org_id
    where p.status in ('paid', 'refunded') and p.livemode
      and coalesce(p.received_on, p.created_at::date) between _from and _to
    group by t.org_id, t.name, t.depth, p.currency
    order by t.depth, t.name, p.currency;
end $$;

-- Board health per org: required seats with nobody in them, and current terms past their
-- planned end (no successor appointed yet).
create or replace function public.org_rollup_governance(_org uuid)
returns table (org_id uuid, name text, depth int, required_seats int, vacant_required int,
  vacant_titles text[], terms_past_end int)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.has_permission(auth.uid(), 'org.view', _org) then
    raise exception 'not allowed';
  end if;
  return query
    with t as (select * from public.org_subtree(_org)),
    seats as (
      select t.org_id, st.id as template_id, coalesce(o.title, st.title) as title, st.required,
        exists (select 1 from public.appointments a where a.org_id = t.org_id and a.template_id = st.id
                and a.ended_on is null) as filled
      from t join public.seat_templates st on st.active and public.seat_applies_at(st, t.org_id)
      left join public.seat_title_overrides o on o.org_id = t.org_id and o.template_id = st.id
    )
    select t.org_id, t.name, t.depth,
      (select count(*) from seats where seats.org_id = t.org_id and seats.required)::int,
      (select count(*) from seats where seats.org_id = t.org_id and seats.required and not seats.filled)::int,
      coalesce((select array_agg(seats.title order by seats.title) from seats
        where seats.org_id = t.org_id and seats.required and not seats.filled), '{}'),
      (select count(*) from public.appointments a where a.org_id = t.org_id and a.ended_on is null
        and a.planned_end < current_date)::int
    from t
    order by t.depth, t.name;
end $$;

-- Exporting a report is recorded like a member export (instructions.md: exports are audited).
create or replace function public.log_report_export(_org uuid, _report text, _row_count int, _filter jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if _report not in ('members', 'revenue', 'governance') then raise exception 'unknown report'; end if;
  if auth.uid() is null or not public.has_permission(auth.uid(),
       case _report when 'members' then 'members.view' when 'revenue' then 'payments.view' else 'org.view' end, _org) then
    raise exception 'not allowed';
  end if;
  perform public.write_audit(_org, 'export', 'report', _report, null,
    jsonb_build_object('rows', greatest(_row_count, 0), 'filter', coalesce(_filter, '{}'::jsonb)));
end $$;

revoke execute on function public.org_rollup_members(uuid), public.org_rollup_revenue(uuid, date, date),
  public.org_rollup_governance(uuid), public.log_report_export(uuid, text, int, jsonb) from public, anon;
grant execute on function public.org_rollup_members(uuid), public.org_rollup_revenue(uuid, date, date),
  public.org_rollup_governance(uuid), public.log_report_export(uuid, text, int, jsonb) to authenticated;
