-- 0037 in the home-chapter model: the national imports members with their chapter; removing the
-- national record also takes them off the chapter; chapter records can't be removed or imported.
begin;
select tests.fixture();
insert into public.org_settings (org_id, key, value, mode)
  values ('22222222-0000-4000-8000-000000000001', 'membership.model', '"home_chapter"', 'locked');
insert into public.membership_tiers (id, org_id, key, name) values
  ('55555555-0000-4000-8000-0000000000e1', '22222222-0000-4000-8000-000000000001', 'reg', 'Regular');
insert into public.tier_terms (id, tier_id, org_id, key, label, length_count, length_unit, price_minor) values
  ('66666666-0000-4000-8000-0000000000e1', '55555555-0000-4000-8000-0000000000e1', '22222222-0000-4000-8000-000000000001', '1_year', '1 year', 1, 'year', 2500);

select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$select public.import_members('22222222-0000-4000-8000-000000000002', '[]', false)$$, 'import them there');
select tests.reset_role();

select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.eq((public.import_members('22222222-0000-4000-8000-000000000001', '[
  {"row": 2, "name": "Hal", "email": "hal@x.org", "level": "Regular", "joined_on": "2024-01-01", "paid_through": "2027-01-01", "chapter": "Chapter B"},
  {"row": 3, "name": "Ivy", "email": "ivy@x.org", "chapter": "ch-b"}
]'::jsonb, true)->'errors'->0->>'message'), 'a chapter needs a membership level', 'chapter without a membership');
select tests.eq((public.import_members('22222222-0000-4000-8000-000000000001', '[
  {"row": 2, "name": "Hal", "email": "hal@x.org", "level": "Regular", "joined_on": "2024-01-01", "paid_through": "2027-01-01", "chapter": "Chapter B"}
]'::jsonb, true)->>'applied'), 'true', 'imported with a chapter');
select tests.reset_role();
select tests.eq((select count(*) from public.org_member_profiles where org_id = '22222222-0000-4000-8000-000000000003'
  and email = 'hal@x.org' and home_of is not null and left_at is null), 1::bigint, 'listed at Chapter B');

-- the chapter record can't be removed; removing the national record takes them off both
select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.throws($$select public.remove_member_record((select id from public.org_member_profiles
  where org_id = '22222222-0000-4000-8000-000000000003' and email = 'hal@x.org'), '')$$, 'choose their own chapter');
select public.remove_member_record((select id from public.org_member_profiles
  where org_id = '22222222-0000-4000-8000-000000000001' and email = 'hal@x.org'), 'Left the association');
select tests.reset_role();
select tests.eq((select count(*) from public.org_member_profiles where email = 'hal@x.org' and left_at is null), 0::bigint, 'off both rosters');
select tests.eq((select home_org_id from public.memberships m join public.org_member_profiles p on p.id = m.profile_id
  where p.email = 'hal@x.org'), null::uuid, 'no home chapter');
select tests.eq((select count(*) from public.affiliation_history where from_org_id = '22222222-0000-4000-8000-000000000003' and to_org_id is null), 1::bigint, 'chapter change logged');
rollback;
