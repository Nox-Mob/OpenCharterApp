-- OpenCharterApp's suite demo, third version. STAGING (and local development) only, recorded
-- under "opencharterapp:seed" like 0001 and 0002 (which stay as they were applied).
--
--   * Riverside Community Association (demo@demo.openapphub.org): 0002's roster, levels and board,
--     plus work waiting for the admin, so the hub's dashboard has Charter tasks: three join
--     requests, a required seat nobody holds yet (Membership Chair), and renewals coming due.
--   * Northstar Veterans League (national@demo.openapphub.org), a fictional 501(c)(19) veterans
--     national with four posts: national membership with a home post (D-166), Rank and Branch,
--     a lower price for junior enlisted, national and post officers, Post 7 already running its
--     board in OpenBoardApp and Post 12's request waiting for the national's approval.
-- Dates are relative to the day it runs; the hub's demo reset (every 12 hours) keeps them rolling.

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

-- Keep 0002's fill as the base of Riverside's.
do $rename$
begin
  if to_regprocedure('charter.demo_fill_v2(uuid,uuid)') is null then
    alter function charter.demo_fill(uuid, uuid) rename to demo_fill_v2;
  end if;
end
$rename$;

-- Act as a person (row rules, permissions and the audit trail apply), from the database owner.
-- Back to the owner: `execute 'reset role'` in the caller (this function can't do it once it's
-- running as that person).
create or replace function charter._demo_as(p_user uuid) returns void
language plpgsql set search_path = '' as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- A join request waiting for an admin (what the public join page leaves behind).
create or replace function charter._demo_join_request(p_unit uuid, p_name text, p_email text,
  p_term uuid, p_days_ago int)
returns uuid
language plpgsql set search_path = '' as $$
declare
  v_profile uuid;
  v_term charter.tier_terms;
  v_m uuid;
begin
  select * into v_term from charter.tier_terms where id = p_term;
  insert into charter.member_profiles (unit_id, display_name, email, source, created_at)
  values (p_unit, p_name, p_email, 'admin', now() - make_interval(days => p_days_ago))
  returning id into v_profile;
  insert into charter.memberships (unit_id, profile_id, tier_id, term_id, status, created_at)
  values (p_unit, v_profile, v_term.tier_id, p_term, 'pending', now() - make_interval(days => p_days_ago))
  returning id into v_m;
  return v_m;
end $$;

create or replace function charter.demo_fill(p_org uuid, p_owner uuid)
returns void
language plpgsql set search_path = '' as $$
declare
  v_term uuid;
begin
  perform charter.demo_fill_v2(p_org, p_owner);
  -- Join requests from the last week.
  select tt.id into v_term from charter.tier_terms tt join charter.membership_tiers t on t.id = tt.tier_id
    where t.unit_id = p_org and t.key = 'household' and tt.length_unit = 'year' and tt.length_count = 1 limit 1;
  if v_term is null then
    select id into v_term from charter.tier_terms where unit_id = p_org order by sort_order limit 1;
  end if;
  perform charter._demo_join_request(p_org, 'Elena Vasquez', 'elena.vasquez@example.org', v_term, 1);
  perform charter._demo_join_request(p_org, 'Tom Becker', 'tom.becker@example.org', v_term, 3);
  perform charter._demo_join_request(p_org, 'Grace Odum', 'grace.odum@example.org', v_term, 6);
  -- A required seat the board added last month and hasn't filled.
  perform charter._demo_as(p_owner);
  perform charter.define_seat(_org => p_org, _key => 'membership_chair', _title => 'Membership Chair',
    _description => 'Welcomes new members and runs the renewal drive.', _required => true,
    _scope => 'self', _term_count => 1, _term_unit => 'year', _sort_order => 60);
  execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
end $$;

