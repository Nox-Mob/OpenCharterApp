-- Web address availability (0007): yes/no only, for signed-in people.
begin;
select tests.fixture();
select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.eq(charter.slug_available('ch-a'), false, 'a taken address, even in an organization you can''t see');
select tests.eq(charter.slug_available('CH-A '), false, 'case and spaces don''t matter');
select tests.eq(charter.slug_available('brand-new-post'), true, 'a free address');
select tests.eq(charter.slug_available('Not valid!'), false, 'an invalid address isn''t available');
select tests.reset_role();
rollback;
