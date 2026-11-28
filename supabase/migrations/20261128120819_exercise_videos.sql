-- Videos of 4 exercises, written by `pnpm import:exercise-videos` (ADR 0176).
insert into public.exercise_videos (exercise_id, video_path, poster_path)
values
  ('Body_Tricep_Press', 'Body_Tricep_Press/91249a74a6b86e07.mp4', 'Body_Tricep_Press/91249a74a6b86e07.jpg'),
  ('Leg_Press', 'Leg_Press/bcc0ad597c7ce32a.mp4', 'Leg_Press/bcc0ad597c7ce32a.jpg'),
  ('Seated_Cable_Rows', 'Seated_Cable_Rows/bc10408b96163746.mp4', 'Seated_Cable_Rows/bc10408b96163746.jpg'),
  ('Seated_Calf_Raise', 'Seated_Calf_Raise/ec375533c827cfae.mp4', 'Seated_Calf_Raise/ec375533c827cfae.jpg')
on conflict (exercise_id) do update
  set video_path = excluded.video_path, poster_path = excluded.poster_path;
