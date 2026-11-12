-- Chapters on OpenBoardApp. A chapter can run its board in OpenBoardApp when its national (or
-- association) allows it:
--   * The national's setting `board.chapters`: 'off' (chapters can't), 'approval' (the default:
--     a chapter asks, the national decides) or 'open' (any chapter can turn it on).
--   * A chapter admin asks (charter.request_chapter_board). With 'approval', the national's
--     owners and admins get an email and approve or decline (charter.decide_chapter_board).
--   * On approval the chapter gets its own organization (core public._create_child_organization,
--     parent: the national's organization), which OpenBoardApp works with like any other. The
--     requester owns it and the national's owner is an admin. When billing is on, it's covered
--     by the national's plan (the hub's billing 0004).
--   * The chapter's officers then sync with its board exactly like the national's do (S-14,
--     0005): appointments here become terms there, and the other way round.
-- Needs core 0005 (email) and 0006 (child organizations).

create table charter.chapter_board_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  unit_id uuid not null references charter.units (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  requested_by uuid references auth.users (id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  note text check (note is null or char_length(note) <= 500),
  board_org_id uuid references public.organizations (id) on delete set null
);

create unique index chapter_board_requests_open_idx on charter.chapter_board_requests (unit_id)
  where status in ('pending', 'approved');
create index chapter_board_requests_org_idx on charter.chapter_board_requests (org_id, status);

alter table charter.chapter_board_requests enable row level security;
revoke all on charter.chapter_board_requests from anon, authenticated;
grant select on charter.chapter_board_requests to authenticated;
grant all on charter.chapter_board_requests to service_role;

-- Chapter admins see their chapter's requests; national managers see all of theirs.
create policy "chapter and national managers read" on charter.chapter_board_requests
  for select to authenticated
  using (charter.has_permission(auth.uid(), 'org.manage', unit_id)
      or charter.has_permission(auth.uid(), 'org.manage', org_id));

create trigger audit_chapter_board_requests after insert or update or delete on charter.chapter_board_requests
  for each row execute function charter.audit_row_change();

-- The national's choice ('off' | 'approval' | 'open'), for a unit anywhere in its tree.
create function charter.chapter_board_policy(p_unit uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select charter.effective_setting(u.org_id, 'board.chapters') #>> '{}'
       from charter.units u where u.id = p_unit),
    'approval');
$$;

-- The organization a unit's board lives in: the national's own organization for the top unit,
-- the chapter's own organization once approved, otherwise null.
create function charter.board_org_for_unit(p_unit uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select case
    when u.id = u.org_id then u.org_id
    else (select o.id from public.organizations o where o.source_app = 'charter' and o.source_ref = u.id)
  end
  from charter.units u where u.id = p_unit;
$$;

-- And back: which unit a board organization belongs to.
create function charter.unit_for_board_org(p_org uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select u.id from charter.units u where u.id = p_org and u.id = u.org_id),
    (select o.source_ref from public.organizations o
       join charter.units u on u.id = o.source_ref
       where o.id = p_org and o.source_app = 'charter'));
$$;

