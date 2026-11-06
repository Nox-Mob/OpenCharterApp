-- ===== Board seats for an org and its chapters, and the overview numbers (D-151, D-152) =====
-- 1. A national or region can define a seat that belongs to itself AND to every org below it
--    (scope 'self_and_chapters'), e.g. a President at the national and in every chapter. Each org
--    still fills its own seats and keeps its own terms (D-142). A seat's owner can widen or narrow
--    who uses it with set_seat_scope, as long as no current officer would lose their seat.
-- 2. org_overview_stats: the numbers on the Overview page for an org and everything below it —
--    chapters, current members (distinct people), lifetime vs other members, members per
--    chapter, pending, new and expiring. Aggregates only; needs members.view at the org, which
--    inherits downward (D-032), so a chapter admin sees only their chapter.
-- Additive only (D-125): no tables. The new enum value is only compared as text below, so this
-- file also works when it is applied inside a single transaction.

alter type public.seat_scope add value if not exists 'self_and_chapters';

-- A seat applies at its own org ('self'), at every org below it ('chapters'), or both.
create or replace function public.seat_applies_at(_t public.seat_templates, _org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case _t.scope::text
    when 'self' then _t.org_id = _org
    when 'self_and_chapters' then _t.org_id = _org
      or exists (select 1 from public.organizations o where o.id = _org and _t.org_id = any(o.ancestor_ids))
    else exists (select 1 from public.organizations o where o.id = _org and _t.org_id = any(o.ancestor_ids)) end
$$;

create or replace function public.seat_template_check(_org uuid, _term_count int, _term_unit public.term_unit,
  _role uuid, _scope public.seat_scope)
returns void language plpgsql stable security definer set search_path = public as $$
declare _o public.organizations; _r public.roles;
begin
  select * into _o from public.organizations where id = _org;
  if _scope::text in ('chapters', 'self_and_chapters') and _o.type not in ('national', 'region') then
    raise exception 'only a national or region can define seats for its chapters';
  end if;
  if (_term_count is null) <> (_term_unit is null) or (_term_count is not null and _term_count not between 1 and 100) then
    raise exception 'give the term as a number and a unit, or leave it open';
  end if;
  if _role is not null then
    select * into _r from public.roles where id = _role;
    if _r.id is null or not _r.active or not public.role_applies_at(_r, _org) then raise exception 'unknown role'; end if;
    if not public.holds_all_role_permissions(auth.uid(), _role, _org) then
      raise exception 'you can only grant permissions you hold';
    end if;
  end if;
end $$;

-- Change who uses a seat. Refused when someone currently holds it at an org the new scope
-- leaves out (end those terms first). Terms and titles other orgs set are kept as history.
create or replace function public.set_seat_scope(_template uuid, _scope public.seat_scope)
returns void language plpgsql security definer set search_path = public as $$
declare _t public.seat_templates;
begin
  select * into _t from public.seat_templates where id = _template;
  if _t.id is null or auth.uid() is null or not public.has_permission(auth.uid(), 'governance.define', _t.org_id) then
    raise exception 'not allowed';
  end if;
  if _scope is null then raise exception 'pick who uses this seat'; end if;
  perform public.seat_template_check(_t.org_id, null, null, null, _scope);
  _t.scope := _scope;
  if exists (select 1 from public.appointments a where a.template_id = _template and a.ended_on is null
             and not public.seat_applies_at(_t, a.org_id)) then
    raise exception 'end the current terms where this seat would no longer be used';
  end if;
  update public.seat_templates set scope = _scope where id = _template;
end $$;

revoke execute on function public.set_seat_scope(uuid, public.seat_scope) from public, anon;
grant execute on function public.set_seat_scope(uuid, public.seat_scope) to authenticated;

-- ----- overview numbers -----
-- People are counted once across the org and its sub-orgs (a member of the national and of a
-- chapter is one person); records without a login count on their own. "Current" means good
-- standing or grace. lifetime_members holds a current lifetime membership somewhere in the tree.
-- chapter_memberships counts current memberships held at chapters below the org, so members per
-- chapter = chapter_memberships / chapters.
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
    s as (
      select coalesce(p.user_id::text, p.id::text) as person, t.type as org_type, t.depth as org_depth,
        m.joined_on as joined, m.paid_through as through, coalesce(m.lifetime, false) as is_lifetime,
        case when m.id is null then 'none'
          else public.membership_standing(m.status, m.paid_through, m.lifetime, public.grace_days(p.org_id), current_date) end as standing
      from public.org_member_profiles p
      join t on t.org_id = p.org_id
      left join public.memberships m on m.profile_id = p.id and m.org_id = p.org_id
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

revoke execute on function public.org_overview_stats(uuid) from public, anon;
grant execute on function public.org_overview_stats(uuid) to authenticated;