-- Northstar Veterans League: the national, its four posts and about 190 members.
create or replace function charter.demo_fill_national(p_org uuid, p_owner uuid)
returns void
language plpgsql set search_path = '' as $$
declare
  v_first text[] := array['James','Maria','Robert','Linda','Michael','Patricia','David','Angela',
    'William','Denise','Richard','Tanya','Joseph','Monica','Thomas','Renee','Charles','Gloria',
    'Christopher','Yolanda','Daniel','Sharon','Anthony','Teresa','Marcus','Keisha','Luis','Rosa',
    'Kevin','Brenda','Andre','Carmen','Steven','Diane','Darnell','Lori','Raymond','Tamika','Eric','Nadia'];
  v_last text[] := array['Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez',
    'Martinez','Hernandez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin','Lee',
    'Thompson','White','Harris','Clark','Lewis','Robinson','Walker','Young','Allen','King','Wright',
    'Scott','Torres','Nguyen','Hill','Green','Adams','Baker','Nelson','Carter','Mitchell','Reyes'];
  v_posts text[] := array['Post 1 Cedar Falls', 'Post 7 Riverbend', 'Post 12 Harbor City', 'Post 23 Millbrook'];
  v_slugs text[] := array['nvl-post-1-cedar-falls', 'nvl-post-7-riverbend', 'nvl-post-12-harbor-city', 'nvl-post-23-millbrook'];
  v_sizes int[] := array[52, 61, 44, 33];
  v_ranks text[] := array['E-1','E-2','E-3','E-4','E-5','E-6','E-7','E-8','E-9','W-1','W-2','W-3','W-4','W-5',
    'O-1','O-2','O-3','O-4','O-5','O-6'];
  v_branches text[] := array['Army','Navy','Air Force','Marine Corps','Coast Guard','Space Force'];
  v_methods charter.payment_method[] := array['card','card','card','check','check','cash']::charter.payment_method[];
  v_post uuid[] := '{}';
  v_unit uuid; v_owner_profile uuid; v_admin_role uuid;
  d_rank uuid; d_branch uuid; d_charter uuid;
  t_annual uuid; t_life uuid; r_annual uuid; r_life uuid;
  s_cmdr uuid; s_vice uuid; s_adj uuid; s_fin uuid; s_chap uuid;
  p_cmdr uuid; p_adj uuid; p_fin uuid; p_chap uuid;
  v_profile uuid; v_membership uuid; v_name text; v_used text[] := '{}';
  v_rank text; v_kind text; v_start date; v_price int; v_i int; v_n int; v_k int;
  v_post_members uuid[]; v_request uuid;
