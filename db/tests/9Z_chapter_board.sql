-- Chapters on OpenBoardApp (0006): the national's choice, a chapter's request, the decision,
-- the chapter's own organization, and the emails.
begin;
select tests.fixture();

-- Default: chapters may ask, the national decides.
select tests.eq(charter.chapter_board_policy('22222222-0000-4000-8000-000000000002'), 'approval', 'default: approval');

-- A member (not an admin) can't ask; the chapter admin can.
select tests.as_user('11111111-0000-4000-8000-000000000003');
select tests.throws($$select charter.request_chapter_board('22222222-0000-4000-8000-000000000002')$$, 'Only the chapter''s admins');
select tests.reset_role();

select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.throws($$select charter.request_chapter_board('22222222-0000-4000-8000-000000000001')$$, 'the organization itself');
select tests.reset_role();

select tests.as_user('11111111-0000-4000-8000-000000000002');
select charter.request_chapter_board('22222222-0000-4000-8000-000000000002');
select tests.eq((select status from charter.chapter_board_status('22222222-0000-4000-8000-000000000002')), 'pending', 'request pending');
select tests.throws($$select charter.request_chapter_board('22222222-0000-4000-8000-000000000002')$$, 'already asked');
-- The chapter admin can't approve their own request.
select tests.throws($$select charter.decide_chapter_board((select id from charter.chapter_board_requests limit 1), true)$$, 'Only the national''s admins');
select tests.reset_role();

-- The national's owner got an email.
select tests.eq((select count(*) from public.email_outbox where template = 'charter.chapter_board_request'
  and to_user_id = '11111111-0000-4000-8000-000000000001'), 1::bigint, 'the national''s owner is emailed');
select tests.eq((select data->>'chapter' from public.email_outbox where template = 'charter.chapter_board_request'), 'Chapter A', 'the email names the chapter');

-- The national sees the request and approves it.
select tests.as_user('11111111-0000-4000-8000-000000000001');
select tests.eq((select chapter || ' ' || status from charter.chapter_board_requests_for('22222222-0000-4000-8000-000000000001')),
  'Chapter A pending', 'the national''s list');
select charter.decide_chapter_board((select id from charter.chapter_board_requests limit 1), true);
select tests.reset_role();

select tests.eq((select count(*) from public.organizations o where o.source_app = 'charter'
  and o.source_ref = '22222222-0000-4000-8000-000000000002' and o.parent_org_id = '22222222-0000-4000-8000-000000000001'
  and o.name = 'Chapter A'), 1::bigint, 'the chapter has its own organization under the national''s');
select tests.eq((select m.role::text from public.memberships m join public.organizations o on o.id = m.org_id
  where o.source_ref = '22222222-0000-4000-8000-000000000002' and m.user_id = '11111111-0000-4000-8000-000000000002'),
  'owner', 'the requester owns it');
select tests.eq((select m.role::text from public.memberships m join public.organizations o on o.id = m.org_id
  where o.source_ref = '22222222-0000-4000-8000-000000000002' and m.user_id = '11111111-0000-4000-8000-000000000001'),
  'admin', 'the national''s owner is an admin');
select tests.eq(charter.unit_for_board_org(charter.board_org_for_unit('22222222-0000-4000-8000-000000000002')),
  '22222222-0000-4000-8000-000000000002'::uuid, 'unit and board organization map both ways');
select tests.eq(charter.board_org_for_unit('22222222-0000-4000-8000-000000000001'), '22222222-0000-4000-8000-000000000001'::uuid,
  'the national''s board is its own organization');
select tests.eq(charter.board_org_for_unit('22222222-0000-4000-8000-000000000003'), null::uuid, 'Chapter B has none');
select tests.eq((select count(*) from public.email_outbox where template = 'charter.chapter_board_decided'
  and to_user_id = '11111111-0000-4000-8000-000000000002' and (data->>'approved')::boolean), 1::bigint, 'the requester hears it was approved');

select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.eq((select status from charter.chapter_board_status('22222222-0000-4000-8000-000000000002')), 'approved', 'approved');
select tests.throws($$select charter.request_chapter_board('22222222-0000-4000-8000-000000000002')$$, 'already uses OpenBoardApp');
select tests.reset_role();

-- 'off': chapters can't ask. 'open': no approval needed.
insert into charter.org_settings (unit_id, key, value) values ('22222222-0000-4000-8000-000000000001', 'board.chapters', '"off"');
insert into charter.role_assignments (user_id, role_id, unit_id)
  select '11111111-0000-4000-8000-000000000002', id, '22222222-0000-4000-8000-000000000003' from charter.roles where key = 'org_admin' and unit_id is null;
select tests.as_user('11111111-0000-4000-8000-000000000002');
select tests.throws($$select charter.request_chapter_board('22222222-0000-4000-8000-000000000003')$$, 'doesn''t let chapters');
select tests.reset_role();
update charter.org_settings set value = '"open"' where unit_id = '22222222-0000-4000-8000-000000000001' and key = 'board.chapters';
select tests.as_user('11111111-0000-4000-8000-000000000002');
select charter.request_chapter_board('22222222-0000-4000-8000-000000000003');
select tests.reset_role();
select tests.eq(charter.board_org_for_unit('22222222-0000-4000-8000-000000000003') is not null, true, 'open: on straight away');

-- Outsiders see nothing.
select tests.as_user('11111111-0000-4000-8000-000000000004');
select tests.eq((select count(*) from charter.chapter_board_requests), 0::bigint, 'outsiders see no requests');
select tests.eq((select count(*) from charter.chapter_board_requests_for('22222222-0000-4000-8000-000000000001')), 0::bigint, 'nor the national''s list');
select tests.reset_role();
rollback;
