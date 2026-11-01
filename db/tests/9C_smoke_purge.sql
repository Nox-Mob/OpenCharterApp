-- Smoke-test cleanup only works for demo-national admins and never touches other orgs (D-150)
begin;
select tests.fixture();
insert into public.membership_tiers (org_id, key, name) values
  ('22222222-0000-4000-8000-000000000001', 'keep', 'Keep');

select tests.as_user('11111111-0000-4000-8000-000000000001');  -- national admin of a non-demo org
select tests.throws($$select public.purge_smoke_data(now() - interval '1 day')$$, 'only a demo national admin');
select tests.as_user('11111111-0000-4000-8000-000000000004');  -- outsider
select tests.throws($$select public.purge_smoke_data(now() - interval '1 day')$$, 'only a demo national admin');
select tests.reset_role();

select tests.eq((select count(*) from public.membership_tiers where key = 'keep'), 1::bigint,
  'non-demo data is untouched');
select tests.throws($$set role anon; select public.purge_smoke_data(now())$$, 'permission denied');
rollback;
