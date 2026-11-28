-- The exercises' videos (ADR 0176): a public bucket, and rows everyone reads and only migrations
-- write, with paths in the bucket's shape.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

select is(
  (select public from storage.buckets where id = 'exercise-media'),
  true,
  'The videos are in a public bucket'
);
select is(
  (select allowed_mime_types from storage.buckets where id = 'exercise-media'),
  array['video/mp4', 'image/jpeg'],
  'The bucket takes only MP4 videos and JPEG posters'
);

-- A video of an exercise, as a batch's migration writes it, for the checks below.
insert into public.exercise_videos (exercise_id, video_path, poster_path)
values ('Plank', 'Plank/0123456789abcdef.mp4', 'Plank/0123456789abcdef.jpg')
on conflict (exercise_id) do nothing;

select throws_ok(
  $$ insert into public.exercise_videos (exercise_id, video_path, poster_path)
     values ('Pushups', '../Pushups.mp4', 'Pushups/0123456789abcdef.jpg') $$,
  '23514',
  null,
  'A video path is a file of the exercise named by its hash'
);
select throws_ok(
  $$ insert into public.exercise_videos (exercise_id, video_path, poster_path)
     values ('No_Such_Exercise', 'No_Such_Exercise/0123456789abcdef.mp4',
             'No_Such_Exercise/0123456789abcdef.jpg') $$,
  '23503',
  null,
  'A video belongs to an exercise of the library'
);

select set_config('role', 'authenticated', true),
  set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select isnt_empty(
  $$ select * from public.exercise_videos where exercise_id = 'Plank' $$,
  'Signed-in users can read the videos'
);
select throws_ok(
  $$ update public.exercise_videos set video_path = 'Plank/fedcba9876543210.mp4' where exercise_id = 'Plank' $$,
  '42501',
  null,
  'Signed-in users cannot change a video'
);
select throws_ok(
  $$ delete from public.exercise_videos where exercise_id = 'Plank' $$,
  '42501',
  null,
  'Signed-in users cannot delete a video'
);

select set_config('role', 'anon', true);

select isnt_empty(
  $$ select * from public.exercise_videos where exercise_id = 'Plank' $$,
  'Guests can read the videos'
);
select throws_ok(
  $$ insert into public.exercise_videos (exercise_id, video_path, poster_path)
     values ('Pushups', 'Pushups/0123456789abcdef.mp4', 'Pushups/0123456789abcdef.jpg') $$,
  '42501',
  null,
  'Guests cannot add a video'
);

select * from finish();
rollback;
