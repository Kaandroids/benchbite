-- Photos the user sends Bite in the chat (#299, ADR 0062), kept as "<user id>/<thread id>/<uuid>.jpg".
-- They are private: only the chat function writes them, with the service role, once it has checked
-- them as ADR 0062 decides, so there are no policies to upload, change or remove them. Each
-- user reads only the folder named after their id, and the app shows the photos through short-lived
-- signed URLs. JPEG only, at most 1.5 MB each, the size limit of a meal photo in Nutrition (ADR 0059).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('coach-media', 'coach-media', false, 1500000, array['image/jpeg']);

create policy "Users read their own coach media"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'coach-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
