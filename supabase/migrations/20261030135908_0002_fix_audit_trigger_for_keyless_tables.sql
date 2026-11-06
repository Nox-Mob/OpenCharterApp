create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare _row jsonb; _org uuid; _id text;
begin
  _row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if tg_table_name = 'organizations' then _org := (_row->>'id')::uuid;
  else _org := (_row->>'org_id')::uuid; end if;
  _id := coalesce(_row->>'id', _row->>'key', _row->>'org_id');
  perform public.write_audit(_org, lower(tg_op), tg_table_name, _id,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;