-- Board members in sync with OpenBoardApp (S-14). For organizations that use both apps, Charter's
-- officers at the top unit (the organization itself) are mirrored as OpenBoardApp terms, and the
-- two stay in step:
--   * Appointing, changing or ending an officer here updates the matching Board term
--     (board.sync_term_from_charter, OpenBoardApp's 0005).
--   * A term added in OpenBoardApp becomes an appointment here when its position matches one of
--     this organization's seats and its person matches one of its members
--     (charter.appointment_from_board); ending a mirrored term there ends the appointment here
--     (charter.end_appointment_from_board). Both go through appoint_officer / end_appointment, so
--     Charter's own rules and permissions apply.
-- The transaction setting `oah.syncing` stops the two sides from echoing each other. The sync
-- functions are trigger-only (security definer, not callable by clients); see docs/INTEGRATION.md.
-- On a database without OpenBoardApp nothing happens (to_regprocedure finds no function).

create function charter.appointments_to_board() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  a charter.appointments := coalesce(new, old);
  v_name text;
  v_user uuid;
  v_title text;
begin
  if coalesce(current_setting('oah.syncing', true), '') = 'on' then return null; end if;
  if a.unit_id is distinct from a.org_id then return null; end if; -- the organization's own seats only
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
    using a.org_id, a.id, v_name, v_user, v_title, a.starts_on, coalesce(a.ended_on, a.planned_end), tg_op = 'DELETE';
  perform set_config('oah.syncing', '', true);
  return null;
end $$;

create trigger appointments_to_board after insert or update or delete on charter.appointments
  for each row execute function charter.appointments_to_board();

-- A term added in OpenBoardApp: appoint the person to the matching seat here, if there is one.
-- Returns the appointment, or null when the position or person doesn't match, or Charter's rules
-- (permissions, good standing, free seats) don't allow it; the term then stays Board-only.
create function charter.appointment_from_board(
  p_org uuid, p_person_name text, p_user_id uuid, p_position text, p_start date
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_template uuid;
  v_profile uuid;
  v_id uuid;
begin
  if not exists (select 1 from charter.units u where u.id = p_org) then return null; end if;
  select t.id into v_template
    from charter.seat_templates t
    left join charter.seat_title_overrides o on o.template_id = t.id and o.unit_id = p_org
    where t.active and charter.seat_applies_at(t, p_org)
      and lower(btrim(coalesce(o.title, t.title))) = lower(btrim(p_position))
    order by t.sort_order limit 1;
  if v_template is null then return null; end if;
  select p.id into v_profile from charter.member_profiles p
    where p.unit_id = p_org and p.left_at is null
      and ((p_user_id is not null and p.user_id = p_user_id)
        or (p_user_id is null and lower(btrim(p.display_name)) = lower(btrim(p_person_name))))
    limit 1;
  if v_profile is null then return null; end if;
  perform set_config('oah.syncing', 'on', true);
  begin
    v_id := charter.appoint_officer(p_org, v_template, v_profile, p_start);
  exception when others then
    v_id := null;
  end;
  perform set_config('oah.syncing', '', true);
  return v_id;
end $$;

-- A mirrored term ended in OpenBoardApp: end the appointment here (Charter's rules apply).
create function charter.end_appointment_from_board(p_appointment uuid, p_ended_on date) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('oah.syncing', 'on', true);
  begin
    perform charter.end_appointment(p_appointment, 'Ended in OpenBoardApp', p_ended_on);
  exception when others then
    perform set_config('oah.syncing', '', true);
    raise exception 'This term comes from OpenCharterApp and couldn''t be ended there (%). End it in OpenCharterApp.', sqlerrm
      using errcode = '42501';
  end;
  perform set_config('oah.syncing', '', true);
end $$;

revoke all on function charter.appointments_to_board() from public, anon, authenticated;
revoke all on function charter.appointment_from_board(uuid, text, uuid, text, date) from public, anon, authenticated;
revoke all on function charter.end_appointment_from_board(uuid, date) from public, anon, authenticated;
