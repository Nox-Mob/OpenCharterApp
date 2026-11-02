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

-- The purge removes what a run created in the demo orgs since _since, keeps older demo data and
-- other orgs, cascades through history and receipts, and records one summary audit event.
begin;
select tests.fixture();
insert into auth.users (id, email) values ('d0000000-0000-4000-8000-000000000001', 'demo-national@opencharter.test');
insert into public.organizations (id, type, name, slug) values
  ('d1000000-0000-4000-8000-000000000001', 'national', 'Demo National', 'demo-national');
insert into public.organizations (id, parent_id, type, name, slug) values
  ('d1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'chapter', 'Demo Austin', 'demo-austin'),
  ('d1000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000001', 'chapter', 'Demo Dallas', 'demo-dallas');
-- demo data from before the run
insert into public.org_member_profiles (id, org_id, user_id, display_name, email, created_at) values
  ('d3000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'Demo Admin', 'demo-national@opencharter.test', now() - interval '1 day');
insert into public.role_assignments (user_id, role_id, org_id, created_at)
  select 'd0000000-0000-4000-8000-000000000001', id, 'd1000000-0000-4000-8000-000000000001', now() - interval '1 day'
  from public.roles where key = 'org_admin' and org_id is null;
insert into public.membership_tiers (id, org_id, key, name, created_at) values
  ('d5000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'regular', 'Regular', now() - interval '1 day');
insert into public.tier_terms (id, tier_id, org_id, key, label, length_count, length_unit, price_minor, created_at) values
  ('d6000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
   '1_year', '1 year', 1, 'year', 2500, now() - interval '1 day');
insert into public.audit_events (org_id, action, target_type, created_at)
  values ('d1000000-0000-4000-8000-000000000001', 'insert', 'old_demo_event', now() - interval '1 day');

-- what a run creates (now() is after _since)
select tests.as_user('d0000000-0000-4000-8000-000000000001');
create temp table run (k text primary key, id uuid);
insert into run select 'profile', public.admin_create_member('d1000000-0000-4000-8000-000000000001', 'Smoke Person', '');
select public.record_membership((select id from run where k = 'profile'), 'd6000000-0000-4000-8000-000000000001',
  current_date, 2500, 'check', 'smoke');
select public.define_seat('d1000000-0000-4000-8000-000000000001', 'smoke_seat', 'Smoke seat');
select tests.reset_role();
insert into public.membership_tiers (org_id, key, name) values ('d1000000-0000-4000-8000-000000000001', 'smoke', 'Smoke');
insert into public.membership_tiers (org_id, key, name) values ('22222222-0000-4000-8000-000000000001', 'keep', 'Keep');
select tests.eq((select count(*) from public.receipts where org_id = 'd1000000-0000-4000-8000-000000000001'), 1::bigint, 'run issued a receipt');

select tests.as_user('d0000000-0000-4000-8000-000000000001');
select tests.eq((public.purge_smoke_data(now() - interval '1 minute') ->> 'payments')::int, 1, 'purge reports what it removed');
select tests.reset_role();

select tests.eq((select count(*) from public.payments where org_id = 'd1000000-0000-4000-8000-000000000001'), 0::bigint, 'payments gone');
select tests.eq((select count(*) from public.receipts where org_id = 'd1000000-0000-4000-8000-000000000001'), 0::bigint, 'receipts gone with them');
select tests.eq((select count(*) from public.memberships where org_id = 'd1000000-0000-4000-8000-000000000001'), 0::bigint, 'memberships gone');
select tests.eq((select count(*) from public.seat_templates where org_id = 'd1000000-0000-4000-8000-000000000001'), 0::bigint, 'seats gone');
select tests.eq((select string_agg(key, ',') from public.membership_tiers where org_id = 'd1000000-0000-4000-8000-000000000001'),
  'regular', 'older demo level kept, the run''s level removed');
select tests.eq((select count(*) from public.org_member_profiles where org_id = 'd1000000-0000-4000-8000-000000000001'), 1::bigint, 'older demo profile kept');
select tests.eq((select count(*) from public.role_assignments where org_id = 'd1000000-0000-4000-8000-000000000001'), 1::bigint, 'older demo role kept');
select tests.eq((select count(*) from public.membership_tiers where key = 'keep'), 1::bigint, 'other orgs untouched');
select tests.eq((select count(*) from public.audit_events where target_type = 'old_demo_event'), 1::bigint, 'older audit entries kept');
select tests.eq((select count(*) from public.audit_events where org_id = 'd1000000-0000-4000-8000-000000000001'
  and created_at >= now() - interval '1 minute'), 1::bigint, 'only the summary remains from the run');
select tests.eq((select actor_id from public.audit_events where action = 'purge' and target_type = 'smoke_data'),
  'd0000000-0000-4000-8000-000000000001'::uuid, 'summary records who purged');
select tests.eq((select (after ->> 'memberships')::int from public.audit_events where action = 'purge'), 1, 'summary has the counts');
rollback;
