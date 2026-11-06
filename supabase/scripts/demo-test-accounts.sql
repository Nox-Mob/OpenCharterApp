-- Demo test accounts and organizations (docs/demo-data.md) for the smoke and end-to-end tests.
-- Used two ways:
--   * CI (replay job): supabase/ci/fixtures.sql runs it on the local stack.
--   * The owner, once, on the new Supabase project (SQL Editor or psql), so the live demo checks
--     have their accounts there too (docs/migration/settings-to-reenter.md §9).
--
-- The password is never written in this file. Set it first, in the same session:
--   SQL Editor: add this line above the script, with the password in place of the dots:
--     select set_config('fixture.demo_password', '........', false);
--   psql:       PGOPTIONS="-c fixture.demo_password=..." psql "$DB_URL" -f demo-test-accounts.sql
-- It must match the SMOKE_DEMO_PASSWORD secret the live checks use.
--
-- Safe to run twice: rows that exist are left as they are (an existing account keeps its
-- password). It refuses to run if a demo ID or slug belongs to a real (non-demo) organization,
-- or if a demo email belongs to an account with a different ID. Everything runs in one
-- transaction: on any error nothing is changed.
begin;

do $fixture$
declare
  _pw text := current_setting('fixture.demo_password', true);
  _users constant uuid[] := array['d0000000-0000-4000-8000-000000000001',
                                  'd0000000-0000-4000-8000-000000000002',
                                  'd0000000-0000-4000-8000-000000000003']::uuid[];
  _emails constant text[] := array['demo-national@opencharter.test',
                                   'demo-chapter@opencharter.test',
                                   'demo-member@opencharter.test'];
  _names constant text[] := array['Nora National', 'Chris Chapter', 'Morgan Member'];
  _nat constant uuid := 'd1000000-0000-4000-8000-000000000001';
  _aus constant uuid := 'd1000000-0000-4000-8000-000000000002';
  _dal constant uuid := 'd1000000-0000-4000-8000-000000000003';
  _admin uuid; _member uuid; _tier uuid; _rank uuid; _life uuid; _p uuid;
  _i int;
