-- Test-Demo seed (D-199, D-213): fills the sales demo national "Test-Demo" (home-chapter model) with
-- about 500 people so it looks like a real association. Plain SQL for the Supabase SQL Editor or
-- psql; the same idea as scripts/seed-sales-demo.ts, which needs bun on your own machine.
--
-- What it adds: 15 chapters with charter dates; member fields Rank, Branch and Veteran; levels
-- Regular (1 year $45, 3 years $120), Life Member ($600) and Associate (1 year $25); test payments;
-- and 500 people, each with years of payments and receipts:
--   40 lifetime, 255 current (some renewing within 30 days), 30 on 3-year terms, 35 new in the last
--   30 days, 25 in their grace period, 55 lapsed, 15 cancelled, 15 associates, 15 prospects with no
--   membership, and 15 pending applications waiting for approval.
-- Then four required board seats (President, Vice President, Secretary, Treasurer) for the
-- national and every chapter, filled by members in good standing.
--
-- How it works: everything goes through the app's own database functions, signed in as
-- Nora National (Test-Demo's admin), so permissions, standing, receipts and the audit log apply
-- as usual. The pending applicants are made-up accounts (@example.org, no password, so nobody can
-- sign in as them) that apply online and pay on the test gateway while approval is switched on
-- for the run; the setting is put back afterwards.
--
-- Run it once, as the database owner, after supabase/scripts/demo-test-accounts.sql. It refuses to
-- run if Test-Demo is missing, isn't a demo, doesn't use the home-chapter model, isn't run by Nora
-- National as admin, or already has members. One transaction: on any error nothing is changed.
-- Deterministic: the same people every time (dates are relative to the day it runs).
begin;
set local statement_timeout = 0;

-- Act as a signed-in user (RLS and auth.uid() apply), and back as the database owner.
create function pg_temp.act_as(_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', _uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
-- A value from a list, by weight.
create function pg_temp.weighted(_values text[], _weights int[]) returns text language plpgsql as $$
declare _r float8 := random() * (select sum(w) from unnest(_weights) w); _i int;
begin
  for _i in 1..array_length(_values, 1) loop
    _r := _r - _weights[_i];
    if _r <= 0 then return _values[_i]; end if;
  end loop;
  return _values[array_length(_values, 1)];
end $$;
create function pg_temp.rint(_lo int, _hi int) returns int language sql as $$
  select _lo + floor(random() * (_hi - _lo + 1))::int
$$;
grant execute on function pg_temp.act_as(uuid), pg_temp.as_owner(), pg_temp.weighted(text[], int[]),
  pg_temp.rint(int, int) to authenticated;

do $seed$
declare
  _org constant uuid := 'd60400ef-9dbb-414a-9a3e-e0cbf2fc15ab';   -- Test-Demo
  _nora constant uuid := 'd0000000-0000-4000-8000-000000000001';  -- Nora National
  _first constant text[] := array[
    'James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda', 'David',
    'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas',
    'Sarah', 'Charles', 'Karen', 'Christopher', 'Lisa', 'Daniel', 'Nancy', 'Matthew', 'Betty',
    'Anthony', 'Sandra', 'Mark', 'Margaret', 'Donald', 'Ashley', 'Steven', 'Kimberly', 'Andrew',
    'Emily', 'Paul', 'Donna', 'Joshua', 'Michelle', 'Kenneth', 'Carol', 'Kevin', 'Amanda',
    'Brian', 'Melissa', 'George', 'Deborah', 'Timothy', 'Stephanie', 'Ronald', 'Rebecca',
    'Jason', 'Sharon', 'Edward', 'Laura', 'Jeffrey', 'Cynthia', 'Ryan', 'Dorothy', 'Jacob',
    'Amy', 'Gary', 'Kathleen', 'Nicholas', 'Angela', 'Eric', 'Shirley', 'Jonathan', 'Emma',
    'Stephen', 'Brenda', 'Larry', 'Pamela', 'Justin', 'Nicole', 'Scott', 'Anna', 'Brandon',
    'Samantha', 'Benjamin', 'Katherine', 'Samuel', 'Christine', 'Gregory', 'Debra', 'Alexander',
    'Rachel', 'Patrick', 'Carolyn', 'Frank', 'Janet', 'Raymond', 'Maria', 'Jack', 'Olivia',
    'Dennis', 'Heather', 'Jerry', 'Helen', 'Tyler', 'Catherine', 'Aaron', 'Diane', 'Jose',
    'Julie', 'Adam', 'Victoria', 'Nathan', 'Joyce', 'Henry', 'Lauren', 'Zachary', 'Kelly',
    'Douglas', 'Christina', 'Peter', 'Ruth', 'Kyle', 'Joan', 'Noah', 'Virginia', 'Ethan',
    'Judith', 'Jeremy', 'Evelyn', 'Walter', 'Hannah', 'Christian', 'Andrea', 'Keith', 'Megan',
    'Roger', 'Cheryl', 'Terry', 'Jacqueline', 'Austin', 'Madison', 'Sean', 'Teresa', 'Gerald',
    'Abigail', 'Carl', 'Sophia', 'Harold', 'Martha', 'Dylan', 'Sara', 'Arthur', 'Gloria',
    'Lawrence', 'Janice', 'Jordan', 'Kathryn', 'Jesse', 'Ann', 'Bryan', 'Isabella', 'Billy',
    'Judy', 'Bruce', 'Charlotte', 'Gabriel', 'Julia', 'Joe', 'Grace', 'Logan', 'Amber', 'Alan',
    'Alice', 'Juan', 'Jean', 'Albert', 'Denise', 'Willie', 'Frances', 'Elijah', 'Danielle',
    'Wayne', 'Marilyn', 'Randy', 'Natalie', 'Vincent', 'Beverly', 'Mason', 'Diana', 'Roy',
    'Brittany', 'Ralph', 'Theresa', 'Bobby', 'Kayla', 'Russell', 'Alexis', 'Bradley', 'Doris',
    'Philip', 'Lori', 'Eugene', 'Tiffany'];
  _last constant text[] := array[
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez',
    'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor',
    'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez',
    'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright',
    'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green', 'Adams', 'Nelson', 'Baker', 'Hall',
    'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts', 'Gomez', 'Phillips', 'Evans',
    'Turner', 'Diaz', 'Parker', 'Cruz', 'Edwards', 'Collins', 'Reyes', 'Stewart', 'Morris',
    'Morales', 'Murphy', 'Cook', 'Rogers', 'Gutierrez', 'Ortiz', 'Morgan', 'Cooper', 'Peterson',
    'Bailey', 'Reed', 'Kelly', 'Howard', 'Ramos', 'Kim', 'Cox', 'Ward', 'Richardson', 'Watson',
    'Brooks', 'Chavez', 'Wood', 'James', 'Bennett', 'Gray', 'Mendoza', 'Ruiz', 'Hughes', 'Price',
    'Alvarez', 'Castillo', 'Sanders', 'Patel', 'Myers', 'Long', 'Ross', 'Foster', 'Jimenez'];

  _chapter_names constant text[] := array['Albuquerque', 'Santa Fe', 'Las Cruces', 'Roswell',
    'El Paso', 'Tucson', 'Phoenix', 'Fort Huachuca', 'Fort Bliss', 'White Sands', 'Denver',
    'Colorado Springs', 'Fort Carson', 'Pueblo', 'Los Alamos'];
  _ranks constant text[] := array['e-3', 'e-4', 'e-5', 'e-6', 'e-7', 'e-8', 'e-9', 'w-2', 'w-3',
    'o-1', 'o-2', 'o-3', 'o-4', 'o-5', 'o-6'];
  _rank_w constant int[] := array[7, 7, 12, 12, 7, 7, 7, 3, 3, 4, 4, 4, 4, 4, 4];
  _branches constant text[] := array['army', 'navy', 'air_force', 'marines', 'coast_guard',
    'space_force', 'civilian'];
  _branch_labels constant text[] := array['Army', 'Navy', 'Air Force', 'Marine Corps', 'Coast Guard',
    'Space Force', 'Civilian'];
  _branch_w constant int[] := array[55, 10, 15, 8, 4, 3, 5];
  _methods constant text[] := array['check', 'card', 'cash', 'bank_transfer'];
  _method_w constant int[] := array[45, 30, 15, 10];
  -- kinds and how many of each (500 in all)
  _kinds constant text[] := array['life', 'long', 'three', 'new', 'grace', 'lapsed', 'cancelled',
    'associate', 'prospect', 'pending'];
  _counts constant int[] := array[40, 255, 30, 35, 25, 55, 15, 15, 15, 15];
  _today constant date := current_date;
  _slug text; _n int; _k int; _i int; _j int; _y int; _years int;
  _def_rank uuid; _def_branch uuid; _def_vet uuid; _def_charter uuid; _def uuid;
  _t_regular uuid; _t_life uuid; _t_assoc uuid;
  _reg_1y uuid; _reg_3y uuid; _life uuid; _assoc_1y uuid;
  _chapters uuid[] := '{}'; _chapter uuid; _c uuid;
  _used text[] := '{}'; _name text; _email text; _kind text;
  _profile uuid; _membership uuid; _start date; _end date; _term uuid; _price int;
  _uid uuid; _pay uuid; _approval jsonb; _had_approval boolean;
  _seat uuid; _seats uuid[] := '{}'; _seat_titles constant text[] := array['President',
    'Vice President', 'Secretary', 'Treasurer'];
  _payments int := 0; _people int := 0; _pending int := 0; _officers int := 0;
begin
  perform setseed(0.20261103);

  -- ----- checks (as the database owner) -----
  select slug into _slug from public.organizations where id = _org;
  if _slug is null then
    raise exception 'Test-Demo doesn''t exist: run supabase/scripts/demo-test-accounts.sql first';
  end if;
  if not (select is_demo from public.organizations where id = _org) then
    raise exception 'Test-Demo isn''t a demo organization; nothing was changed';
  end if;
  if public.membership_model(_org) <> 'home_chapter' then
    raise exception 'Test-Demo doesn''t use the home-chapter model; nothing was changed';
  end if;
  if not public.has_permission(_nora, 'members.manage', _org) then
    raise exception 'Nora National isn''t an admin of Test-Demo; nothing was changed';
  end if;
  if (select count(*) from public.org_member_profiles where org_id = _org and left_at is null) > 5
     or exists (select 1 from public.organizations where parent_id = _org) then
    raise exception 'Test-Demo already has members or chapters; not seeding twice';
  end if;

  -- ----- organization details, test payments, fields and levels (as Nora) -----
  perform pg_temp.act_as(_nora);
  insert into public.tax_profiles (org_id, legal_name, ein, tax_status, address_line1, city, region,
      postal_code, country)
    values (_org, 'Test-Demo Association, Inc.', '12-3456789', '501(c)(19)', '1 Signal Way',
      'Albuquerque', 'NM', '87101', 'US')
    on conflict (org_id) do nothing;
  if not exists (select 1 from public.gateway_connections where org_id = _org and status = 'verified') then
    perform public.connect_test_gateway(_org);
  end if;

  insert into public.attribute_definitions (org_id, applies_to, key, label, data_type, required,
      visibility, member_editable, show_in_directory, sort_order)
    values (_org, 'member', 'rank', 'Rank', 'ordered', true, 'members', true, true, 10)
    returning id into _def_rank;
  for _i in 1..array_length(_ranks, 1) loop
    insert into public.attribute_options (definition_id, org_id, value, label, sort_order)
      values (_def_rank, _org, _ranks[_i], upper(_ranks[_i]), _i * 10);
  end loop;
  insert into public.attribute_definitions (org_id, applies_to, key, label, data_type, required,
      visibility, member_editable, show_in_directory, sort_order)
    values (_org, 'member', 'branch', 'Branch', 'choice', false, 'members', true, true, 20)
    returning id into _def_branch;
  for _i in 1..array_length(_branches, 1) loop
    insert into public.attribute_options (definition_id, org_id, value, label, sort_order)
      values (_def_branch, _org, _branches[_i], _branch_labels[_i], _i * 10);
  end loop;
  insert into public.attribute_definitions (org_id, applies_to, key, label, data_type, required,
      visibility, member_editable, show_in_directory, sort_order)
    values (_org, 'member', 'veteran', 'Veteran', 'boolean', false, 'members', true, false, 30)
    returning id into _def_vet;
  insert into public.attribute_definitions (org_id, applies_to, key, label, data_type, required,
      visibility, member_editable, show_in_directory, sort_order)
    values (_org, 'chapter', 'charter_date', 'Charter date', 'date', false, 'members', false, false, 10)
    returning id into _def_charter;

  insert into public.membership_tiers (org_id, key, name, sort_order)
    values (_org, 'regular', 'Regular', 10) returning id into _t_regular;
  insert into public.tier_terms (tier_id, org_id, key, label, length_count, length_unit, price_minor, sort_order)
    values (_t_regular, _org, '1_year', '1 year', 1, 'year', 4500, 10) returning id into _reg_1y;
  insert into public.tier_terms (tier_id, org_id, key, label, length_count, length_unit, price_minor, sort_order)
    values (_t_regular, _org, '3_years', '3 years', 3, 'year', 12000, 20) returning id into _reg_3y;
  insert into public.membership_tiers (org_id, key, name, sort_order)
    values (_org, 'life', 'Life Member', 20) returning id into _t_life;
  insert into public.tier_terms (tier_id, org_id, key, label, length_count, length_unit, price_minor, sort_order)
    values (_t_life, _org, 'lifetime', 'Lifetime', null, null, 60000, 10) returning id into _life;
  insert into public.membership_tiers (org_id, key, name, sort_order)
    values (_org, 'associate', 'Associate', 30) returning id into _t_assoc;
  insert into public.tier_terms (tier_id, org_id, key, label, length_count, length_unit, price_minor, sort_order)
    values (_t_assoc, _org, '1_year', '1 year', 1, 'year', 2500, 10) returning id into _assoc_1y;

  -- ----- chapters -----
  for _i in 1..array_length(_chapter_names, 1) loop
    _c := public.create_organization(_chapter_names[_i] || ' Chapter',
      _slug || '-' || regexp_replace(lower(_chapter_names[_i]), '[^a-z0-9]+', '-', 'g'), 'chapter', _org);
    perform public.set_attribute_value(_def_charter, _c,
      to_jsonb(make_date(1972 + _i * 3, pg_temp.rint(1, 12), pg_temp.rint(1, 28))::text));
    _chapters := _chapters || _c;
  end loop;

  -- ----- people -----
  for _k in 1..array_length(_kinds, 1) loop
    _kind := _kinds[_k];
    for _n in 1.._counts[_k] loop
      loop
        _name := _first[pg_temp.rint(1, array_length(_first, 1))] || ' ' || _last[pg_temp.rint(1, array_length(_last, 1))];
        exit when not (_name = any(_used));
      end loop;
      _used := _used || _name;
      _email := lower(regexp_replace(_name, '[^A-Za-z]+', '.', 'g')) || '@example.org';
      -- most belong to a chapter, the bigger chapters first; a few to none
      _chapter := case when random() < 0.05 then null
        else _chapters[least(array_length(_chapters, 1), 1 + floor(power(random(), 1.4) * array_length(_chapters, 1))::int)] end;
      _people := _people + 1;

      if _kind = 'pending' then
        -- a made-up account that applies online (no password: nobody can sign in as it)
        _uid := md5('test-demo-applicant-' || _n)::uuid;
        perform pg_temp.as_owner();
        insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token,
            recovery_token, email_change_token_new, email_change, email_change_token_current,
            phone_change, phone_change_token, reauthentication_token)
          values ('00000000-0000-0000-0000-000000000000', _uid, 'authenticated', 'authenticated',
            _email, '', now(), '{"provider":"email","providers":["email"]}',
            jsonb_build_object('full_name', _name), now(), now(), '', '', '', '', '', '', '', '')
          on conflict (id) do nothing;
        if _n = 1 then
          -- approval on for these applications only; put back afterwards
          select value into _approval from public.org_settings
            where org_id = _org and key = 'membership.approval_required';
          _had_approval := found;
          insert into public.org_settings (org_id, key, value, mode)
            values (_org, 'membership.approval_required', 'true', 'override')
            on conflict (org_id, key) do update set value = 'true';
        end if;
        perform pg_temp.act_as(_uid);
        _pay := public.begin_join(_org, _reg_1y,
          jsonb_build_object(_def_rank::text, pg_temp.weighted(_ranks, _rank_w)));
        perform public.complete_test_payment(_pay, 'accepted');
        -- as the app's Account page and join flow do: their own name, and their chapter
        update public.org_member_profiles set display_name = _name where user_id = _uid;
        if _chapter is not null then perform public.set_home_chapter(_org, _chapter); end if;
        _payments := _payments + 1;
        _pending := _pending + 1;
        perform pg_temp.act_as(_nora);
        continue;
      end if;

      _profile := public.admin_create_member(_org, _name, _email);
      perform public.set_attribute_value(_def_rank, _profile, to_jsonb(pg_temp.weighted(_ranks, _rank_w)));
      perform public.set_attribute_value(_def_branch, _profile, to_jsonb(pg_temp.weighted(_branches, _branch_w)));
      if random() < 0.8 then
        perform public.set_attribute_value(_def_vet, _profile, to_jsonb(random() < 0.85));
      end if;
      continue when _kind = 'prospect';

      -- the periods paid, oldest first
      _membership := null;
      if _kind = 'life' then
        _years := 1;
      elsif _kind = 'new' then
        _years := 1;
      elsif _kind = 'three' then
        _end := _today + pg_temp.rint(20, 1000);
        _years := pg_temp.rint(1, 3);
      elsif _kind = 'associate' then
        _end := _today + pg_temp.rint(10, 360);
        _years := pg_temp.rint(1, 4);
      else
        _end := case _kind when 'grace' then _today - pg_temp.rint(1, 25)
                           when 'lapsed' then _today - pg_temp.rint(40, 1100)
                           else _today + pg_temp.rint(1, 364) end;
        _years := case when _kind = 'long'
          then pg_temp.weighted(array['1','2','3','4','5','6','7','8','9','10'],
                                array[10, 12, 14, 14, 12, 10, 8, 8, 6, 6])::int
          else pg_temp.rint(1, 5) end;
      end if;
      for _y in reverse (_years - 1)..0 loop
        if _kind = 'life' then
          _start := make_date(pg_temp.rint(2004, 2022), pg_temp.rint(1, 12), pg_temp.rint(1, 28));
          _term := _life; _price := 60000;
        elsif _kind = 'new' then
          _start := _today - pg_temp.rint(0, 29); _term := _reg_1y; _price := 4500;
        elsif _kind = 'three' then
          _start := ((_end - make_interval(years => 3 * _y)) - interval '3 years')::date + 1;
          _term := _reg_3y; _price := 12000;
        elsif _kind = 'associate' then
          _start := ((_end - make_interval(years => _y)) - interval '1 year')::date + 1;
          _term := _assoc_1y; _price := 2500;
        else
          _start := ((_end - make_interval(years => _y)) - interval '1 year')::date + 1;
          _term := _reg_1y; _price := 4500;
        end if;
        _membership := public.record_membership(_profile, _term, _start, _price,
          pg_temp.weighted(_methods, _method_w)::public.payment_method,
          case when _y = _years - 1 then '' else 'Annual renewal' end, _start);
        _payments := _payments + 1;
        if _y = _years - 1 and _chapter is not null then
          perform public.set_member_home_chapter(_membership, _chapter);
        end if;
      end loop;
      if _kind = 'cancelled' then
        perform public.cancel_membership(_membership, 'Asked to cancel');
      end if;
    end loop;
  end loop;

  -- put the approval setting back as it was
  perform pg_temp.as_owner();
  if _had_approval then
    update public.org_settings set value = _approval where org_id = _org and key = 'membership.approval_required';
  else
    update public.org_settings set value = 'false' where org_id = _org and key = 'membership.approval_required';
  end if;
  perform pg_temp.act_as(_nora);

  -- ----- the board: four required seats for the national and every chapter, all filled -----
  for _i in 1..4 loop
    _seat := public.define_seat(_org => _org, _key => replace(lower(_seat_titles[_i]), ' ', '_'),
      _title => _seat_titles[_i], _required => true, _scope => 'self_and_chapters', _seat_count => 1,
      _term_count => 2, _term_unit => 'year', _sort_order => _i * 10);
    _seats := _seats || _seat;
  end loop;
  foreach _c in array (array[_org] || _chapters) loop
    _i := 0;
    -- current members in good standing for at least 60 more days; a chapter's records stand
    -- for the national membership (home_of)
    for _profile in
      select p.id from public.org_member_profiles p
        join public.memberships m on m.id = case when _c = _org then
          (select x.id from public.memberships x where x.profile_id = p.id and x.org_id = _org) else p.home_of end
      where p.org_id = _c and p.left_at is null and p.display_name <> '' and m.status = 'active'
        and (m.lifetime or m.paid_through >= _today + 60)
      order by random() limit 4
    loop
      _i := _i + 1;
      perform public.appoint_officer(_c, _seats[_i], _profile, _today - pg_temp.rint(30, 600));
      _officers := _officers + 1;
    end loop;
  end loop;

  perform pg_temp.as_owner();
  raise notice 'Test-Demo seeded: % chapters, % people (% pending applications), % payments, % officers',
    array_length(_chapters, 1), _people, _pending, _payments, _officers;
end
$seed$;

commit;

-- ----- check what was made: names, chapters, levels and standing, all connected -----
-- (the SQL Editor shows the last result; psql shows all three)

-- 1. people by standing, and how many have a chapter
select coalesce(m.standing, 'no membership') as standing, count(*) as people,
       count(m.chapter) as with_a_chapter
from public.org_member_profiles p
left join lateral (
  select public.membership_standing(x.status, x.paid_through, x.lifetime, public.grace_days(x.org_id),
           current_date) as standing, x.home_org_id as chapter
  from public.memberships x where x.profile_id = p.id and x.org_id = p.org_id) m on true
where p.org_id = 'd60400ef-9dbb-414a-9a3e-e0cbf2fc15ab' and p.left_at is null
group by 1 order by 2 desc;

-- 2. each chapter: its members (through their national membership) and its officers
select c.name as chapter, count(distinct m.id) as members,
       count(distinct m.id) filter (where public.membership_standing(m.status, m.paid_through,
         m.lifetime, public.grace_days(m.org_id), current_date) = 'good') as in_good_standing,
       count(distinct a.id) filter (where a.ended_on is null) as officers
from public.organizations c
left join public.memberships m on m.home_org_id = c.id
left join public.appointments a on a.org_id = c.id
where c.parent_id = 'd60400ef-9dbb-414a-9a3e-e0cbf2fc15ab'
group by c.name order by members desc;

-- 3. everyone: name, email, chapter, level and term, standing, paid through, rank
select p.display_name as name, p.email, coalesce(c.name, '(no chapter)') as chapter,
       t.name as level, tt.label as term, m.status,
       case when m.id is null then 'no membership' else public.membership_standing(m.status,
         m.paid_through, m.lifetime, public.grace_days(m.org_id), current_date) end as standing,
       case when m.lifetime then 'lifetime' else m.paid_through::text end as paid_through,
       upper(v.value #>> '{}') as rank
from public.org_member_profiles p
left join public.memberships m on m.profile_id = p.id and m.org_id = p.org_id
left join public.organizations c on c.id = m.home_org_id
left join public.membership_tiers t on t.id = m.tier_id
left join public.tier_terms tt on tt.id = m.term_id
left join public.attribute_definitions d on d.org_id = p.org_id and d.key = 'rank' and d.applies_to = 'member'
left join public.attribute_values v on v.definition_id = d.id and v.entity_id = p.id
where p.org_id = 'd60400ef-9dbb-414a-9a3e-e0cbf2fc15ab' and p.left_at is null
order by chapter, name;
