-- S-25 part 2: what can start an organization's workflows in OpenCharterApp (core 0009).
--   charter.payment_received   a payment is paid (online or recorded by hand)
--   charter.member_joined      a membership becomes active for someone who had none in that unit
--   charter.membership_lapsed  a membership's grace period ends (once per paid-through date)
-- Each gives its workflow the member: name, email, level, term, their chapter (and its unit, so
-- "the chapter president" and "the regional president" resolve), and every member field the
-- organization defines (member.fields.<key>; ordered lists like rank carry their place in the list,
-- so a workflow can say "rank between SPC and SFC"). Events belong to the unit's organization:
-- a national's workflows see its own chapters' units; a chapter with its own organization in
-- OpenAppHub keeps its OpenCharterApp data in its national's units, so the national decides.

create or replace function charter._wf_member_ctx(p_profile uuid, p_unit uuid, p_membership uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_p charter.member_profiles;
  v_u charter.units;
  v_m charter.memberships;
  v_fields jsonb := '{}';
  r record;
begin
  select * into v_p from charter.member_profiles where id = p_profile;
  select * into v_u from charter.units where id = coalesce(p_unit, v_p.unit_id);
  if p_membership is not null then
    select * into v_m from charter.memberships where id = p_membership;
  else
    select * into v_m from charter.memberships where profile_id = p_profile order by created_at desc limit 1;
  end if;
  for r in
    select d.key, d.data_type, av.value,
           (select o.sort_order from charter.attribute_options o
            where o.definition_id = d.id and o.value = av.value #>> '{}') as ord
    from charter.attribute_values av
    join charter.attribute_definitions d on d.id = av.definition_id
    where av.entity_id = p_profile and d.applies_to = 'member'
  loop
    v_fields := v_fields || jsonb_build_object(r.key,
      case when r.data_type = 'ordered' then jsonb_build_object('value', r.value #>> '{}', 'order', r.ord)
           when jsonb_typeof(r.value) = 'array' then to_jsonb((select string_agg(x, ', ') from jsonb_array_elements_text(r.value) x))
           else r.value end);
  end loop;
  return jsonb_build_object(
    'member', jsonb_build_object(
      'name', coalesce(v_p.display_name, ''), 'email', coalesce(v_p.email, ''),
      'level', coalesce((select t.name from charter.membership_tiers t where t.id = v_m.tier_id), ''),
      'term', coalesce((select x.label from charter.tier_terms x where x.id = v_m.term_id), ''),
      'paid_through', v_m.paid_through, 'joined_on', v_m.joined_on,
      'chapter', coalesce(v_u.name, ''), 'chapter_type', coalesce(v_u.type::text, ''),
      'fields', v_fields),
    'unit_id', v_u.id,
    'subject_user_id', v_p.user_id,
    'subject_email', nullif(v_p.email, ''),
    'link', format('/orgs/%s?tab=members', v_u.id), 'link_app', 'charter',
    'summary', coalesce(nullif(v_p.display_name, ''), v_p.email, 'A member'));
end;
$$;

-- The organization's member fields, for the builder's conditions.
create or replace function charter.wf_member_fields(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'key', 'member.fields.' || d.key, 'label', d.label,
      'type', case d.data_type::text when 'ordered' then 'ordered' when 'number' then 'number' when 'date' then 'date'
                                     when 'boolean' then 'boolean' when 'choice' then 'choice' else 'text' end,
      'options', (select coalesce(jsonb_agg(o.value order by o.sort_order), '[]') from charter.attribute_options o
                  where o.definition_id = d.id and o.active),
      'orders', (select coalesce(jsonb_agg(o.sort_order order by o.sort_order), '[]') from charter.attribute_options o
                 where o.definition_id = d.id and o.active))
      order by d.sort_order, d.label), '[]')
  from (select distinct on (d.key) d.* from charter.attribute_definitions d
        where d.org_id = p_org and d.applies_to = 'member' and d.active
        order by d.key, d.created_at) d;
$$;

create or replace function charter._wf_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') and new.profile_id is not null then
    perform public.emit_automation_event(new.org_id, 'charter.payment_received',
      charter._wf_member_ctx(new.profile_id, new.unit_id, new.membership_id) || jsonb_build_object(
        'payment', jsonb_build_object('amount', round(new.amount_minor / 100.0, 2), 'currency', upper(new.currency),
          'method', coalesce(new.method::text, ''), 'purpose', coalesce(new.purpose::text, ''), 'received_on', new.received_on),
        'link', format('/orgs/%s?tab=payments', new.unit_id),
        'summary', format('%s %s', round(new.amount_minor / 100.0, 2), upper(new.currency))));
  end if;
  return new;
end;
$$;

create or replace function charter._wf_member_joined()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active')
     and not exists (select 1 from charter.memberships m where m.profile_id = new.profile_id and m.unit_id = new.unit_id
                     and m.id <> new.id and m.status = 'active') then
    perform public.emit_automation_event(new.org_id, 'charter.member_joined',
      charter._wf_member_ctx(new.profile_id, new.unit_id, new.id));
  end if;
  return new;
end;
$$;

drop trigger if exists payments_wf on charter.payments;
create trigger payments_wf after insert or update of status on charter.payments
  for each row execute function charter._wf_payment();
drop trigger if exists memberships_wf_joined on charter.memberships;
create trigger memberships_wf_joined after insert or update of status on charter.memberships
  for each row execute function charter._wf_member_joined();

-- Lapsed: the grace period ended in the last 30 days (older lapses are left alone).
create or replace function charter.wf_membership_lapsed(p_org uuid, p_params jsonb)
returns table (dedupe text, ctx jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select format('lapsed:%s:%s', m.id, m.paid_through), charter._wf_member_ctx(m.profile_id, m.unit_id, m.id)
  from charter.memberships m
  where m.org_id = p_org and m.status = 'active' and not m.lifetime and m.paid_through is not null
    and m.paid_through + charter.grace_days(m.unit_id) < current_date
    and m.paid_through + charter.grace_days(m.unit_id) >= current_date - 30
    and not exists (select 1 from charter.memberships n where n.profile_id = m.profile_id and n.unit_id = m.unit_id
                    and n.id <> m.id and n.status = 'active' and (n.lifetime or n.paid_through > m.paid_through));
$$;

revoke all on function charter._wf_member_ctx(uuid, uuid, uuid), charter.wf_member_fields(uuid),
  charter._wf_payment(), charter._wf_member_joined(), charter.wf_membership_lapsed(uuid, jsonb)
from public, anon, authenticated;
grant execute on function charter.wf_member_fields(uuid), charter.wf_membership_lapsed(uuid, jsonb) to service_role;

do $$
declare
  member_fields jsonb := '[{"key": "member.name", "label": "Member name", "type": "text"},
    {"key": "member.email", "label": "Member email", "type": "text"},
    {"key": "member.level", "label": "Membership level", "type": "text"},
    {"key": "member.term", "label": "Membership term", "type": "text"},
    {"key": "member.chapter", "label": "Chapter (or unit)", "type": "text"},
    {"key": "member.chapter_type", "label": "Unit type (chapter, region, national)", "type": "text"},
    {"key": "member.paid_through", "label": "Paid through", "type": "date"}]';
begin
  perform public.register_automation_trigger(
    'charter.payment_received', 'charter', 'A payment is received',
    'When a dues or other payment is paid, online or recorded by hand.',
    'event', null, '{}',
    member_fields || '[{"key": "payment.amount", "label": "Amount", "type": "number"},
      {"key": "payment.method", "label": "Paid by", "type": "text"},
      {"key": "payment.purpose", "label": "What it was for", "type": "text"}]'::jsonb,
    'charter.wf_member_fields', '{member}', 30);
  perform public.register_automation_trigger(
    'charter.member_joined', 'charter', 'Someone becomes a member',
    'When a membership becomes active for someone new to that chapter or organization.',
    'event', null, '{}', member_fields, 'charter.wf_member_fields', '{member}', 31);
  perform public.register_automation_trigger(
    'charter.membership_lapsed', 'charter', 'A membership lapses',
    'When a membership''s grace period ends without a renewal.',
    'scan', 'charter.wf_membership_lapsed', '{}', member_fields, 'charter.wf_member_fields', '{member}', 32);
