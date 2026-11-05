-- ===== Membership model: national membership with a home chapter (A8, D-166) =====
-- A national chooses, once and for its whole tree, `membership.model` = 'separate' (default:
-- national and chapters each have their own memberships) or 'home_chapter': one membership at the
-- national, and the member picks one chapter (or none) they belong to, changing it whenever they
-- like. Optional `membership.at_large_chapter` names a chapter for members without a local one.
--
-- How it's stored (everything owned by the national, D-031):
-- * memberships.home_org_id: the national membership's chosen chapter (one at most).
-- * In the chosen chapter the member gets a member record (org_member_profiles) with home_of =
--   their national membership. The chapter's Members page, directory, board and reports keep
--   working on chapter records; their standing comes from the national membership
--   (profile_membership_id). Leaving a chapter sets left_at on that record and ends any seats.
-- * affiliation_history: append-only log of every change.
-- Chapter admins read their affiliates' national membership through a new select policy; they
-- can't change it. Members can't set these columns (only display_name is client-updatable).
-- Additive only (D-125).

alter table public.memberships add column home_org_id uuid references public.organizations(id) on delete set null;
alter table public.org_member_profiles add column home_of uuid references public.memberships(id) on delete set null;
alter table public.org_member_profiles add column left_at timestamptz;
create index on public.org_member_profiles (home_of);
comment on column public.memberships.home_org_id is 'Home-chapter model (0030): the chapter this national membership belongs to.';
comment on column public.org_member_profiles.home_of is 'Home-chapter model (0030): the national membership this chapter record stands for.';
comment on column public.org_member_profiles.left_at is 'Home-chapter model (0030): when the member moved to another chapter (or none).';

-- ----- the model setting -----
-- The national's choice, read from the top of the tree; 'separate' until it's chosen.
create or replace function public.membership_model(_org uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select s.value #>> '{}' from public.org_settings s
    join public.organizations o on o.id = _org
    where s.key = 'membership.model' and s.org_id = coalesce(o.ancestor_ids[1], o.id)), 'separate')
$$;

-- Chosen once by the national, locked for every org below, never changed or removed (D-166).
create or replace function public.membership_model_guard()
returns trigger language plpgsql set search_path = public as $$
declare _o public.organizations;
begin
  if tg_op = 'DELETE' then
    if old.key in ('membership.model') then raise exception 'the membership model can''t be changed once chosen'; end if;
    return old;
  end if;
  if new.key not in ('membership.model', 'membership.at_large_chapter') then return new; end if;
  select * into _o from public.organizations where id = new.org_id;
  if _o.parent_id is not null or _o.type <> 'national' then
    raise exception 'only a national chooses the membership model';
  end if;
  new.mode := 'locked';
  if new.key = 'membership.model' then
    if (new.value #>> '{}') not in ('separate', 'home_chapter') then raise exception 'unknown membership model'; end if;
    if tg_op = 'UPDATE' and (old.value #>> '{}') is distinct from (new.value #>> '{}') then
      raise exception 'the membership model can''t be changed once chosen';
    end if;
  else
    if coalesce(new.value #>> '{}', '') <> '' and not exists (select 1 from public.organizations c
        where c.id::text = new.value #>> '{}' and c.type = 'chapter' and _o.id = any(c.ancestor_ids)) then
      raise exception 'the at-large chapter must be one of your chapters';
    end if;
  end if;
  return new;
end $$;
create or replace trigger membership_model_guard before insert or update or delete on public.org_settings
  for each row execute function public.membership_model_guard();

-- The membership a member record stands for: its own membership here, else (home-chapter model)
-- the national membership it was created for, unless the member has moved on.
create or replace function public.profile_membership_id(_p public.org_member_profiles)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select m.id from public.memberships m where m.profile_id = _p.id and m.org_id = _p.org_id),
    case when _p.left_at is null then _p.home_of end)
$$;

-- ----- history -----
create table public.affiliation_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  from_org_id uuid references public.organizations(id) on delete set null,
  to_org_id uuid references public.organizations(id) on delete set null,
  changed_by uuid,
  created_at timestamptz not null default now()
);
create index on public.affiliation_history (org_id, membership_id, created_at desc);
grant select, insert, update, delete on public.affiliation_history to authenticated;
grant all on public.affiliation_history to service_role;
alter table public.affiliation_history enable row level security;
comment on table public.affiliation_history is
  'Home-chapter changes (0030, D-166). Append-only; written only by definer functions.';
