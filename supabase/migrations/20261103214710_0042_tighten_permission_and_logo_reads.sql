-- D-201: no read rule lets every row through.
-- Permission catalog: signed-in callers only, stated explicitly.
alter policy "read permissions" on public.permissions
  using (auth.uid() is not null);
-- Role permissions: only for roles the caller can see (same rule as public.roles).
alter policy "read role permissions" on public.role_permissions
  using (exists (
    select 1 from public.roles r
    where r.id = role_id
      and (r.org_id is null
        or public.can_see_org_tree(auth.uid(), r.org_id)
        or public.has_permission(auth.uid(), 'roles.manage', r.org_id))));
-- Logos: signed-in people who can see the org tree (its members, its chapters' members,
-- and admins with org.view). No anonymous reads.
alter policy "branding public read" on storage.objects
  to authenticated
  using (bucket_id = 'branding'
    and public.can_see_org_tree(auth.uid(), ((storage.foldername(name))[1])::uuid));