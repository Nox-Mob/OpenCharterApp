-- Security review round 7: logos take PNG, JPG and WebP only. SVG pictures can hold scripts that
-- run when the file is opened in a browser tab, and nothing cleaned them. No organization had
-- uploaded an SVG logo on staging. The 2 MB limit stays.
-- no access: changes no read rules.
do $$
begin
  -- Only where Supabase Storage keeps a list of allowed types (the tests' stub doesn't).
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    execute $q$update storage.buckets
      set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
      where id = 'charter-branding'$q$;
  end if;
end $$;
