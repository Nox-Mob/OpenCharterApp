-- Home-chapter model (D-166, D-184): members belong to the national, so organizations below a
-- home-chapter national have no membership levels of their own. A new version of
-- tier_parent_check (same signature; body copied from 0020 with the home-chapter rule added)
-- refuses adding or restoring a level below such a national, whatever the old
-- "chapters may create their own levels" setting says. Levels that already exist are left as
-- they are. Tests: db/tests/9O_home_chapter_settings.sql.

create or replace function public.tier_parent_check()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.active and (tg_op = 'INSERT' or not old.active) then
    if public.membership_model(new.org_id) = 'home_chapter'
       and (select parent_id from public.organizations where id = new.org_id) is not null then
      raise exception 'members belong to the national organization; chapters don''t have their own membership levels';
    end if;
    if public.ancestor_setting(new.org_id, 'membership.child_levels_allowed') = 'false'::jsonb
       or public.ancestor_setting(new.org_id, 'membership.chapter_dues') #>> '{}' = 'none' then
      raise exception 'your parent organization manages membership levels';
    end if;
  end if;
  return new;
end $$;
