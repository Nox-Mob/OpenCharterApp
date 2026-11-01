-- ===== E-14 Member privacy and the member directory (D-139, resolves Q-11) =====
-- Q-11 default: the org sets whether members are listed in its directory by default
-- (directory.listed_by_default), each member can choose for themselves, and a national decides
-- whether admins below it may include opted-out members in exports
-- (privacy.admin_override_allowed, resolved from ancestors only). Additive only (D-125).

-- null = follow the organization's default
alter table public.org_member_profiles add column directory_listed boolean;

create or replace function public.listed_in_directory(_profile public.org_member_profiles)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(_profile.directory_listed,
    coalesce((public.effective_setting(_profile.org_id, 'directory.listed_by_default') #>> '{}')::boolean, true))
$$;

-- Admins may include opted-out members in an export unless a parent organization forbids it.
create or replace function public.privacy_admin_override_allowed(_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((public.ancestor_setting(_org, 'privacy.admin_override_allowed') #>> '{}')::boolean, true)
$$;

-- A member's own directory choice (null = back to the organization's default).
create or replace function public.set_my_directory_listing(_org uuid, _listed boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.org_member_profiles set directory_listed = _listed
    where org_id = _org and user_id = auth.uid();
  if not found then raise exception 'not a member'; end if;
end $$;

-- The member directory: members of the org see other current members who are listed, with only
-- the fields marked "show in directory" that members (or the public) may see. Never emails.
create or replace function public.member_directory(_org uuid)
returns table (profile_id uuid, display_name text, fields jsonb)
language plpgsql stable security definer set search_path = public as $$
declare _grace int;
begin
  if auth.uid() is null or not (public.is_org_member(auth.uid(), _org) or public.has_permission(auth.uid(), 'members.view', _org)) then
    raise exception 'not allowed';
  end if;
  _grace := public.grace_days(_org);
  return query
    select p.id, p.display_name,
      coalesce((select jsonb_object_agg(d.label, v.value order by d.sort_order)
        from public.attribute_values v join public.attribute_definitions d on d.id = v.definition_id
        where v.entity_id = p.id and d.active and d.applies_to = 'member' and d.show_in_directory
          and d.visibility in ('members', 'public')), '{}'::jsonb)
    from public.org_member_profiles p
    join public.memberships m on m.profile_id = p.id and m.org_id = p.org_id
    where p.org_id = _org and public.listed_in_directory(p)
      and public.membership_standing(m.status, m.paid_through, m.lifetime, _grace, current_date) in ('good', 'grace')
    order by lower(p.display_name);
end $$;

-- Exports (0011) also record whether opted-out members were included ({"include_opted_out": true}
-- in the filter), which is refused where a parent organization doesn't allow it.
create or replace function public.log_member_export(_org uuid, _row_count int, _columns text[], _filter jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare _include boolean := coalesce((_filter ->> 'include_opted_out')::boolean, false);
begin
  if auth.uid() is null or not public.has_permission(auth.uid(), 'members.export', _org) then raise exception 'not allowed'; end if;
  if _row_count < 0 or coalesce(array_length(_columns, 1), 0) = 0 then raise exception 'nothing to export'; end if;
  if _include and not public.privacy_admin_override_allowed(_org) then
    raise exception 'members who opted out can''t be exported here';
  end if;
  perform public.write_audit(_org, 'export', 'members', null, null,
    jsonb_build_object('rows', _row_count, 'columns', to_jsonb(_columns), 'filter', coalesce(_filter, '{}'::jsonb),
      'included_opted_out', _include));
end $$;

revoke execute on function public.listed_in_directory(public.org_member_profiles), public.privacy_admin_override_allowed(uuid),
  public.set_my_directory_listing(uuid, boolean), public.member_directory(uuid) from public, anon;
grant execute on function public.privacy_admin_override_allowed(uuid), public.set_my_directory_listing(uuid, boolean),
  public.member_directory(uuid) to authenticated;
revoke execute on function public.listed_in_directory(public.org_member_profiles) from authenticated;
