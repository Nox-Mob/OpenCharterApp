-- Overview numbers count people, not records (D-200). In the home-chapter model each member has a
-- record at the national and one in their chapter; "Waiting for approval" and "Renewals due in 30
-- days" counted both, so a national saw each person twice. They now count people once, like the
-- other people counts. ("Chapter memberships" stays a count of chapter records on purpose.)
-- Body copied from 0034 with those two counts changed. Test: db/tests/9S_overview_people_once.sql.
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
      (select count(distinct s.person) from s where s.standing = 'pending')::int,
      (select count(distinct s.person) from s where s.joined >= current_date - 30)::int,
      (select count(distinct s.person) from s where s.standing = 'good' and not s.is_lifetime and s.through < current_date + 30)::int;
end $$;

revoke execute on function public.org_overview_stats(uuid) from public, anon;
grant execute on function public.org_overview_stats(uuid) to authenticated;
