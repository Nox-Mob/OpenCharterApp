-- 0036 (D-184): below a home-chapter national, chapters can't add or restore membership levels;
-- the national still can; the separate model keeps the old rules.
begin;
select tests.fixture();
-- Separate model first: chapter A admin adds a level (allowed by default), then retires it
select tests.as_user('11111111-0000-4000-8000-000000000002');
insert into charter.membership_tiers (id, unit_id, key, name) values
  ('55555555-0000-4000-8000-0000000000a1', '22222222-0000-4000-8000-000000000002', 'local', 'Local');
update charter.membership_tiers set active = false where id = '55555555-0000-4000-8000-0000000000a1';
select tests.reset_role();

-- The national chooses the home-chapter model
select tests.as_user('11111111-0000-4000-8000-000000000001');
insert into charter.org_settings (unit_id, key, value, mode)
  values ('22222222-0000-4000-8000-000000000001', 'membership.model', '"home_chapter"', 'override');
-- the national still manages its own levels
insert into charter.membership_tiers (unit_id, key, name) values
  ('22222222-0000-4000-8000-000000000001', 'regular', 'Regular');
select tests.reset_role();

select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$insert into charter.membership_tiers (unit_id, key, name)
  values ('22222222-0000-4000-8000-000000000002', 'local2', 'Local 2')$$, 'chapters don''t have their own membership levels');
select tests.throws($$update charter.membership_tiers set active = true where id = '55555555-0000-4000-8000-0000000000a1'$$,
  'chapters don''t have their own membership levels');
-- other edits to the retired level are still allowed (it keeps its history)
update charter.membership_tiers set name = 'Local (old)' where id = '55555555-0000-4000-8000-0000000000a1';
select tests.eq((select name from charter.membership_tiers where id = '55555555-0000-4000-8000-0000000000a1'), 'Local (old)', 'renamed');
select tests.reset_role();
-- even with "chapters may create their own levels" set by the national
insert into charter.org_settings (unit_id, key, value, mode)
  values ('22222222-0000-4000-8000-000000000001', 'membership.child_levels_allowed', 'true', 'locked');
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$insert into charter.membership_tiers (unit_id, key, name)
  values ('22222222-0000-4000-8000-000000000002', 'local3', 'Local 3')$$, 'chapters don''t have their own membership levels');
rollback;
