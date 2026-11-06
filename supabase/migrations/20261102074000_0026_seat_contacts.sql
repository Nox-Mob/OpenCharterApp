-- ===== Board contact emails (D-156) =====
-- Each org decides, per board seat, how members reach whoever holds it. It's one or the other:
--   * a role email for the seat (e.g. president@demoaustin.xyz), the same whoever holds it; or
--   * no role email: each officer's own email from their member record is shown.
-- seat_contacts holds the role email; no row (or a null email) means "the officer's own email".
-- Members can't read other members' records, so org_board_contacts (a definer function) returns
-- only the officers of seats that apply at the org, with the email chosen for each seat.
-- Lovable conventions (D-125): full grants, RLS with is_org_member / has_permission, no DROP.
-- Writes go only through set_seat_contact; there are no client write policies.

create table public.seat_contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null references public.seat_templates(id) on delete cascade,
  role_email text check (role_email is null
    or (char_length(role_email) <= 254 and role_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  unique (org_id, template_id)
);
grant select, insert, update, delete on public.seat_contacts to authenticated;
grant all on public.seat_contacts to service_role;
alter table public.seat_contacts enable row level security;
comment on table public.seat_contacts is
  'Role email per org and seat (D-156). Null / no row = show each officer''s own email. Written only by set_seat_contact.';
create policy "tree members read seat contacts" on public.seat_contacts for select to authenticated
  using (public.is_org_member(auth.uid(), org_id)
    or public.has_permission(auth.uid(), 'org.view', org_id)
    or public.can_see_org_tree(auth.uid(), org_id));
create trigger audit_seat_contacts after insert or update or delete on public.seat_contacts
  for each row execute function public.audit_row_change();

-- Set a seat's role email at an org, or clear it (null / blank) to show the officers' own emails.
create or replace function public.set_seat_contact(_org uuid, _template uuid, _role_email text)
returns void language plpgsql security definer set search_path = public as $$
declare _t public.seat_templates; _clean text := nullif(lower(trim(coalesce(_role_email, ''))), '');
begin
  select * into _t from public.seat_templates where id = _template;
  if _t.id is null or auth.uid() is null or not public.has_permission(auth.uid(), 'governance.manage', _org)
     or not public.seat_applies_at(_t, _org) then raise exception 'not allowed'; end if;
  if _clean is not null and (char_length(_clean) > 254 or _clean !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'enter a valid email address';
  end if;
  insert into public.seat_contacts (org_id, template_id, role_email, updated_by)
    values (_org, _template, _clean, auth.uid())
    on conflict (org_id, template_id) do update
      set role_email = excluded.role_email, updated_by = excluded.updated_by, updated_at = now();
end $$;

-- Who to contact at an org: one row per current officer, plus a row for a vacant seat that has a
-- role email (the role can still be reached). email_source: 'role', 'officer', or 'none' (an
-- officer whose record has no email).
create or replace function public.org_board_contacts(_org uuid)
returns table (template_id uuid, title text, sort_order int, seat_number int, display_name text,
  email text, email_source text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not (public.is_org_member(auth.uid(), _org) or public.can_see_org_tree(auth.uid(), _org)) then
    raise exception 'not allowed';
  end if;
  return query
    with seats as (
      select t.id, coalesce(o.title, t.title) as title, t.sort_order, (t.org_id <> _org) as inherited,
        c.role_email
      from public.seat_templates t
      left join public.seat_title_overrides o on o.org_id = _org and o.template_id = t.id
      left join public.seat_contacts c on c.org_id = _org and c.template_id = t.id
      where t.active and public.seat_applies_at(t, _org)
    )
    select x.id, x.title, x.sort_order, x.seat_number, x.display_name, x.email, x.email_source from (
      select s.id, s.title, s.sort_order, s.inherited, a.seat_number, p.display_name,
        coalesce(s.role_email, nullif(p.email, '')) as email,
        case when s.role_email is not null then 'role'
          when nullif(p.email, '') is not null then 'officer' else 'none' end as email_source
      from seats s
      join public.appointments a on a.org_id = _org and a.template_id = s.id and a.ended_on is null
      join public.org_member_profiles p on p.id = a.profile_id
      union all
      select s.id, s.title, s.sort_order, s.inherited, null::int, null::text, s.role_email, 'role'
      from seats s
      where s.role_email is not null
        and not exists (select 1 from public.appointments a where a.org_id = _org and a.template_id = s.id
                        and a.ended_on is null)
    ) x
    order by x.inherited, x.sort_order, x.title, x.seat_number nulls last;
end $$;

revoke execute on function public.set_seat_contact(uuid, uuid, text), public.org_board_contacts(uuid)
  from public, anon;
grant execute on function public.set_seat_contact(uuid, uuid, text), public.org_board_contacts(uuid)
  to authenticated;