-- Turn a chapter's board on: its organization, then its current officers as terms.
create function charter._enable_chapter_board(p_unit uuid, p_owner uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  u charter.units;
  v_org uuid;
  v_admins uuid[];
  a record;
begin
  select * into u from charter.units where id = p_unit;
  select coalesce(array_agg(m.user_id), '{}') into v_admins
    from public.memberships m where m.org_id = u.org_id and m.role = 'owner';
  v_org := public._create_child_organization(u.org_id, u.name, p_owner, 'charter', u.id, v_admins);
  -- Current officers (the sync trigger only fires on changes).
  if to_regprocedure('board.sync_term_from_charter(uuid,uuid,text,uuid,text,date,date,boolean)') is not null then
    for a in
      select ap.id, ap.starts_on, coalesce(ap.ended_on, ap.planned_end) as ends_on,
             coalesce(nullif(p.display_name, ''), nullif(p.email, ''), 'Officer') as name, p.user_id,
             coalesce(o.title, t.title) as title
      from charter.appointments ap
      join charter.member_profiles p on p.id = ap.profile_id
      join charter.seat_templates t on t.id = ap.template_id
      left join charter.seat_title_overrides o on o.template_id = t.id and o.unit_id = ap.unit_id
      where ap.unit_id = p_unit and (ap.ended_on is null or ap.ended_on >= current_date)
    loop
      execute 'select board.sync_term_from_charter($1, $2, $3, $4, $5, $6, $7, false)'
        using v_org, a.id, a.name, a.user_id, a.title, a.starts_on, a.ends_on;
    end loop;
  end if;
  return v_org;
end $$;

-- Email the national's owners and admins, or the requester.
create function charter._chapter_board_email(p_request uuid, p_template text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r charter.chapter_board_requests;
  v_chapter text;
  v_by text;
  m record;
begin
  if to_regprocedure('public.enqueue_email(text,text,uuid,uuid,text,jsonb,text,text,timestamptz)') is null then
    return;
  end if;
  select * into r from charter.chapter_board_requests where id = p_request;
  select name into v_chapter from charter.units where id = r.unit_id;
  select coalesce(nullif(p.display_name, ''), 'A chapter admin') into v_by from public.profiles p where p.id = r.requested_by;
  if p_template = 'charter.chapter_board_request' then
    for m in select mm.user_id from public.memberships mm where mm.org_id = r.org_id and mm.role in ('owner', 'admin') loop
      perform public.enqueue_email('charter', p_template, r.org_id, m.user_id, null,
        jsonb_build_object('chapter', v_chapter, 'requested_by', v_by,
          'link', format('/orgs/%s?tab=chapters', r.org_id)),
        'org_activity', format('charter.chapter_board:%s:request:%s', r.id, m.user_id));
    end loop;
  elsif r.requested_by is not null then
    perform public.enqueue_email('charter', p_template, r.org_id, r.requested_by, null,
      jsonb_build_object('chapter', v_chapter, 'approved', r.status = 'approved', 'note', r.note,
        'link', case when r.board_org_id is not null then format('/board?org=%s', r.board_org_id) end),
      'essential', format('charter.chapter_board:%s:decided', r.id));
  end if;
end $$;

-- A chapter admin asks to use OpenBoardApp. Returns the request.
create function charter.request_chapter_board(p_unit uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  u charter.units;
  v_uid uuid := auth.uid();
  v_policy text;
  v_id uuid;
begin
  select * into u from charter.units where id = p_unit;
  if u.id is null or v_uid is null or not charter.has_permission(v_uid, 'org.manage', p_unit) then
    raise exception 'Only the chapter''s admins can ask for this.' using errcode = '42501';
  end if;
  if u.id = u.org_id then
    raise exception 'This is the organization itself: open OpenBoardApp directly.' using errcode = '22023';
  end if;
  if charter.board_org_for_unit(p_unit) is not null then
    raise exception 'This chapter already uses OpenBoardApp.' using errcode = '22023';
  end if;
  if exists (select 1 from charter.chapter_board_requests where unit_id = p_unit and status = 'pending') then
    raise exception 'This chapter has already asked; the national hasn''t decided yet.' using errcode = '22023';
  end if;
  v_policy := charter.chapter_board_policy(p_unit);
  if v_policy = 'off' then
    raise exception 'Your national doesn''t let chapters use OpenBoardApp.' using errcode = '42501';
  end if;
  insert into charter.chapter_board_requests (org_id, unit_id, requested_by)
  values (u.org_id, p_unit, v_uid) returning id into v_id;
  if v_policy = 'open' then
    update charter.chapter_board_requests
      set status = 'approved', decided_at = now(), board_org_id = charter._enable_chapter_board(p_unit, v_uid)
      where id = v_id;
  else
    perform charter._chapter_board_email(v_id, 'charter.chapter_board_request');
  end if;
  return v_id;
end $$;

-- The national approves or declines.
create function charter.decide_chapter_board(p_request uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  r charter.chapter_board_requests;
  v_uid uuid := auth.uid();
begin
  select * into r from charter.chapter_board_requests where id = p_request for update;
  if r.id is null or v_uid is null or not charter.has_permission(v_uid, 'org.manage', r.org_id) then
    raise exception 'Only the national''s admins can decide this.' using errcode = '42501';
  end if;
  if r.status <> 'pending' then
    raise exception 'This request has already been decided.' using errcode = '22023';
  end if;
  update charter.chapter_board_requests set
    status = case when p_approve then 'approved' else 'declined' end,
    decided_by = v_uid, decided_at = now(), note = nullif(btrim(coalesce(p_note, '')), ''),
    board_org_id = case when p_approve
      then charter._enable_chapter_board(r.unit_id, coalesce(r.requested_by, v_uid)) end
  where id = p_request;
  perform charter._chapter_board_email(p_request, 'charter.chapter_board_decided');
end $$;

-- A chapter admin withdraws a pending request.
create function charter.cancel_chapter_board_request(p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r charter.chapter_board_requests;
begin
  select * into r from charter.chapter_board_requests where id = p_request;
  if r.id is null or not charter.has_permission(auth.uid(), 'org.manage', r.unit_id) then
    raise exception 'Only the chapter''s admins can withdraw this.' using errcode = '42501';
  end if;
  update charter.chapter_board_requests set status = 'cancelled', decided_at = now()
    where id = p_request and status = 'pending';
end $$;

-- What a chapter's page shows.
create function charter.chapter_board_status(p_unit uuid)
returns table (policy text, request_id uuid, status text, board_org_id uuid, note text, can_request boolean)
language sql stable security definer set search_path = '' as $$
  select charter.chapter_board_policy(p_unit),
         r.id, coalesce(case when charter.board_org_for_unit(p_unit) is not null then 'approved' end, r.status),
         charter.board_org_for_unit(p_unit), r.note,
         charter.has_permission(auth.uid(), 'org.manage', p_unit)
  from (select 1) one
  left join lateral (
    select * from charter.chapter_board_requests q where q.unit_id = p_unit
    order by q.requested_at desc limit 1
  ) r on true
  where charter.has_permission(auth.uid(), 'org.view', p_unit);
$$;

-- The national's list of requests.
create function charter.chapter_board_requests_for(p_org uuid)
returns table (id uuid, unit_id uuid, chapter text, status text, requested_by_name text,
               requested_at timestamptz, decided_at timestamptz, note text, board_org_id uuid)
language sql stable security definer set search_path = '' as $$
  select r.id, r.unit_id, u.name, r.status, p.display_name, r.requested_at, r.decided_at, r.note, r.board_org_id
  from charter.chapter_board_requests r
  join charter.units u on u.id = r.unit_id
  left join public.profiles p on p.id = r.requested_by
  where r.org_id = p_org and charter.has_permission(auth.uid(), 'org.manage', p_org)
  order by (r.status = 'pending') desc, r.requested_at desc;
$$;

-- S-14 sync, now for chapters too: replaces 0005's versions, which handled the top unit only.
create or replace function charter.appointments_to_board() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  a charter.appointments := coalesce(new, old);
  v_org uuid;
  v_name text;
  v_user uuid;
  v_title text;
begin
  if coalesce(current_setting('oah.syncing', true), '') = 'on' then return null; end if;
  v_org := charter.board_org_for_unit(a.unit_id);
  if v_org is null then return null; end if; -- a chapter without OpenBoardApp
  if to_regprocedure('board.sync_term_from_charter(uuid,uuid,text,uuid,text,date,date,boolean)') is null then
    return null;
  end if;
  select coalesce(nullif(p.display_name, ''), nullif(p.email, ''), 'Officer'), p.user_id
    into v_name, v_user from charter.member_profiles p where p.id = a.profile_id;
  select coalesce(o.title, t.title) into v_title
    from charter.seat_templates t
    left join charter.seat_title_overrides o on o.template_id = t.id and o.unit_id = a.unit_id
    where t.id = a.template_id;
  perform set_config('oah.syncing', 'on', true);
  execute 'select board.sync_term_from_charter($1, $2, $3, $4, $5, $6, $7, $8)'
    using v_org, a.id, v_name, v_user, v_title, a.starts_on, coalesce(a.ended_on, a.planned_end), tg_op = 'DELETE';
  perform set_config('oah.syncing', '', true);
  return null;
end $$;

create or replace function charter.appointment_from_board(
  p_org uuid, p_person_name text, p_user_id uuid, p_position text, p_start date
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_unit uuid := charter.unit_for_board_org(p_org);
  v_template uuid;
  v_profile uuid;
  v_id uuid;
begin
  if v_unit is null then return null; end if;
  select t.id into v_template
    from charter.seat_templates t
    left join charter.seat_title_overrides o on o.template_id = t.id and o.unit_id = v_unit
    where t.active and charter.seat_applies_at(t, v_unit)
      and lower(btrim(coalesce(o.title, t.title))) = lower(btrim(p_position))
    order by t.sort_order limit 1;
  if v_template is null then return null; end if;
  select p.id into v_profile from charter.member_profiles p
    where p.unit_id = v_unit and p.left_at is null
      and ((p_user_id is not null and p.user_id = p_user_id)
        or (p_user_id is null and lower(btrim(p.display_name)) = lower(btrim(p_person_name))))
    limit 1;
  if v_profile is null then return null; end if;
  perform set_config('oah.syncing', 'on', true);
  begin
    v_id := charter.appoint_officer(v_unit, v_template, v_profile, p_start);
  exception when others then
    v_id := null;
  end;
  perform set_config('oah.syncing', '', true);
  return v_id;
end $$;

revoke all on function
  charter.chapter_board_policy(uuid), charter.board_org_for_unit(uuid), charter.unit_for_board_org(uuid),
  charter._enable_chapter_board(uuid, uuid), charter._chapter_board_email(uuid, text),
  charter.appointments_to_board(), charter.appointment_from_board(uuid, text, uuid, text, date)
from public, anon, authenticated;

revoke all on function
  charter.request_chapter_board(uuid), charter.decide_chapter_board(uuid, boolean, text),
  charter.cancel_chapter_board_request(uuid), charter.chapter_board_status(uuid),
  charter.chapter_board_requests_for(uuid)
from public, anon;
grant execute on function
  charter.request_chapter_board(uuid), charter.decide_chapter_board(uuid, boolean, text),
  charter.cancel_chapter_board_request(uuid), charter.chapter_board_status(uuid),
  charter.chapter_board_requests_for(uuid)
to authenticated;
