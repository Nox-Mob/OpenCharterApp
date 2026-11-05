-- 0040 (D-200): in the home-chapter model the overview counts each person once for renewals due
-- and applications waiting, though they have a record at the national and one in their chapter.
begin;
select tests.fixture();
insert into public.org_settings (org_id, key, value, mode)
  values ('22222222-0000-4000-8000-000000000001', 'membership.model', '"home_chapter"', 'locked');
insert into public.membership_tiers (id, org_id, key, name) values
  ('55555555-0000-4000-8000-0000000000d1', '22222222-0000-4000-8000-000000000001', 'reg', 'Regular');
insert into public.tier_terms (id, tier_id, org_id, key, label, length_count, length_unit, price_minor) values
  ('66666666-0000-4000-8000-0000000000d1', '55555555-0000-4000-8000-0000000000d1', '22222222-0000-4000-8000-000000000001', '1_year', '1 year', 1, 'year', 2500);
select tests.as_user('11111111-0000-4000-8000-000000000001');
-- two members due within 30 days, both in Chapter A (so each has two records)
select public.import_members('22222222-0000-4000-8000-000000000001', '[
  {"row": 2, "name": "Due One", "email": "d1@x.org", "level": "Regular", "joined_on": "2024-01-01", "paid_through": "2099-01-01", "chapter": "Chapter A"},
  {"row": 3, "name": "Due Two", "email": "d2@x.org", "level": "Regular", "joined_on": "2024-01-01", "paid_through": "2099-01-01", "chapter": "Chapter A"}
]'::jsonb, true);
select tests.reset_role();
update public.memberships set paid_through = current_date + 10 where profile_id in
  (select id from public.org_member_profiles where email in ('d1@x.org', 'd2@x.org') and home_of is null);
select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.eq((select expiring_30 from public.org_overview_stats('22222222-0000-4000-8000-000000000001')), 2, 'two people due, not four records');
select tests.eq((select chapter_memberships from public.org_overview_stats('22222222-0000-4000-8000-000000000001')), 2, 'chapter records still counted as chapter memberships');
select tests.reset_role();
rollback;
