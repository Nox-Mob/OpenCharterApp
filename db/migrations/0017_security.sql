-- Security review (2026-11-14): one read policy per table (advisor multiple_permissive_policies).
-- The rows each person can read are exactly the same as before.

-- Memberships: people who may view members in the unit; a member reading their own; a chapter's
-- member viewers reading the national membership of their members.
drop policy if exists "members and managers read memberships" on charter.memberships;
drop policy if exists "chapters read their members' national membership" on charter.memberships;
drop policy if exists "read memberships" on charter.memberships;
create policy "read memberships" on charter.memberships for select to authenticated
  using (
    unit_id in (select charter.permitted_units('members.view'))
    or (charter.is_org_member((select auth.uid()), unit_id)
        and exists (select 1 from charter.member_profiles p
                    where p.id = memberships.profile_id and p.user_id = (select auth.uid())))
    or exists (select 1 from charter.member_profiles p
               where p.home_of = memberships.id and p.left_at is null
                 and charter.has_permission((select auth.uid()), 'members.view', p.unit_id))
  );

-- Settings: members (and org viewers) read; managers read and write. "Managers write" was one
-- policy for every action, which also made it a second read policy.
drop policy if exists "managers write settings" on charter.org_settings;
drop policy if exists "members read settings" on charter.org_settings;
drop policy if exists "read settings" on charter.org_settings;
drop policy if exists "managers add settings" on charter.org_settings;
drop policy if exists "managers change settings" on charter.org_settings;
drop policy if exists "managers remove settings" on charter.org_settings;
create policy "read settings" on charter.org_settings for select to authenticated
  using (charter.is_org_member((select auth.uid()), unit_id)
         or unit_id in (select charter.permitted_units('org.view'))
         or unit_id in (select charter.permitted_units('org.manage')));
create policy "managers add settings" on charter.org_settings for insert to authenticated
  with check (unit_id in (select charter.permitted_units('org.manage')));
create policy "managers change settings" on charter.org_settings for update to authenticated
  using (unit_id in (select charter.permitted_units('org.manage')))
  with check (unit_id in (select charter.permitted_units('org.manage')));
create policy "managers remove settings" on charter.org_settings for delete to authenticated
  using (unit_id in (select charter.permitted_units('org.manage')));

select public._tune_schema('charter');
