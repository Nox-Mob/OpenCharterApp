-- Steps OpenCharterApp offers the workflow designer (core 0012, S-28).
--
-- charter.find_members (a lookup): the organization's members, filtered, as a list a later step
-- can use ("for each member", an email to each, a count). Each row has what the member triggers
-- carry (name, email, level, term, paid through, joined, chapter, the organization's own member
-- fields such as rank) plus their standing and ids. Runs as the organization (owner decision
-- 2026-11-12), inside it only.

create or replace function charter.wf_find_members(p_org uuid, p_params jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_standing text := coalesce(nullif(p_params ->> 'standing', ''), 'current');
  v_level text := nullif(btrim(coalesce(p_params ->> 'level', '')), '');
  v_chapter text := nullif(btrim(coalesce(p_params ->> 'chapter', '')), '');
  v_exp int := nullif(p_params ->> 'expires_within_days', '')::int;
  v_joined int := nullif(p_params ->> 'joined_within_days', '')::int;
  v_limit int := least(greatest(coalesce(nullif(p_params ->> 'limit', '')::int, 500), 1), 5000);
  v_rows jsonb;
  v_total int;
begin
  with latest as (
    select distinct on (p.id) p.id as profile_id, p.user_id, u.id as unit_id, u.name as chapter, m.id as membership_id,
           m.status, m.paid_through, m.lifetime, m.joined_on, t.name as level
    from charter.member_profiles p
    join charter.units u on u.id = p.unit_id
    join charter.memberships m on m.profile_id = p.id
    join charter.membership_tiers t on t.id = m.tier_id
    where u.org_id = p_org and p.left_at is null
    order by p.id, m.created_at desc
  ), picked as (
    select l.*,
      case when l.status = 'active' and (l.lifetime or l.paid_through >= current_date) then 'current'
           when l.status = 'pending' then 'pending'
           else 'lapsed' end as standing
    from latest l
  ), filtered as (
    select * from picked f
    where (v_standing = 'any' or f.standing = v_standing)
      and (v_level is null or lower(f.level) = lower(v_level))
      and (v_chapter is null or lower(f.chapter) = lower(v_chapter))
      and (v_exp is null or (not f.lifetime and f.paid_through between current_date and current_date + v_exp))
      and (v_joined is null or f.joined_on >= current_date - v_joined)
  )
  select count(*)::int,
         coalesce(jsonb_agg(row_obj order by row_obj ->> 'name') filter (where rn <= v_limit), '[]')
    into v_total, v_rows
  from (
    select row_number() over (order by (charter._wf_member_ctx(f.profile_id, f.unit_id, f.membership_id) #>> '{member,name}')) as rn,
           (charter._wf_member_ctx(f.profile_id, f.unit_id, f.membership_id) -> 'member')
             || jsonb_build_object('profile_id', f.profile_id, 'user_id', f.user_id, 'unit_id', f.unit_id,
                                   'standing', f.standing, 'lifetime', f.lifetime) as row_obj
    from filtered f
  ) q;
  return jsonb_build_object('rows', v_rows, 'count', jsonb_array_length(v_rows), 'total', v_total,
    'summary', format('%s %s found', v_total, case when v_total = 1 then 'member' else 'members' end));
end;
$$;
revoke all on function charter.wf_find_members(uuid, jsonb) from public, anon, authenticated;

do $$
begin
  if to_regprocedure('public.register_automation_step(text,text,text,text,text,text,jsonb,jsonb,text[],integer)') is not null then
    perform public.register_automation_step('charter.find_members', 'charter', 'Find members',
      'Look up members, for example everyone whose membership ends in the next 30 days, to use in later steps.',
      'query', 'charter.wf_find_members',
      '{"standing": {"type": "choice", "label": "Standing", "options": ["current", "lapsed", "pending", "any"]},
        "level": {"type": "text", "label": "Level (optional)", "optional": true},
        "chapter": {"type": "text", "label": "Chapter (optional)", "optional": true},
        "expires_within_days": {"type": "int", "label": "Membership ends within (days, optional)", "min": 0, "max": 730, "optional": true},
        "joined_within_days": {"type": "int", "label": "Joined in the last (days, optional)", "min": 0, "max": 3650, "optional": true},
        "limit": {"type": "int", "label": "At most", "min": 1, "max": 5000, "optional": true}}',
      '[{"key": "rows", "label": "Members", "type": "list", "fields": [
          {"key": "name", "label": "Name", "type": "text"}, {"key": "email", "label": "Email", "type": "text"},
          {"key": "level", "label": "Level", "type": "text"}, {"key": "term", "label": "Term", "type": "text"},
          {"key": "paid_through", "label": "Paid through", "type": "date"}, {"key": "joined_on", "label": "Joined", "type": "date"},
          {"key": "chapter", "label": "Chapter", "type": "text"}, {"key": "standing", "label": "Standing", "type": "text"},
          {"key": "user_id", "label": "Account", "type": "text"}, {"key": "fields", "label": "Member fields", "type": "object"}]},
        {"key": "count", "label": "How many", "type": "number"},
        {"key": "total", "label": "How many matched (before the limit)", "type": "number"}]',
      '{}', 5);
  end if;
end $$;