end $$;

-- Who a workflow can send to in OpenCharterApp: whoever holds a board seat, in the unit the
-- workflow is about (the member's chapter), its parent, its region, or the national.
create or replace function charter.wf_seat_holders(p_org uuid, p_params jsonb, p_ctx jsonb)
returns table (user_id uuid, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_unit uuid := nullif(p_ctx->>'unit_id', '')::uuid;
  v_target uuid;
begin
  if v_unit is null then
    select u.id into v_unit from charter.units u where u.org_id = p_org and u.parent_id is null order by u.created_at limit 1;
  end if;
  select case coalesce(p_params->>'level', 'unit')
      when 'unit' then u.id
      when 'parent' then coalesce(u.parent_id, u.id)
      when 'national' then coalesce((select a.id from charter.units a where a.id = any (u.ancestor_ids) and a.parent_id is null limit 1), u.id)
      when 'region' then (select a.id from charter.units a where (a.id = any (u.ancestor_ids) or a.id = u.id) and a.type = 'region'
                          order by array_position(u.ancestor_ids, a.id) desc nulls first limit 1)
    end
  into v_target
  from charter.units u where u.id = v_unit and u.org_id = p_org;
  if v_target is null then return; end if;
  return query
    select p.user_id, nullif(p.email, '')
    from charter.appointments ap
    join charter.seat_templates t on t.id = ap.template_id
    join charter.member_profiles p on p.id = ap.profile_id
    where ap.unit_id = v_target and t.key = p_params->>'seat' and ap.ended_on is null and ap.starts_on <= current_date;
end;
$$;

-- The seats the organization has, for the builder's choices: { "seat": ["commander", …] }.
create or replace function charter.wf_seat_options(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('seat', coalesce(jsonb_agg(x.key order by x.key), '[]'))
  from (select distinct t.key from charter.seat_templates t where t.org_id = p_org and t.active) x;
$$;

revoke all on function charter.wf_seat_holders(uuid, jsonb, jsonb), charter.wf_seat_options(uuid) from public, anon, authenticated;
grant execute on function charter.wf_seat_holders(uuid, jsonb, jsonb), charter.wf_seat_options(uuid) to service_role;

select public.register_automation_recipient(
  'charter.seat', 'charter', 'Whoever holds a board seat',
  'The current holder of a seat (like President or Commander) in the member''s chapter, its region, or the national.',
  '{"seat": {"type": "text", "label": "Seat (its key, e.g. president)", "max_length": 80},
    "level": {"type": "choice", "label": "Whose seat", "options": ["unit", "parent", "region", "national"]}}',
  'charter.wf_seat_holders', 10, 'charter.wf_seat_options');