create policy "member viewers and the member read affiliation history" on public.affiliation_history
  for select to authenticated
  using (public.has_permission(auth.uid(), 'members.view', org_id)
    or (from_org_id is not null and public.has_permission(auth.uid(), 'members.view', from_org_id))
    or (to_org_id is not null and public.has_permission(auth.uid(), 'members.view', to_org_id))
    or exists (select 1 from public.memberships m join public.org_member_profiles p on p.id = m.profile_id
               where m.id = membership_id and p.user_id = auth.uid()));
create trigger audit_affiliation_history after insert or update or delete on public.affiliation_history
  for each row execute function public.audit_row_change();
create or replace function public.affiliation_history_append_only()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  raise exception 'chapter history can''t be changed';
end $$;
create trigger affiliation_history_append_only before update or delete on public.affiliation_history
  for each row execute function public.affiliation_history_append_only();

-- Chapter admins read the national membership of the members who chose their chapter.
create policy "chapters read their members' national membership" on public.memberships for select to authenticated
  using (exists (select 1 from public.org_member_profiles p
    where p.home_of = memberships.id and p.left_at is null
      and public.has_permission(auth.uid(), 'members.view', p.org_id)));

-- ----- changing chapter -----
-- Internal: move a national membership to _chapter (null = no chapter). Ends the member's seats
-- in the chapter they leave and removes only the roles those seats gave them (D-072).
create or replace function public.move_home_chapter(_membership uuid, _chapter uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _m public.memberships; _np public.org_member_profiles; _old uuid; _cp public.org_member_profiles;
begin
  select * into _m from public.memberships where id = _membership for update;
  if _m.id is null then raise exception 'join first'; end if;
  if public.membership_model(_m.org_id) <> 'home_chapter'
     or exists (select 1 from public.organizations where id = _m.org_id and parent_id is not null) then
    raise exception 'members don''t choose a chapter here';
  end if;
  if _m.status not in ('active', 'pending') then raise exception 'join first'; end if;
  if _chapter is not null and not exists (select 1 from public.organizations c
      where c.id = _chapter and c.type = 'chapter' and _m.org_id = any(c.ancestor_ids)) then
    raise exception 'that isn''t one of this organization''s chapters';
  end if;
  _old := _m.home_org_id;
  if _old is not distinct from _chapter then return; end if;
  select * into _np from public.org_member_profiles where id = _m.profile_id;
  if _old is not null then
    for _cp in select * from public.org_member_profiles where org_id = _old and home_of = _m.id and left_at is null loop
      delete from public.role_assignments where id in (select a.role_assignment_id from public.appointments a
        where a.profile_id = _cp.id and a.ended_on is null and a.role_assignment_id is not null);
      update public.appointments set ended_on = greatest(current_date, starts_on), end_reason = 'changed chapter',
          ended_by = auth.uid()
        where profile_id = _cp.id and ended_on is null;
      update public.org_member_profiles set left_at = now() where id = _cp.id;
    end loop;
  end if;
  if _chapter is not null then
    select * into _cp from public.org_member_profiles where org_id = _chapter
      and ((_np.user_id is not null and user_id = _np.user_id) or home_of = _m.id)
      order by (home_of = _m.id) desc nulls last limit 1;
    if _cp.id is not null then
      update public.org_member_profiles set home_of = _m.id, left_at = null where id = _cp.id;
    else
      insert into public.org_member_profiles (org_id, user_id, display_name, email, source, home_of)
        values (_chapter, _np.user_id, _np.display_name, _np.email,
          case when _np.user_id is null then 'admin' else 'signup' end, _m.id);
    end if;
  end if;
  update public.memberships set home_org_id = _chapter where id = _m.id;
  insert into public.affiliation_history (org_id, membership_id, from_org_id, to_org_id, changed_by)
    values (_m.org_id, _m.id, _old, _chapter, auth.uid());
end $$;
revoke execute on function public.move_home_chapter(uuid, uuid) from public, anon, authenticated;

-- The member themselves, any time (D-166 rule 2).
create or replace function public.set_home_chapter(_national uuid, _chapter uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _m uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select m.id into _m from public.memberships m join public.org_member_profiles p on p.id = m.profile_id
    where m.org_id = _national and p.user_id = auth.uid();
  if _m is null then raise exception 'join first'; end if;
  perform public.move_home_chapter(_m, _chapter);
end $$;

-- A national admin, for a member (e.g. a record without a login).
create or replace function public.set_member_home_chapter(_membership uuid, _chapter uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _org uuid;
begin
  select org_id into _org from public.memberships where id = _membership;
  if _org is null or auth.uid() is null or not public.has_permission(auth.uid(), 'members.manage', _org) then
    raise exception 'not allowed';
  end if;
  perform public.move_home_chapter(_membership, _chapter);
end $$;

-- Public: what a join page needs to offer chapters (names are public on join pages anyway).
create or replace function public.public_home_chapter_info(_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  with o as (select * from public.organizations where slug = _slug),
  r as (select n.* from public.organizations n, o where n.id = coalesce(o.ancestor_ids[1], o.id))
  select case when (select id from o) is null then null else jsonb_build_object(
    'model', public.membership_model((select id from o)),
    'org', (select jsonb_build_object('id', id, 'name', name, 'slug', slug, 'type', type) from o),
    'national', (select jsonb_build_object('id', id, 'name', name, 'slug', slug) from r),
    'at_large_chapter', (select nullif(s.value #>> '{}', '') from public.org_settings s, r
      where s.org_id = r.id and s.key = 'membership.at_large_chapter'),
    'chapters', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug) order by c.name)
      from public.organizations c, r where c.type = 'chapter' and r.id = any(c.ancestor_ids)), '[]'::jsonb)
  ) end
$$;

-- ----- standing comes from the national membership in the home-chapter model -----
-- Same as their latest versions (appoint_officer 0014, member_directory 0012, org_rollup_members
-- 0019, org_overview_stats 0024) except that they find a record's membership with
-- profile_membership_id, use that membership's org for the grace period, and skip records of
-- members who moved to another chapter.

create or replace function public.appoint_officer(_org uuid, _template uuid, _profile uuid,
  _starts_on date default current_date, _seat_number int default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _t public.seat_templates; _p public.org_member_profiles;
  _seat int; _ra uuid; _id uuid; _m public.memberships; _role public.roles;
begin
  if _uid is null or not public.has_permission(_uid, 'governance.manage', _org) then raise exception 'not allowed'; end if;
  select * into _t from public.seat_templates where id = _template;
  if _t.id is null or not _t.active or not public.seat_applies_at(_t, _org) then raise exception 'that seat isn''t used here'; end if;
  select * into _p from public.org_member_profiles where id = _profile and org_id = _org;
  -- home-chapter model (0030): someone who moved to another chapter isn't a member here any more
  if _p.id is null or _p.left_at is not null then raise exception 'person is not a member of this organization'; end if;
  if coalesce((public.effective_setting(_org, 'governance.officers_good_standing') #>> '{}')::boolean, true) then
    -- the member's own membership here, or (home-chapter model, 0030) their national membership
    select * into _m from public.memberships where id = public.profile_membership_id(_p);
    if _m.id is null or public.membership_standing(_m.status, _m.paid_through, _m.lifetime,
         public.grace_days(_m.org_id), coalesce(_starts_on, current_date)) <> 'good' then
      raise exception 'officers must be members in good standing';
    end if;
  end if;
  if exists (select 1 from public.appointments where org_id = _org and template_id = _template
             and profile_id = _profile and ended_on is null) then
    raise exception 'this person already holds that seat';
  end if;
  -- a free seat: the one asked for, else the lowest free number
  perform 1 from public.seat_templates where id = _template for update;
  select n into _seat from generate_series(1, _t.seat_count) n
    where (_seat_number is null or n = _seat_number)
      and not exists (select 1 from public.appointments a where a.org_id = _org and a.template_id = _template
                      and a.seat_number = n and a.ended_on is null)
    order by n limit 1;
  if _seat is null then raise exception 'all seats are filled'; end if;
  -- the linked role (no escalation; only people with a login can hold a role)
  if _t.role_id is not null and _p.user_id is not null then
    select * into _role from public.roles where id = _t.role_id;
    if not _role.active then raise exception 'the seat''s role is retired'; end if;
    if not public.holds_all_role_permissions(_uid, _t.role_id, _org) then
      raise exception 'you can only grant permissions you hold';
    end if;
    insert into public.role_assignments (user_id, role_id, org_id, source) values (_p.user_id, _t.role_id, _org, 'seat')
      on conflict (user_id, role_id, org_id) do nothing returning id into _ra;
  end if;
  insert into public.appointments (org_id, template_id, profile_id, seat_number, starts_on, planned_end,
      role_assignment_id, appointed_by)
    values (_org, _template, _profile, _seat, coalesce(_starts_on, current_date),
      public.seat_planned_end(_org, _template, coalesce(_starts_on, current_date), coalesce(_starts_on, current_date)),
      _ra, _uid)
    returning id into _id;
  return _id;
end $$;

create or replace function public.member_directory(_org uuid)
returns table (profile_id uuid, display_name text, fields jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not (public.is_org_member(auth.uid(), _org) or public.has_permission(auth.uid(), 'members.view', _org)) then
    raise exception 'not allowed';
  end if;
  return query
    select p.id, p.display_name,
      coalesce((select jsonb_object_agg(d.label, v.value order by d.sort_order)
        from public.attribute_values v join public.attribute_definitions d on d.id = v.definition_id
        where v.entity_id = p.id and d.active and d.applies_to = 'member' and d.show_in_directory
          and d.visibility in ('members', 'public')), '{}'::jsonb)
    from public.org_member_profiles p
    join public.memberships m on m.id = public.profile_membership_id(p)
    where p.org_id = _org and p.left_at is null and public.listed_in_directory(p)
      and public.membership_standing(m.status, m.paid_through, m.lifetime, public.grace_days(m.org_id), current_date) in ('good', 'grace')
    order by lower(p.display_name);
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
    s as (
      select p.org_id, m.joined_on, m.paid_through, m.lifetime,
        case when m.id is null then 'none'
          else public.membership_standing(m.status, m.paid_through, m.lifetime, public.grace_days(m.org_id), current_date) end as standing
      from public.org_member_profiles p
      join t on t.org_id = p.org_id
      left join public.memberships m on m.id = public.profile_membership_id(p)
      where p.left_at is null
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
    s as (
      -- a person once: by login, else (home-chapter model) by their national record, else the record
      select coalesce(p.user_id::text, (select hm.profile_id::text from public.memberships hm where hm.id = p.home_of), p.id::text) as person,
        t.type as org_type, t.depth as org_depth,
        m.joined_on as joined, m.paid_through as through, coalesce(m.lifetime, false) as is_lifetime,
        case when m.id is null then 'none'
          else public.membership_standing(m.status, m.paid_through, m.lifetime, public.grace_days(m.org_id), current_date) end as standing
      from public.org_member_profiles p
      join t on t.org_id = p.org_id
      left join public.memberships m on m.id = public.profile_membership_id(p)
      where p.left_at is null
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

revoke execute on function public.membership_model(uuid), public.profile_membership_id(public.org_member_profiles)
  from public, anon;
grant execute on function public.membership_model(uuid) to authenticated;
revoke execute on function public.profile_membership_id(public.org_member_profiles) from authenticated;
revoke execute on function public.set_home_chapter(uuid, uuid), public.set_member_home_chapter(uuid, uuid)
  from public, anon;
grant execute on function public.set_home_chapter(uuid, uuid), public.set_member_home_chapter(uuid, uuid)
  to authenticated;
grant execute on function public.public_home_chapter_info(text) to anon, authenticated;
