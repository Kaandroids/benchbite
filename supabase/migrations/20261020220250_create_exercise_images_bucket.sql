-- Exercise images, converted from free-exercise-db by scripts/import-exercises.ts. The bucket is
-- public, so the app loads images by URL without a signed request. There are no policies on
-- storage.objects for it, so clients cannot upload, change or delete images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exercise-images', 'exercise-images', true, 1048576, array['image/webp'])
on conflict (id) do nothing;
