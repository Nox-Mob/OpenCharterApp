-- OpenCharterApp's part of the suite demo, STAGING (and local development) only. Applied by
-- scripts/migrate.mjs --seed (Migrate → staging), recorded under "opencharterapp:seed".
--
-- The suite has one demo organization, "Riverside Community Association", owned by the demo
-- account demo@demo.openapphub.org, and one empty test account test@demo.openapphub.org (both
-- password OpenAppHubDemo2026). OpenAppHub creates them and resets everything every 12 hours
-- (hub.reset_suite_demo, the hub's demo-reset workflow), calling charter.demo_fill for the
-- roster: a neighbourhood association with about 140 households, dues, receipts and its board,
-- most of it from the last three months, dated from the day it runs.
--
-- Without the hub (a self-hosted development database) this file creates the same two
-- accounts and the organization itself, once.

do $guard$
begin
  if to_regclass('hub.instance') is not null then
    if coalesce((select environment from hub.instance where id), '') <> 'staging' then
      raise exception 'Refusing to seed: this database is not marked staging.';
    end if;
  elsif exists (select 1 from public.organizations where id <> 'de000000-0000-4000-8000-0000000000a1') then
    raise exception 'Refusing to seed: this database has real organizations.';
  end if;
end
$guard$;

-- Charter's records for the demo organization. Run by the hub's reset as the database owner,
-- after the organization (owned by p_owner) was created afresh. The roster, dues and board go
-- through Charter's own functions as the owner, so standing, receipts and the audit log are
-- exactly what the app makes.
create or replace function charter.demo_fill(p_org uuid, p_owner uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_first text[] := array['James','Mary','Robert','Patricia','John','Jennifer','Michael','Linda',
    'David','Elizabeth','William','Barbara','Richard','Susan','Joseph','Jessica','Thomas','Sarah',
    'Charles','Karen','Daniel','Nancy','Matthew','Betty','Anthony','Sandra','Mark','Margaret',
    'Steven','Ashley','Andrew','Emily','Paul','Donna','Joshua','Michelle','Kevin','Amanda','Brian',
    'Melissa','George','Rebecca','Jason','Laura','Ryan','Amy','Eric','Angela','Nicholas','Rachel',
    'Aisha','Wei','Mateo','Fatima','Hiroshi','Sofia','Kwame','Ines','Ravi','Leila'];
  v_last text[] := array['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis',
    'Rodriguez','Martinez','Hernandez','Lopez','Wilson','Anderson','Thomas','Taylor','Moore',
    'Jackson','Martin','Thompson','White','Harris','Clark','Ramirez','Lewis','Robinson','Walker',
    'Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill','Flores','Green','Adams',
    'Nelson','Baker','Rivera','Campbell','Mitchell','Carter','Roberts','Okafor','Kim','Patel',
    'Sato','Haddad'];
  v_streets text[] := array['Maple Ave','River Rd','Oak St','Willow Ln','Elm St','Bluff Dr','Mill St','Park Pl'];
  v_board text[] := array['Jordan Lee','Sam Chen','Taylor Brooks','Priya Patel','Marcus Johnson'];
  v_titles text[] := array['President','Vice President','Secretary','Treasurer','Member at Large'];
  t_household uuid; t_individual uuid; t_senior uuid;
  r_household uuid; r_individual uuid; r_senior uuid;
  d_street uuid; d_volunteer uuid;
  v_seats uuid[] := '{}';
  v_seat uuid;
  v_profile uuid; v_membership uuid; v_owner_profile uuid;
  v_officers uuid[] := '{}';
  v_term uuid; v_price int; v_start date; v_kind text;
  v_methods charter.payment_method[] := array['check','card','card','cash','bank_transfer']::charter.payment_method[];
  v_used text[] := '{}';
  v_name text; v_i int; v_n int;
  v_admin_role uuid;
begin
  perform setseed(0.27182);

  -- The top unit (same id as the organization), the owner's roster record and admin role,
  -- as charter.ensure_top_unit does when an owner opens a hub organization in Charter.
  -- A demo organization (D-148): test payments only, never emails.
  insert into charter.units (id, name, slug, type, parent_id, created_by, is_demo)
  select p_org, o.name, 'riverside-community-association', 'standalone', null, p_owner, true
  from public.organizations o where o.id = p_org;
  insert into charter.member_profiles (unit_id, user_id, email, display_name)
  select p_org, p_owner, u.email, 'Alex Morgan' from auth.users u where u.id = p_owner
  returning id into v_owner_profile;
  select id into v_admin_role from charter.roles where key = 'org_admin' and unit_id is null;
  insert into charter.role_assignments (user_id, role_id, unit_id) values (p_owner, v_admin_role, p_org);
  insert into charter.tax_profiles (unit_id, legal_name, ein, tax_status, address_line1, city, region, postal_code, country)
  values (p_org, 'Riverside Community Association', '47-1234567', '501(c)(4)', '210 River Rd',
    'Riverside', 'IL', '60546', 'US');

  -- Levels and their prices.
  insert into charter.membership_tiers (unit_id, key, name, sort_order) values (p_org, 'household', 'Household', 10) returning id into t_household;
  insert into charter.membership_tiers (unit_id, key, name, sort_order) values (p_org, 'individual', 'Individual', 20) returning id into t_individual;
  insert into charter.membership_tiers (unit_id, key, name, sort_order) values (p_org, 'senior', 'Senior (65+)', 30) returning id into t_senior;
  insert into charter.tier_terms (tier_id, unit_id, key, label, length_count, length_unit, price_minor, sort_order)
  values (t_household, p_org, '1_year', '1 year', 1, 'year', 4000, 10) returning id into r_household;
  insert into charter.tier_terms (tier_id, unit_id, key, label, length_count, length_unit, price_minor, sort_order)
  values (t_individual, p_org, '1_year', '1 year', 1, 'year', 2500, 10) returning id into r_individual;
  insert into charter.tier_terms (tier_id, unit_id, key, label, length_count, length_unit, price_minor, sort_order)
  values (t_senior, p_org, '1_year', '1 year', 1, 'year', 1500, 10) returning id into r_senior;

  -- Member fields.
  insert into charter.attribute_definitions (unit_id, applies_to, key, label, data_type, required,
      visibility, member_editable, show_in_directory, sort_order)
  values (p_org, 'member', 'street', 'Street', 'choice', false, 'members', true, true, 10)
  returning id into d_street;
  for v_i in 1..array_length(v_streets, 1) loop
    insert into charter.attribute_options (definition_id, unit_id, value, label, sort_order)
    values (d_street, p_org, lower(replace(v_streets[v_i], ' ', '_')), v_streets[v_i], v_i * 10);
  end loop;
  insert into charter.attribute_definitions (unit_id, applies_to, key, label, data_type, required,
      visibility, member_editable, show_in_directory, sort_order)
  values (p_org, 'member', 'volunteer', 'Wants to volunteer', 'boolean', false, 'admins', true, false, 20)
  returning id into d_volunteer;

  -- From here on, act as the owner (row rules, permissions and the audit trail apply).
  perform set_config('request.jwt.claim.sub', p_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  perform charter.connect_test_gateway(p_org);

  -- The owner and the five other directors: current household members.
  v_membership := charter.record_membership(v_owner_profile, r_household, current_date - 70, 4000,
    'card', 'Annual renewal', current_date - 70);
  v_officers := v_officers || v_owner_profile;
  for v_i in 1..5 loop
    v_profile := charter.admin_create_member(p_org, v_board[v_i],
      lower(replace(v_board[v_i], ' ', '.')) || '@riverside.example.org');
    v_membership := charter.record_membership(v_profile, r_household, current_date - (20 + v_i * 13), 4000,
      v_methods[1 + (v_i % 5)], 'Annual renewal', current_date - (20 + v_i * 13));
    v_officers := v_officers || v_profile;
    v_used := v_used || v_board[v_i];
  end loop;

  -- About 135 more households: most joined or renewed in the last three months, some during
  -- the year, a few in their grace period, lapsed or cancelled.
  for v_n in 1..135 loop
    loop
      v_name := v_first[1 + floor(random() * array_length(v_first, 1))::int] || ' ' ||
                v_last[1 + floor(random() * array_length(v_last, 1))::int];
      exit when not v_name = any (v_used);
    end loop;
    v_used := v_used || v_name;
    v_kind := case
      when v_n <= 70 then 'recent'       -- joined or renewed in the last 90 days
      when v_n <= 110 then 'current'     -- renewed 4–11 months ago
      when v_n <= 120 then 'grace'       -- term ended in the last 3 weeks
      when v_n <= 131 then 'lapsed'      -- ended 1–3 months ago
      else 'cancelled' end;
    v_profile := charter.admin_create_member(p_org, v_name,
      lower(replace(v_name, ' ', '.')) || v_n || '@example.org');
    perform charter.set_attribute_value(d_street, v_profile,
      to_jsonb(lower(replace(v_streets[1 + floor(random() * array_length(v_streets, 1))::int], ' ', '_'))));
    if random() < 0.3 then
      perform charter.set_attribute_value(d_volunteer, v_profile, 'true'::jsonb);
    end if;
    v_term := case when random() < 0.6 then r_household when random() < 0.7 then r_individual else r_senior end;
    v_price := case v_term when r_household then 4000 when r_individual then 2500 else 1500 end;
    v_start := current_date - case v_kind
      when 'recent' then floor(random() * 88)::int + 1
      when 'current' then 120 + floor(random() * 210)::int
      when 'grace' then 366 + floor(random() * 20)::int
      when 'lapsed' then 395 + floor(random() * 60)::int
      else 200 + floor(random() * 100)::int end;
    v_membership := charter.record_membership(v_profile, v_term, v_start, v_price,
      v_methods[1 + floor(random() * 5)::int],
      case when v_kind = 'recent' and random() < 0.4 then '' else 'Annual renewal' end, v_start);
    if v_kind = 'cancelled' then
      perform charter.cancel_membership(v_membership, 'Moved out of the neighbourhood');
    end if;
  end loop;

  -- The board: five seats, filled by the directors (the same people as in OpenBoardApp).
  for v_i in 1..5 loop
    v_seat := charter.define_seat(_org => p_org, _key => replace(lower(v_titles[v_i]), ' ', '_'),
      _title => v_titles[v_i], _required => v_i <= 4, _scope => 'self',
      _seat_count => case when v_i = 5 then 2 else 1 end, _term_count => 2, _term_unit => 'year',
      _sort_order => v_i * 10);
    v_seats := v_seats || v_seat;
  end loop;
  for v_i in 1..6 loop
    perform charter.appoint_officer(p_org, v_seats[least(v_i, 5)], v_officers[v_i],
      current_date - case when v_i in (1, 2, 4) then 420 else 150 end,
      case when v_i = 6 then 2 else 1 end);
  end loop;

  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

revoke all on function charter.demo_fill(uuid, uuid) from public, anon, authenticated;

-- Fill now: through the hub's reset when it's there (it recreates the organization and calls
-- every app), otherwise create the two accounts and the organization here, once.
do $fill$
declare
  c_org constant uuid := 'de000000-0000-4000-8000-0000000000a1';
  c_demo constant uuid := 'de000000-0000-4000-8000-000000000001';
  c_test constant uuid := 'de000000-0000-4000-8000-000000000002';
  r record;
begin
  if to_regprocedure('hub.reset_suite_demo()') is not null then
    perform hub.reset_suite_demo();
    return;
  end if;
  if exists (select 1 from public.organizations where id = c_org) then
    if not exists (select 1 from charter.units where id = c_org) then
      perform charter.demo_fill(c_org, c_demo);
    end if;
    return;
  end if;
  for r in select * from (values
      (c_demo, 'demo@demo.openapphub.org', 'Alex Morgan'),
      (c_test, 'test@demo.openapphub.org', 'Test Account')) v(id, email, name) loop
    if not exists (select 1 from auth.users where id = r.id) then
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token,
        recovery_token, email_change_token_new, email_change, email_change_token_current,
        reauthentication_token, phone_change, phone_change_token)
      values ('00000000-0000-0000-0000-000000000000', r.id, 'authenticated', 'authenticated', r.email,
        extensions.crypt('OpenAppHubDemo2026', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', r.name),
        now(), now(), '', '', '', '', '', '', '', '');
      insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (r.id::text, r.id, jsonb_build_object('sub', r.id::text, 'email', r.email, 'email_verified', true),
        'email', now(), now(), now());
    end if;
  end loop;
  insert into public.organizations (id, name, slug, created_by)
  values (c_org, 'Riverside Community Association', 'riverside-community-association', c_demo);
  insert into public.memberships (org_id, user_id, role) values (c_org, c_demo, 'owner');
  perform charter.demo_fill(c_org, c_demo);
end
$fill$;
