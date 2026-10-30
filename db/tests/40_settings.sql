-- Settings: national lock blocks chapter writes (D-108)
begin;
select tests.fixture();
select tests.as_user('11111111-0000-4000-8000-000000000001');
insert into public.org_settings (org_id, key, value, mode)
  values ('22222222-0000-4000-8000-000000000001', 'membership.grace_days', '30', 'locked');
select tests.reset_role();

select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$insert into public.org_settings (org_id, key, value) values ('22222222-0000-4000-8000-000000000002', 'membership.grace_days', '5')$$, 'locked');
-- unlocked keys are fine
insert into public.org_settings (org_id, key, value) values ('22222222-0000-4000-8000-000000000002', 'contact.email', '"a@test.org"');
-- chapter admin cannot write national settings
select tests.throws($$insert into public.org_settings (org_id, key, value) values ('22222222-0000-4000-8000-000000000001', 'contact.email', '"x"')$$, 'row-level security');
-- lineage settings include the national lock
select tests.eq((select mode::text from public.lineage_settings('22222222-0000-4000-8000-000000000002') where key = 'membership.grace_days'), 'locked', 'lock visible to chapter');
select tests.reset_role();

-- tax profile is per org and hidden from members
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.eq((select count(*) from public.tax_profiles), 0::bigint, 'member cannot read tax');
select tests.reset_role();
rollback;
