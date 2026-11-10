-- Test helpers. Loaded first, as superuser.
create schema tests;
-- Core accepts invitations only from confirmed email addresses: test accounts are confirmed.
alter table auth.users alter column email_confirmed_at set default now();
grant usage on schema tests to authenticated, anon, service_role;

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

-- Fixture (call inside each test transaction as superuser):
-- national N with chapters A and B; users n (national admin), a (chapter A admin), m (member of A), x (outsider)
create function tests.fixture() returns void language plpgsql as $$
declare _admin uuid; _member uuid;
begin
  insert into auth.users (id, email) values
    ('11111111-0000-4000-8000-000000000001', 'n@test.org'),
    ('11111111-0000-4000-8000-000000000002', 'a@test.org'),
    ('11111111-0000-4000-8000-000000000003', 'm@test.org'),
    ('11111111-0000-4000-8000-000000000004', 'x@test.org');
  -- The national is the customer: a core organization, whose top unit has the same id.
  insert into public.organizations (id, name, created_by) values
    ('22222222-0000-4000-8000-000000000001', 'Nat', '11111111-0000-4000-8000-000000000001');
  insert into public.memberships (org_id, user_id, role) values
    ('22222222-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
    ('22222222-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000002', 'member');
  insert into charter.units (id, type, name, slug) values
    ('22222222-0000-4000-8000-000000000001', 'national', 'Nat', 'nat');
  insert into charter.units (id, parent_id, type, name, slug) values
    ('22222222-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000001', 'chapter', 'Chapter A', 'ch-a'),
    ('22222222-0000-4000-8000-000000000003', '22222222-0000-4000-8000-000000000001', 'chapter', 'Chapter B', 'ch-b');
  insert into charter.member_profiles (id, unit_id, user_id, email) values
    ('33333333-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'n@test.org'),
    ('33333333-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000002', 'a@test.org'),
    ('33333333-0000-4000-8000-000000000003', '22222222-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000003', 'm@test.org');
  select id into _admin from charter.roles where key = 'org_admin' and unit_id is null;
  select id into _member from charter.roles where key = 'member' and unit_id is null;
  insert into charter.role_assignments (user_id, role_id, unit_id) values
    ('11111111-0000-4000-8000-000000000001', _admin, '22222222-0000-4000-8000-000000000001'),
    ('11111111-0000-4000-8000-000000000002', _admin, '22222222-0000-4000-8000-000000000002'),
    ('11111111-0000-4000-8000-000000000003', _member, '22222222-0000-4000-8000-000000000002');
end $$;
