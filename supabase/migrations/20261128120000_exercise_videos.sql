-- A video of how an exercise goes, shown in place of its muscle map (ADR 0176). Each is a small
-- looping MP4 with a poster frame in the public exercise-media bucket, named by its content, so a
-- new take of an exercise gets a new name and no phone keeps showing the old one. The rows are
-- written by `pnpm exercise-videos`, one migration per batch.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exercise-media', 'exercise-media', true, 2097152, array['video/mp4', 'image/jpeg'])
on conflict (id) do nothing;

create table public.exercise_videos (
  exercise_id text primary key references public.exercises (id) on delete cascade,
  -- In the exercise-media bucket: '<exercise id>/<hash>.mp4' and '<exercise id>/<hash>.jpg'.
  video_path text not null check (video_path ~ '^[A-Za-z0-9_-]+/[0-9a-f]{16}\.mp4$'),
  poster_path text not null check (poster_path ~ '^[A-Za-z0-9_-]+/[0-9a-f]{16}\.jpg$'),
  created_at timestamptz not null default now()
);

-- Everyone using the app can read them, as the library; only migrations write them. There are no
-- policies on storage.objects for the bucket, so clients cannot upload, change or delete files.
alter table public.exercise_videos enable row level security;

create policy "Exercise videos are readable by everyone"
  on public.exercise_videos for select
  to anon, authenticated
  using (true);

grant select on public.exercise_videos to anon, authenticated;
revoke insert, update, delete, truncate on public.exercise_videos from anon, authenticated;
