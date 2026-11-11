-- OpenCharterApp's suite demo, second version: varied levels and lengths. STAGING (and local
-- development) only, recorded under "opencharterapp:seed" like 0001, which stays as it was
-- applied (the runner refuses changed files).
--
-- Replaces charter.demo_fill: Household (monthly, 1 year, 2 years), Individual (monthly, 1 year,
-- 2 years, lifetime), Senior (1 year, lifetime), Student (6 months, 1 year) and Business Sponsor
-- (1 year), with real payment history: monthly members' dues, renewals, receipts. Then rebuilds
-- the demo: through the hub's reset when the hub is here, otherwise by recreating the demo
-- organization and the two accounts (demo@ and test@demo.openapphub.org, OpenAppHubDemo2026).

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
  v_tier uuid;
  -- The level catalogue: one entry per level and length (term), with its price, length in days
  -- (null for lifetime) and how common it is among members.
  v_terms uuid[] := '{}'; v_term_price int[] := '{}'; v_term_days int[] := '{}';
  v_term_weight int[] := '{}'; v_weight_total int := 0;
  r_household_year uuid; r_individual_2y uuid; r_household_2y uuid; r_individual_year uuid;
  v_pick int; v_k int; v_days int; v_prior int; v_paid date;
  d_street uuid; d_volunteer uuid;
  v_seats uuid[] := '{}';
  v_seat uuid;
  v_profile uuid; v_membership uuid; v_owner_profile uuid;
  v_officers uuid[] := '{}';
  v_term uuid; v_price int; v_start date; v_kind text; v_t int;
  v_method charter.payment_method;
  v_methods charter.payment_method[] := array['check','card','card','cash','bank_transfer']::charter.payment_method[];
  v_used text[] := '{}';
  v_name text; v_i int; v_n int;
  v_admin_role uuid;
  r record;
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

  -- Levels and their lengths, as a real association offers them.
  insert into charter.membership_tiers (unit_id, key, name, description, sort_order)
  values (p_org, 'household', 'Household', 'Everyone living at one address.', 10) returning id into v_tier;
  insert into charter.tier_terms (tier_id, unit_id, key, label, length_count, length_unit, price_minor, sort_order) values
    (v_tier, p_org, 'monthly', 'Monthly', 1, 'month', 400, 10),
    (v_tier, p_org, '1_year', '1 year', 1, 'year', 4000, 20),
    (v_tier, p_org, '2_years', '2 years', 2, 'year', 7500, 30);
  insert into charter.membership_tiers (unit_id, key, name, description, sort_order)
  values (p_org, 'individual', 'Individual', 'One adult.', 20) returning id into v_tier;
  insert into charter.tier_terms (tier_id, unit_id, key, label, length_count, length_unit, price_minor, sort_order) values
    (v_tier, p_org, 'monthly', 'Monthly', 1, 'month', 250, 10),
    (v_tier, p_org, '1_year', '1 year', 1, 'year', 2500, 20),
    (v_tier, p_org, '2_years', '2 years', 2, 'year', 4500, 30),
    (v_tier, p_org, 'lifetime', 'Lifetime', null, null, 30000, 40);
  insert into charter.membership_tiers (unit_id, key, name, description, sort_order)
  values (p_org, 'senior', 'Senior (65+)', 'Residents 65 and over.', 30) returning id into v_tier;
  insert into charter.tier_terms (tier_id, unit_id, key, label, length_count, length_unit, price_minor, sort_order) values
    (v_tier, p_org, '1_year', '1 year', 1, 'year', 1500, 10),
    (v_tier, p_org, 'lifetime', 'Lifetime', null, null, 15000, 20);
  insert into charter.membership_tiers (unit_id, key, name, description, sort_order)
  values (p_org, 'student', 'Student', 'Full-time students.', 40) returning id into v_tier;
  insert into charter.tier_terms (tier_id, unit_id, key, label, length_count, length_unit, price_minor, sort_order) values
    (v_tier, p_org, '6_months', '6 months', 6, 'month', 800, 10),
    (v_tier, p_org, '1_year', '1 year', 1, 'year', 1200, 20);
  insert into charter.membership_tiers (unit_id, key, name, description, sort_order)
  values (p_org, 'sponsor', 'Business Sponsor', 'Local businesses supporting the neighbourhood.', 50) returning id into v_tier;
  insert into charter.tier_terms (tier_id, unit_id, key, label, length_count, length_unit, price_minor, sort_order) values
    (v_tier, p_org, '1_year', '1 year', 1, 'year', 25000, 10);

  -- How common each is among members (most pay for a year; some monthly, a few for life).
  for r in
    select t.id, t.price_minor,
      case t.length_unit when 'month' then t.length_count * 30 when 'year' then t.length_count * 365
        when 'day' then t.length_count end as days,
      case mt.key || '/' || t.key
        when 'household/monthly' then 6 when 'household/1_year' then 30 when 'household/2_years' then 8
        when 'individual/monthly' then 5 when 'individual/1_year' then 20
        when 'individual/2_years' then 4 when 'individual/lifetime' then 4
        when 'senior/1_year' then 12 when 'senior/lifetime' then 4
        when 'student/6_months' then 4 when 'student/1_year' then 3
        else 5 end as weight
    from charter.tier_terms t join charter.membership_tiers mt on mt.id = t.tier_id
    where t.unit_id = p_org order by mt.sort_order, t.sort_order
  loop
    v_terms := v_terms || r.id; v_term_price := v_term_price || r.price_minor;
    v_term_days := v_term_days || r.days; v_term_weight := v_term_weight || r.weight;
    v_weight_total := v_weight_total + r.weight;
  end loop;
  select t.id into r_household_year from charter.tier_terms t join charter.membership_tiers mt on mt.id = t.tier_id
    where t.unit_id = p_org and mt.key = 'household' and t.key = '1_year';
  select t.id into r_household_2y from charter.tier_terms t join charter.membership_tiers mt on mt.id = t.tier_id
    where t.unit_id = p_org and mt.key = 'household' and t.key = '2_years';
  select t.id into r_individual_year from charter.tier_terms t join charter.membership_tiers mt on mt.id = t.tier_id
    where t.unit_id = p_org and mt.key = 'individual' and t.key = '1_year';
  select t.id into r_individual_2y from charter.tier_terms t join charter.membership_tiers mt on mt.id = t.tier_id
    where t.unit_id = p_org and mt.key = 'individual' and t.key = '2_years';

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
  v_membership := charter.record_membership(v_owner_profile, r_household_year, current_date - 435, 4000,
    'card', 'New member', current_date - 435);
  v_membership := charter.record_membership(v_owner_profile, r_household_year, current_date - 70, 4000,
    'card', 'Annual renewal');
  v_officers := v_officers || v_owner_profile;
  for v_i in 1..5 loop
    v_profile := charter.admin_create_member(p_org, v_board[v_i],
      lower(replace(v_board[v_i], ' ', '.')) || '@riverside.example.org');
    v_term := case v_i when 1 then r_household_2y when 2 then r_individual_year when 3 then r_household_year
      when 4 then r_individual_2y else r_household_year end;
    v_price := case v_term when r_household_2y then 7500 when r_individual_2y then 4500
      when r_individual_year then 2500 else 4000 end;
    v_membership := charter.record_membership(v_profile, v_term, current_date - (20 + v_i * 13), v_price,
      v_methods[1 + (v_i % 5)], case when v_i % 2 = 0 then 'Renewal' else 'New member' end,
      current_date - (20 + v_i * 13));
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
    -- A level and length, by how common it is.
    v_pick := floor(random() * v_weight_total)::int;
    v_t := 1;
    while v_pick >= v_term_weight[v_t] loop
      v_pick := v_pick - v_term_weight[v_t]; v_t := v_t + 1;
    end loop;
    v_term := v_terms[v_t]; v_price := v_term_price[v_t]; v_days := v_term_days[v_t];
    if v_days is null then
      v_kind := 'lifetime';  -- lifetime members never lapse
      v_start := current_date - (30 + floor(random() * 900)::int);
    else
      v_start := current_date - case v_kind
        when 'recent' then 1 + floor(random() * least(88, v_days - 3))::int
        when 'current' then least(120, v_days / 2) + floor(random() * greatest(1, v_days - 10 - least(120, v_days / 2)))::int
        when 'grace' then v_days + 1 + floor(random() * 19)::int
        when 'lapsed' then v_days + 30 + floor(random() * 60)::int
        else 1 + floor(random() * (v_days / 2))::int end;
    end if;
    -- Earlier payments: monthly members have paid for several months, others often renewed.
    v_prior := case
      when v_kind in ('lifetime', 'cancelled') then 0
      when v_days <= 31 then floor(random() * 6)::int
      when random() < 0.45 then 1 else 0 end;
    v_paid := v_start - v_prior * v_days;
    v_method := v_methods[1 + floor(random() * 5)::int];
    v_membership := charter.record_membership(v_profile, v_term, v_paid, v_price, v_method,
      case when v_kind = 'lifetime' then 'Lifetime membership' else 'New member' end, v_paid);
    for v_k in 1..v_prior loop
      v_paid := v_paid + v_days;
      v_membership := charter.record_membership(v_profile, v_term, v_paid, v_price, v_method,
        case when v_days <= 31 then 'Monthly dues' else 'Renewal' end);
    end loop;
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

-- Rebuild the demo with the new levels.
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
  -- Without the hub: rebuild the demo organization (and its records in every app here).
  delete from public.organizations where id = c_org;
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