begin
  if _pw is null or length(_pw) < 8 or _pw ~ '^\.+$' then
    raise exception 'set fixture.demo_password (8 characters or more) first: see the top of this script';
  end if;

  -- Refuse to touch real organizations.
  if exists (select 1 from public.organizations
             where (id in (_nat, _aus, _dal) or slug in ('demo-national', 'demo-austin', 'demo-dallas'))
               and not is_demo) then
    raise exception 'a demo ID or slug belongs to a real organization; nothing was changed';
  end if;
  if exists (select 1 from public.organizations
             where (id = _nat and slug <> 'demo-national') or (id = _aus and slug <> 'demo-austin')
                or (id = _dal and slug <> 'demo-dallas')) then
    raise exception 'a demo ID is used by another organization; nothing was changed';
  end if;
  for _i in 1..3 loop
    if exists (select 1 from auth.users where lower(email) = _emails[_i] and id <> _users[_i]) then
      raise exception '% belongs to another account; nothing was changed', _emails[_i];
    end if;
  end loop;

  -- ----- accounts (email and password, confirmed) -----
  for _i in 1..3 loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
      values ('00000000-0000-0000-0000-000000000000', _users[_i], 'authenticated', 'authenticated',
        _emails[_i], extensions.crypt(_pw, extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', _names[_i]),
        now(), now(), '', '', '', '', '', '', '', '')
      on conflict (id) do nothing;
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (_users[_i]::text, _users[_i],
        jsonb_build_object('sub', _users[_i]::text, 'email', _emails[_i], 'email_verified', true),
        'email', now(), now(), now())
      on conflict (provider_id, provider) do nothing;
    -- Platform operators can create and delete demo organizations (0022).
    insert into private.platform_operators (user_id) values (_users[_i]) on conflict do nothing;
  end loop;

  -- ----- organizations (demo; the guard makes chapters demo too) -----
  insert into public.organizations (id, type, name, slug, is_demo, created_by)
    values (_nat, 'national', 'Demo National Association', 'demo-national', true, _users[1])
    on conflict (id) do nothing;
  insert into public.organizations (id, parent_id, type, name, slug, created_by) values
    (_aus, _nat, 'chapter', 'Demo Austin Chapter', 'demo-austin', _users[1]),
    (_dal, _nat, 'chapter', 'Demo Dallas Chapter', 'demo-dallas', _users[1])
    on conflict (id) do nothing;

  -- ----- people and roles -----
  select id into _admin from public.roles where key = 'org_admin' and org_id is null;
  select id into _member from public.roles where key = 'member' and org_id is null;
  insert into public.org_member_profiles (org_id, user_id, email, display_name)
    select o, u, e, n from (values
      (_nat, _users[1], _emails[1], _names[1]),
      (_aus, _users[1], _emails[1], _names[1]),
      (_aus, _users[2], _emails[2], _names[2]),
      (_aus, _users[3], _emails[3], _names[3])) v(o, u, e, n)
    where not exists (select 1 from public.org_member_profiles p where p.org_id = v.o and p.user_id = v.u);
  insert into public.role_assignments (user_id, role_id, org_id)
    select u, r, o from (values
      (_users[1], _admin, _nat),
      (_users[1], _member, _aus),
      (_users[2], _admin, _aus),
      (_users[3], _member, _aus)) v(u, r, o)
    where not exists (select 1 from public.role_assignments a
                      where a.user_id = v.u and a.role_id = v.r and a.org_id = v.o);

  -- ----- national settings -----
  insert into public.org_settings (org_id, key, value, mode) values
    (_nat, 'membership.child_levels_allowed', 'false', 'override'),
    (_nat, 'membership.chapter_dues', '"none"', 'override'),
    (_nat, 'membership.national_dues_required', 'false', 'override'),
    (_nat, 'membership.child_approval', '"auto"', 'override'),
    (_nat, 'membership.approval_required', 'false', 'override'),
    (_nat, 'membership.grace_days', '45', 'locked')
    on conflict (org_id, key) do nothing;

  -- ----- member and chapter fields -----
  insert into public.attribute_definitions (org_id, applies_to, key, label, data_type, required, visibility, member_editable, sort_order)
    values
      (_nat, 'member', 'rank', 'Rank', 'text', true, 'members', true, 1),
      (_nat, 'member', 'join_date', 'Join date', 'date', false, 'admins', false, 2),
      (_nat, 'member', 'salutation', 'Salutation', 'text', false, 'members', true, 3),
      (_nat, 'chapter', 'charter_date', 'Charter date', 'date', false, 'members', false, 1),
      (_nat, 'chapter', 'chapter_number', 'Chapter number', 'text', false, 'members', false, 2)
    on conflict (org_id, applies_to, key) do nothing;

  -- ----- levels: Regular, 1 year $150, 3 years $250, lifetime $500 -----
  insert into public.membership_tiers (org_id, key, name) values (_nat, 'regular', 'Regular')
    on conflict do nothing;
  select id into _tier from public.membership_tiers where org_id = _nat and key = 'regular';
  insert into public.tier_terms (tier_id, org_id, key, label, length_count, length_unit, price_minor)
    values (_tier, _nat, '1_year', '1 year', 1, 'year', 15000),
           (_tier, _nat, '3_years', '3 years', 3, 'year', 25000),
           (_tier, _nat, 'lifetime', 'Lifetime', null, null, 50000)
    on conflict do nothing;

  -- ----- board: six required seats for every chapter -----
  insert into public.seat_templates (org_id, key, title, required, scope, sort_order)
    select _nat, k, t, true, 'chapters', s from (values
      ('president', 'President', 1), ('vice_president', 'Vice-President', 2),
      ('secretary', 'Secretary', 3), ('treasurer', 'Treasurer', 4),
      ('vp_awards', 'VP of Awards', 5), ('vp_membership', 'VP of Membership', 6)) v(k, t, s)
    on conflict (org_id, key) do nothing;
end
$fixture$;

-- Steps that go through the app's own functions run as Nora National, the national's admin.
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true),
       set_config('request.jwt.claims', '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

-- Test payments at the national (no real money).
select public.connect_test_gateway('d1000000-0000-4000-8000-000000000001')
where not exists (select 1 from public.gateway_connections
                  where org_id = 'd1000000-0000-4000-8000-000000000001' and gateway = 'test');

reset role;
commit;
