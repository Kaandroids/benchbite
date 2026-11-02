-- Voice messages to Bite (#298, ADR 0072) are kept as photos are (ADR 0062): in the private
-- `coach-media` bucket, in their thread's folder, which deleting the thread or the account queues
-- for removal (ADR 0063). The bucket now takes AAC in an MP4 container, as the app records it,
-- within the same size limit, which a minute of speech keeps well under.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'audio/mp4']
where id = 'coach-media';
