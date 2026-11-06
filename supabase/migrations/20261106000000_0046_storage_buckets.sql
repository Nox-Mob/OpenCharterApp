-- Storage buckets (Phase 0, docs/migration/phase-0-inventory.md §3). On Lovable Cloud the
-- "branding" bucket was made outside the migrations; the new project gets it from here.
-- Private: logos are read through signed URLs (src/modules/branding) and the policies on
-- storage.objects in 0001 and 0042. Safe to run again: an existing bucket is left as it is.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', false, 2097152,
        array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'])
on conflict (id) do nothing;