begin
  perform setseed(0.4242);

  -- The national (same id as the organization), its owner's records, tax profile.
  insert into charter.units (id, name, slug, type, parent_id, created_by, is_demo)
  select p_org, o.name, 'northstar-veterans-league', 'national', null, p_owner, true
  from public.organizations o where o.id = p_org;
  insert into charter.member_profiles (unit_id, user_id, email, display_name)
  select p_org, p_owner, u.email, 'Casey Ramirez' from auth.users u where u.id = p_owner
  returning id into v_owner_profile;
  select id into v_admin_role from charter.roles where key = 'org_admin' and unit_id is null;
  insert into charter.role_assignments (user_id, role_id, unit_id) values (p_owner, v_admin_role, p_org);
  insert into charter.tax_profiles (unit_id, legal_name, ein, tax_status, address_line1, city, region, postal_code, country)
  values (p_org, 'Northstar Veterans League, Inc.', '41-2876543', '501(c)(19)', '1400 Liberty Ave',
    'Saint Paul', 'MN', '55101', 'US');

  -- Member fields at the national: Rank (ordered) and Branch; and a chapter field.
  insert into charter.attribute_definitions (unit_id, applies_to, key, label, data_type, required,
      visibility, member_editable, show_in_directory, sort_order)
  values (p_org, 'member', 'rank', 'Rank', 'ordered', true, 'members', false, true, 10) returning id into d_rank;
  for v_i in 1..array_length(v_ranks, 1) loop
    insert into charter.attribute_options (definition_id, unit_id, value, label, sort_order)
    values (d_rank, p_org, v_ranks[v_i], v_ranks[v_i], v_i * 10);
  end loop;
  insert into charter.attribute_definitions (unit_id, applies_to, key, label, data_type, required,
      visibility, member_editable, show_in_directory, sort_order)
  values (p_org, 'member', 'branch', 'Branch', 'choice', false, 'members', true, true, 20) returning id into d_branch;
  for v_i in 1..array_length(v_branches, 1) loop
    insert into charter.attribute_options (definition_id, unit_id, value, label, sort_order)
    values (d_branch, p_org, v_branches[v_i], v_branches[v_i], v_i * 10);
  end loop;
  insert into charter.attribute_definitions (unit_id, applies_to, key, label, data_type, required,
      visibility, member_editable, show_in_directory, sort_order)
  values (p_org, 'chapter', 'charter_date', 'Charter date', 'date', false, 'members', false, false, 10) returning id into d_charter;

  -- Levels: annual and life membership, both at the national.
  insert into charter.membership_tiers (unit_id, key, name, sort_order) values (p_org, 'annual', 'Annual member', 10) returning id into t_annual;
  insert into charter.membership_tiers (unit_id, key, name, sort_order) values (p_org, 'life', 'Life member', 20) returning id into t_life;
  insert into charter.tier_terms (tier_id, unit_id, key, label, length_count, length_unit, price_minor, sort_order)
  values (t_annual, p_org, '1_year', '1 year', 1, 'year', 3500, 10) returning id into r_annual;
  insert into charter.tier_terms (tier_id, unit_id, key, label, length_count, length_unit, price_minor, sort_order)
  values (t_life, p_org, 'lifetime', 'Lifetime', null, null, 35000, 10) returning id into r_life;

  perform charter._demo_as(p_owner);
  -- National membership with a home post (locked for the tree once chosen).
  insert into charter.org_settings (unit_id, key, value, mode) values (p_org, 'membership.model', '"home_chapter"', 'override');
  -- Posts may ask to use OpenBoardApp; the national approves.
  insert into charter.org_settings (unit_id, key, value, mode) values (p_org, 'board.chapters', '"approval"', 'override');
  perform charter.connect_test_gateway(p_org);
  -- Junior enlisted pay less.
  perform charter.save_pricing_rule(r_annual, null, 'Junior enlisted (E-1 to E-4)',
    jsonb_build_array(jsonb_build_object('attribute_id', d_rank, 'op', 'at_most', 'value', 'E-4')), 2000, null, 10);

  for v_i in 1..4 loop
    v_unit := charter.create_organization(v_posts[v_i], v_slugs[v_i], 'chapter', p_org);
    v_post := v_post || v_unit;
    perform charter.set_attribute_value(d_charter, v_unit,
      to_jsonb((current_date - (array[28, 19, 11, 3])[v_i] * 365 - 40 * v_i)::text));
  end loop;
  execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
  update charter.units set is_demo = true where id = any (v_post);

  -- Seats: national officers, and the officers every post must have.
  perform charter._demo_as(p_owner);
  s_cmdr := charter.define_seat(_org => p_org, _key => 'national_commander', _title => 'National Commander', _required => true, _scope => 'self', _term_count => 2, _term_unit => 'year', _sort_order => 10);
  s_vice := charter.define_seat(_org => p_org, _key => 'national_vice_commander', _title => 'National Vice Commander', _required => true, _scope => 'self', _term_count => 2, _term_unit => 'year', _sort_order => 20);
  s_adj := charter.define_seat(_org => p_org, _key => 'national_adjutant', _title => 'National Adjutant', _required => true, _scope => 'self', _term_count => 2, _term_unit => 'year', _sort_order => 30);
  s_fin := charter.define_seat(_org => p_org, _key => 'national_finance_officer', _title => 'National Finance Officer', _required => true, _scope => 'self', _term_count => 2, _term_unit => 'year', _sort_order => 40);
  s_chap := charter.define_seat(_org => p_org, _key => 'national_chaplain', _title => 'National Chaplain', _scope => 'self', _term_count => 2, _term_unit => 'year', _sort_order => 50);
  p_cmdr := charter.define_seat(_org => p_org, _key => 'post_commander', _title => 'Post Commander', _required => true, _scope => 'chapters', _term_count => 1, _term_unit => 'year', _sort_order => 110);
  p_adj := charter.define_seat(_org => p_org, _key => 'post_adjutant', _title => 'Post Adjutant', _required => true, _scope => 'chapters', _term_count => 1, _term_unit => 'year', _sort_order => 120);
  p_fin := charter.define_seat(_org => p_org, _key => 'post_finance_officer', _title => 'Post Finance Officer', _required => true, _scope => 'chapters', _term_count => 1, _term_unit => 'year', _sort_order => 130);
  p_chap := charter.define_seat(_org => p_org, _key => 'post_chaplain', _title => 'Post Chaplain', _scope => 'chapters', _term_count => 1, _term_unit => 'year', _sort_order => 140);

  -- The owner: a life member of Post 7, National Commander.
  perform charter.set_attribute_value(d_rank, v_owner_profile, '"E-8"');
  perform charter.set_attribute_value(d_branch, v_owner_profile, '"Army"');
  v_membership := charter.record_membership(v_owner_profile, r_life, current_date - 2400, 35000, 'check', 'Life membership', current_date - 2400);
  perform charter.set_member_home_chapter(v_membership, v_post[2]);
  perform charter.appoint_officer(p_org, s_cmdr, v_owner_profile, current_date - 300);

  -- Members of each post: most current (annual, some life), some in grace, a few lapsed.
  for v_i in 1..4 loop
    v_post_members := '{}';
    for v_n in 1..v_sizes[v_i] loop
      loop
        v_name := v_first[1 + floor(random() * array_length(v_first, 1))::int] || ' ' ||
                  v_last[1 + floor(random() * array_length(v_last, 1))::int];
        exit when not v_name = any (v_used);
      end loop;
      v_used := v_used || v_name;
      v_profile := charter.admin_create_member(p_org, v_name,
        lower(replace(v_name, ' ', '.')) || v_i || v_n || '@example.org');
      v_k := floor(random() * 100)::int;
      v_rank := v_ranks[case when v_k < 30 then 1 + floor(random() * 4)::int        -- junior enlisted
                             when v_k < 75 then 5 + floor(random() * 5)::int        -- NCOs
                             when v_k < 82 then 10 + floor(random() * 5)::int       -- warrant officers
                             else 15 + floor(random() * 6)::int end];               -- officers
      perform charter.set_attribute_value(d_rank, v_profile, to_jsonb(v_rank));
      perform charter.set_attribute_value(d_branch, v_profile,
        to_jsonb(v_branches[1 + floor(random() * case when random() < 0.95 then 5 else 6 end)::int]));
      v_kind := case when v_n % 9 = 0 then 'life' when v_n % 13 = 0 then 'grace' when v_n % 17 = 0 then 'lapsed'
                     when v_n % 3 = 0 then 'recent' else 'current' end;
      if v_kind = 'life' then
        v_start := current_date - (400 + floor(random() * 3000)::int);
        v_membership := charter.record_membership(v_profile, r_life, v_start, 35000,
          v_methods[1 + floor(random() * 6)::int], 'Life membership', v_start);
      else
        v_start := current_date - case v_kind
          when 'recent' then 1 + floor(random() * 75)::int
          when 'current' then 80 + floor(random() * 270)::int
          when 'grace' then 366 + floor(random() * 25)::int
          else 400 + floor(random() * 90)::int end;
        v_price := case when v_rank in ('E-1','E-2','E-3','E-4') then 2000 else 3500 end;
        v_membership := charter.record_membership(v_profile, r_annual, v_start, v_price,
          v_methods[1 + floor(random() * 6)::int],
          case when v_kind = 'recent' and random() < 0.35 then 'New member' else 'Annual renewal' end, v_start);
      end if;
      perform charter.set_member_home_chapter(v_membership, v_post[v_i]);
      v_post_members := v_post_members ||
        (select p.id from charter.member_profiles p where p.unit_id = v_post[v_i] and p.home_of = v_membership);
      -- National officers come from the posts.
      if v_i = 1 and v_n = 1 then perform charter.appoint_officer(p_org, s_vice, v_profile, current_date - 300); end if;
      if v_i = 3 and v_n = 1 then perform charter.appoint_officer(p_org, s_adj, v_profile, current_date - 300); end if;
      if v_i = 4 and v_n = 1 then perform charter.appoint_officer(p_org, s_fin, v_profile, current_date - 300); end if;
      if v_i = 2 and v_n = 2 then perform charter.appoint_officer(p_org, s_chap, v_profile, current_date - 300); end if;
    end loop;
    -- Post officers (Post 23 hasn't found a Finance Officer yet).
    perform charter.appoint_officer(v_post[v_i], p_cmdr, v_post_members[3], current_date - (60 + v_i * 20));
    perform charter.appoint_officer(v_post[v_i], p_adj, v_post_members[4], current_date - (60 + v_i * 20));
    if v_i <> 4 then
      perform charter.appoint_officer(v_post[v_i], p_fin, v_post_members[5], current_date - (60 + v_i * 20));
    end if;
    if v_i in (1, 2) then
      perform charter.appoint_officer(v_post[v_i], p_chap, v_post_members[6], current_date - (60 + v_i * 20));
    end if;
  end loop;

  -- Post 7 runs its board in OpenBoardApp; Post 12 has asked and waits for the national.
  v_request := charter.request_chapter_board(v_post[2]);
  perform charter.decide_chapter_board(v_request, true, null);
  perform charter.request_chapter_board(v_post[3]);
  execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
  update charter.chapter_board_requests set requested_at = now() - interval '45 days', decided_at = now() - interval '44 days'
    where unit_id = v_post[2];
  update charter.chapter_board_requests set requested_at = now() - interval '2 days' where unit_id = v_post[3];

  -- Two applications waiting for approval.
  perform charter._demo_join_request(p_org, 'Jalen Brooks', 'jalen.brooks@example.org', r_annual, 2);
  perform charter._demo_join_request(p_org, 'Sofia Delgado', 'sofia.delgado@example.org', r_annual, 4);
end $$;

revoke all on function charter._demo_as(uuid), charter._demo_join_request(uuid, text, text, uuid, int),
  charter.demo_fill(uuid, uuid), charter.demo_fill_v2(uuid, uuid), charter.demo_fill_national(uuid, uuid)
from public, anon, authenticated;

do $fill$
begin
  if to_regprocedure('hub.reset_suite_demo()') is not null then
    perform hub.reset_suite_demo();
  end if;
end
$fill$;
