-- ===== Fix: deleting an organization that used the home-chapter model (0030) =====
-- Deleting a chapter sets affiliation_history.from_org_id / to_org_id to null (ON DELETE SET
-- NULL), and deleting a national removes its membership.model setting. Both are cascades from
-- the organization's deletion (e.g. delete_demo_organization), but the guards from 0030 refused
-- them ("chapter history can't be changed", "the membership model can't be changed once
-- chosen"). The guards now let cascades through (pg_trigger_depth() > 1) and still refuse direct
-- changes. Found by the end-to-end lifecycle test. Additive only (D-125).

create or replace function public.affiliation_history_append_only()
returns trigger language plpgsql set search_path = public as $$
begin
  -- a cascade from deleting an organization or a membership (delete, or set null)
  if pg_trigger_depth() > 1 then return case when tg_op = 'DELETE' then old else new end; end if;
  raise exception 'chapter history can''t be changed';
end $$;

create or replace function public.membership_model_guard()
returns trigger language plpgsql set search_path = public as $$
declare _o public.organizations;
begin
  if tg_op = 'DELETE' then
    -- removing the whole organization (a cascade, e.g. deleting a demo org) takes it along
    if pg_trigger_depth() > 1 then return old; end if;
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
