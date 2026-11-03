-- Performance check setup (R6, D-209): the fixture's national and one membership level. The
-- roster is then grown in steps by large-roster.sql (see scripts/db-perf.sh).
\set ON_ERROR_STOP on
select tests.fixture();

insert into public.membership_tiers (id, org_id, key, name) values
  ('55555555-0000-4000-8000-0000000000f1', '22222222-0000-4000-8000-000000000001', 'reg', 'Regular');
insert into public.tier_terms (id, tier_id, org_id, key, label, length_count, length_unit, price_minor) values
  ('66666666-0000-4000-8000-0000000000f1', '55555555-0000-4000-8000-0000000000f1',
   '22222222-0000-4000-8000-000000000001', '1_year', '1 year', 1, 'year', 2500);
