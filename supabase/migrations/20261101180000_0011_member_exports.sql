-- ===== E-14 Member list exports and saved views (D-138) =====
-- Exports are built in the browser from data the exporter can already read (RLS), and every
-- export is recorded in the audit log first (instructions.md: exports are audited).
-- Saved views ("segments") keep a filter for reuse. Lovable conventions apply (D-125).

insert into public.permissions (key, description) values ('members.export', 'Export member lists')
  on conflict do nothing;
insert into public.role_permissions (role_id, permission_key)
  select id, 'members.export' from public.roles where key = 'org_admin' and org_id is null
  on conflict do nothing;

-- Records an export (who, which org, how many rows, which columns, which filter) before the
-- file is produced. Returns nothing; refuses people without members.export.
create or replace function public.log_member_export(_org uuid, _row_count int, _columns text[], _filter jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.has_permission(auth.uid(), 'members.export', _org) then raise exception 'not allowed'; end if;
  if _row_count < 0 or coalesce(array_length(_columns, 1), 0) = 0 then raise exception 'nothing to export'; end if;
  perform public.write_audit(_org, 'export', 'members', null, null,
    jsonb_build_object('rows', _row_count, 'columns', to_jsonb(_columns), 'filter', coalesce(_filter, '{}'::jsonb)));
end $$;
revoke execute on function public.log_member_export(uuid, int, text[], jsonb) from public, anon;
grant execute on function public.log_member_export(uuid, int, text[], jsonb) to authenticated;

create table public.member_segments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  filter jsonb not null default '{}'::jsonb check (jsonb_typeof(filter) = 'object'),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);
grant select, insert, update, delete on public.member_segments to authenticated;
grant all on public.member_segments to service_role;
alter table public.member_segments enable row level security;
comment on table public.member_segments is 'Saved member list filters (E-14).';
create policy "member viewers read segments" on public.member_segments for select to authenticated
  using (public.has_permission(auth.uid(), 'members.view', org_id));
create policy "member managers add segments" on public.member_segments for insert to authenticated
  with check (public.has_permission(auth.uid(), 'members.manage', org_id));
create policy "member managers change segments" on public.member_segments for update to authenticated
  using (public.has_permission(auth.uid(), 'members.manage', org_id))
  with check (public.has_permission(auth.uid(), 'members.manage', org_id));
create policy "member managers remove segments" on public.member_segments for delete to authenticated
  using (public.has_permission(auth.uid(), 'members.manage', org_id));
create trigger audit_member_segments after insert or update or delete on public.member_segments
  for each row execute function public.audit_row_change();
