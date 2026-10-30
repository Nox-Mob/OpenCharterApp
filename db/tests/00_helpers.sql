-- Test helpers. Loaded first, as superuser.
create schema tests;
grant usage on schema tests to authenticated;

-- Act as a signed-in user for the rest of the transaction.
create function tests.as_user(_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', _id::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function tests.as_user(uuid) to public;

create function tests.reset_role() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
grant execute on function tests.reset_role() to public;

-- Expect a statement to fail; message must contain _expect.
create function tests.throws(_sql text, _expect text default '') returns void language plpgsql as $$
begin
  begin
    execute _sql;
  exception when others then
    if position(_expect in sqlerrm) = 0 then
      raise exception 'expected error containing "%", got "%"', _expect, sqlerrm;
    end if;
    return;
  end;
  raise exception 'expected failure but succeeded: %', _sql;
end $$;
grant execute on function tests.throws(text, text) to public;

create function tests.eq(_got anyelement, _want anyelement, _what text) returns void language plpgsql as $$
begin
  if _got is distinct from _want then raise exception '%: expected %, got %', _what, _want, _got; end if;
end $$;
grant execute on function tests.eq(anyelement, anyelement, text) to public;

-- Fixture: national N with chapters A and B. Users: n (national admin), a (chapter A admin), m (member of A), x (outsider)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000n'::text::uuid, 'n@test.org') on conflict do nothing;
