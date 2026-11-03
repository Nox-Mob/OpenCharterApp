-- D-208: the permission catalog is readable only by people who hold a role somewhere.
alter policy "read permissions" on public.permissions
  using (exists (select 1 from public.role_assignments ra where ra.user_id = auth.uid()));