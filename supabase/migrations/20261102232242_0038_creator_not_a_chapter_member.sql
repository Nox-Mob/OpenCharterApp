-- Counting members, not records (D-196). Creating an organization added a member record for the
-- person who created it, in chapters and regions too. A national admin who creates a chapter
-- already manages it through their national role (permissions inherit downward, D-032); the
-- record only made them look like a chapter member (listed on its Members page, counted in its
-- roster) without a membership. From now on only a top-level organization's creator gets a
-- record there (with its admin role, as before). Body copied from 0000 with that one change.
create or replace function public.create_organization(_name text, _slug text, _type public.org_type, _parent uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _id uuid; _email text;
begin
  if _uid is null then raise exception 'not authenticated'; end if;
  if _type = 'platform' then raise exception 'cannot create platform org'; end if;
  if _parent is null and _type not in ('national','standalone') then
    raise exception 'chapters and regions need a parent organization';
  end if;
  if _parent is not null then
    if _type in ('national','standalone') then raise exception 'this type cannot have a parent'; end if;
    if not public.has_permission(_uid, 'org.create_child', _parent) then raise exception 'not allowed'; end if;
  end if;
  insert into public.organizations (name, slug, type, parent_id, created_by)
    values (_name, lower(_slug), _type, _parent, _uid) returning id into _id;
  if _parent is null then
    select email into _email from auth.users where id = _uid;
    insert into public.org_member_profiles (org_id, user_id, email) values (_id, _uid, coalesce(_email,''));
    insert into public.role_assignments (user_id, role_id, org_id)
      select _uid, id, _id from public.roles where key = 'org_admin' and org_id is null;
  end if;
  return _id;
end $$;
revoke execute on function public.create_organization(text,text,public.org_type,uuid) from public, anon;
grant execute on function public.create_organization(text,text,public.org_type,uuid) to authenticated;

-- Records added that way earlier leave those rosters (marked as left, never deleted, D-190), but
-- only when nothing else ties the person to the organization: no membership, no seat ever held,
-- no role there, not a chapter record of a national membership, and a record that is still
-- just as it was created (no name given, no fields filled in).
update public.org_member_profiles p set left_at = now()
from public.organizations o
where o.id = p.org_id and o.parent_id is not null
  and p.user_id is not null and p.user_id = o.created_by
  and p.source = 'signup' and p.left_at is null and p.home_of is null
  and coalesce(p.display_name, '') = ''
  and not exists (select 1 from public.memberships m where m.profile_id = p.id)
  and not exists (select 1 from public.appointments a where a.profile_id = p.id)
  and not exists (select 1 from public.role_assignments ra where ra.user_id = p.user_id and ra.org_id = p.org_id)
  and not exists (select 1 from public.attribute_values v where v.entity_id = p.id);
