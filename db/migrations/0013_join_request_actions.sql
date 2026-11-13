-- C-08 (core 0013 notifications, core 0014 actions from email; owner decisions 2026-11-13).
-- A membership application (a join request) is told to the people who review applications for
-- that chapter or unit (members.manage there): in the app (the bell) and by email, saying what is
-- waiting: "Pat Lee has asked to join Riverside. This is pending your approval." When the
-- organization allows it (Organization settings, Actions from email; off until switched on), the
-- email also has Approve and Decline buttons: the confirm page calls charter.approve_membership
-- or charter.decline_membership as the signed-in reviewer, so their permission is checked as in
-- the app.

do $$
begin
  if to_regprocedure('public.register_email_action_kind(text,text,text,text,integer)') is not null then
    perform public.register_email_action_kind('charter_join_requests', 'charter', 'Approve or decline join requests from email',
      'The email about a new membership application has Approve and Decline buttons.', 20);
  end if;
  if to_regprocedure('public.register_notification_kind(text,text,text,text,text,public.org_role[],text,boolean,boolean,integer,public.org_role[])') is not null then
    -- Sent to the reviewers only; nobody else may turn it on (eligible: none).
    perform public.register_notification_kind('charter.join_requested', 'charter', 'Someone asked to join',
      'A membership application is waiting for review in a chapter or unit you manage.',
      'The people who review applications there', '{}', 'essential', true, true, 20, '{owner,admin,member,viewer}');
  end if;
end $$;

create or replace function charter._notify_join_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_unit text;
  v_users uuid[];
begin
  if new.status <> 'pending' or to_regprocedure('public.notify(uuid,text,text,text,text,text,uuid[],text[],text,uuid,jsonb,text)') is null then
    return null;
  end if;
  select coalesce(nullif(p.display_name, ''), nullif(p.email, ''), 'Someone') into v_name
  from charter.member_profiles p where p.id = new.profile_id;
  select u.name into v_unit from charter.units u where u.id = new.unit_id;
  select array_agg(m.user_id) into v_users
  from public.memberships m
  where m.org_id = new.org_id and charter.has_permission(m.user_id, 'members.manage', new.unit_id);
  if v_users is null then return null; end if;
  perform public.notify(new.org_id, 'charter.join_requested',
    format('%s has asked to join %s', coalesce(v_name, 'Someone'), coalesce(v_unit, 'your organization')),
    'This is pending your approval.',
    format('/orgs/%s?tab=members', new.unit_id), 'charter', v_users, '{}', format('join:%s', new.id), auth.uid(),
    jsonb_build_array(
      jsonb_build_object('label', 'Approve', 'schema', 'charter', 'fn', 'approve_membership',
        'args', jsonb_build_object('_membership', new.id), 'comment_arg', '_note'),
      jsonb_build_object('label', 'Decline', 'schema', 'charter', 'fn', 'decline_membership',
        'args', jsonb_build_object('_membership', new.id), 'comment_arg', '_note')),
    'charter_join_requests');
  return null;
end;
$$;
revoke all on function charter._notify_join_request() from public, anon, authenticated;
drop trigger if exists notify_join_request on charter.memberships;
create trigger notify_join_request after insert on charter.memberships
  for each row execute function charter._notify_join_request();
