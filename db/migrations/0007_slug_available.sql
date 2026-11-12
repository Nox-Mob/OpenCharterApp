-- Is a web address (unit slug) free? Web addresses are unique across every organization, which
-- row security hides from each other, so the create dialog asks the database: a yes/no only,
-- never which organization has it.
create function charter.slug_available(p_slug text) returns boolean
language sql stable security definer set search_path = '' as $$
  select lower(btrim(coalesce(p_slug, ''))) ~ '^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$'
     and not exists (select 1 from charter.units u where u.slug = lower(btrim(p_slug)));
$$;

revoke all on function charter.slug_available(text) from public, anon;
grant execute on function charter.slug_available(text) to authenticated;
