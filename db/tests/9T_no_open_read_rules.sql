-- 0042 (D-207): permission lists and logos are not readable by everyone.
begin;
select tests.eq((select count(*)::int from pg_policies
  where policyname in ('read permissions', 'read role permissions', 'branding public read')
    and qual = 'true'), 0, 'no read rule is a plain "true"');
select tests.eq((select roles::text from pg_policies where policyname = 'branding public read'),
  '{authenticated}', 'signed-out visitors cannot read logos');
select tests.eq((select qual like '%can_see_org_tree%' from pg_policies where policyname = 'branding public read'),
  true, 'logos are limited to people who can see the organization');
select tests.eq((select qual like '%can_see_org_tree%' from pg_policies where policyname = 'read role permissions'),
  true, 'role permissions are limited to roles the reader can see');
rollback;
