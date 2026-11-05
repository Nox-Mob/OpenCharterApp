-- Performance (R6, docs/security-review.md): with 5,000 members the overview numbers and the
-- members roll-up took over a second, because grace days (an inherited setting) were resolved
-- once per member row. These versions resolve each organization's grace days, and the
-- directory's listed-by-default setting, once per call. Same signatures, same results
-- (db/tests/9E_rollups.sql, 9I_board_scope_overview.sql, 99_privacy.sql, 9L_home_chapter.sql);
-- db/perf/large-roster.sql measures them. Bodies copied from 0030 with only that change.

create or replace function public.member_directory(_org uuid)
returns table (profile_id uuid, display_name text, fields jsonb)
language plpgsql stable security definer set search_path = public as $$
declare
  _listed_default boolean;
begin
  if auth.uid() is null or not (public.is_org_member(auth.uid(), _org) or public.has_permission(auth.uid(), 'members.view', _org)) then
    raise exception 'not allowed';
  end if;
  -- same rule as listed_in_directory(p), resolved once: every row here belongs to _org
  _listed_default := coalesce((public.effective_setting(_org, 'directory.listed_by_default') #>> '{}')::boolean, true);
  return query
    with s as materialized (
      select p.id as pid, p.display_name as pname, m.status, m.paid_through, m.lifetime, m.org_id as morg
      from public.org_member_profiles p
      join public.memberships m on m.id = public.profile_membership_id(p)
      where p.org_id = _org and p.left_at is null and coalesce(p.directory_listed, _listed_default)
    ),
    g as materialized (
      select o.morg, public.grace_days(o.morg) as gd from (select distinct s.morg from s) o
    )
    select s.pid, s.pname,
      coalesce((select jsonb_object_agg(d.label, v.value order by d.sort_order)
        from public.attribute_values v join public.attribute_definitions d on d.id = v.definition_id
        where v.entity_id = s.pid and d.active and d.applies_to = 'member' and d.show_in_directory
          and d.visibility in ('members', 'public')), '{}'::jsonb)
    from s join g on g.morg = s.morg
    where public.membership_standing(s.status, s.paid_through, s.lifetime, g.gd, current_date) in ('good', 'grace')
    order by lower(s.pname);
end $$;

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
    s0 as materialized (
      select p.org_id as porg, m.id as mid, m.org_id as morg, m.status, m.joined_on, m.paid_through, m.lifetime
      from public.org_member_profiles p
      join t on t.org_id = p.org_id
      left join public.memberships m on m.id = public.profile_membership_id(p)
      where p.left_at is null
    ),
    g as materialized (
      select o.morg, public.grace_days(o.morg) as gd
      from (select distinct s0.morg from s0 where s0.morg is not null) o
    ),
    s as (
      select s0.porg as org_id, s0.joined_on, s0.paid_through, s0.lifetime,
        case when s0.mid is null then 'none'
          else public.membership_standing(s0.status, s0.paid_through, s0.lifetime, g.gd, current_date) end as standing
      from s0 left join g on g.morg = s0.morg
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

create or replace function public.org_overview_stats(_org uuid)
returns table (chapters int, orgs_below int, roster int, current_members int, lifetime_members int,
  chapter_memberships int, pending_members int, joined_30d int, expiring_30 int)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.has_permission(auth.uid(), 'members.view', _org) then
    raise exception 'not allowed';
  end if;
  return query
    with t as (select * from public.org_subtree(_org)),
    s0 as materialized (
      -- a person once: by login, else (home-chapter model) by their national record, else the record
      select coalesce(p.user_id::text, (select hm.profile_id::text from public.memberships hm where hm.id = p.home_of), p.id::text) as person,
        t.type as org_type, t.depth as org_depth,
        m.id as mid, m.org_id as morg, m.status, m.joined_on, m.paid_through, m.lifetime
      from public.org_member_profiles p
      join t on t.org_id = p.org_id
      left join public.memberships m on m.id = public.profile_membership_id(p)
      where p.left_at is null
    ),
    g as materialized (
      select o.morg, public.grace_days(o.morg) as gd
      from (select distinct s0.morg from s0 where s0.morg is not null) o
    ),
    s as materialized (
      select s0.person, s0.org_type, s0.org_depth,
        s0.joined_on as joined, s0.paid_through as through, coalesce(s0.lifetime, false) as is_lifetime,
        case when s0.mid is null then 'none'
          else public.membership_standing(s0.status, s0.paid_through, s0.lifetime, g.gd, current_date) end as standing
      from s0 left join g on g.morg = s0.morg
    )
    select
      (select count(*) from t where t.depth > 0 and t.type = 'chapter')::int,
      (select count(*) from t where t.depth > 0)::int,
      (select count(distinct s.person) from s)::int,
      (select count(distinct s.person) from s where s.standing in ('good', 'grace'))::int,
      (select count(distinct s.person) from s where s.standing in ('good', 'grace') and s.is_lifetime)::int,
      (select count(*) from s where s.standing in ('good', 'grace') and s.org_depth > 0 and s.org_type = 'chapter')::int,
      (select count(*) from s where s.standing = 'pending')::int,
      (select count(distinct s.person) from s where s.joined >= current_date - 30)::int,
      (select count(*) from s where s.standing = 'good' and not s.is_lifetime and s.through < current_date + 30)::int;
end $$;

revoke execute on function public.member_directory(uuid), public.org_rollup_members(uuid),
  public.org_overview_stats(uuid) from public, anon;
grant execute on function public.member_directory(uuid), public.org_rollup_members(uuid),
  public.org_overview_stats(uuid) to authenticated;
