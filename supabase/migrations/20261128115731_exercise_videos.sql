-- Videos of 8 exercises, written by `pnpm import:exercise-videos` (ADR 0176).
insert into public.exercise_videos (exercise_id, video_path, poster_path)
values
  ('Bicycling_Stationary', 'Bicycling_Stationary/c618f26e370655c8.mp4', 'Bicycling_Stationary/c618f26e370655c8.jpg'),
  ('Dead_Bug', 'Dead_Bug/4e8e1a77e0228c27.mp4', 'Dead_Bug/4e8e1a77e0228c27.jpg'),
  ('Face_Pull', 'Face_Pull/719961b589582fa6.mp4', 'Face_Pull/719961b589582fa6.jpg'),
  ('Hanging_Leg_Raise', 'Hanging_Leg_Raise/522a8ba1d900d290.mp4', 'Hanging_Leg_Raise/522a8ba1d900d290.jpg'),
  ('Inverted_Row', 'Inverted_Row/cdf3c977a8d11cb1.mp4', 'Inverted_Row/cdf3c977a8d11cb1.jpg'),
  ('Rowing_Stationary', 'Rowing_Stationary/410c58dcd1c9eccd.mp4', 'Rowing_Stationary/410c58dcd1c9eccd.jpg'),
  ('Triceps_Pushdown', 'Triceps_Pushdown/272cb1a41a119f74.mp4', 'Triceps_Pushdown/272cb1a41a119f74.jpg'),
  ('Wide-Grip_Lat_Pulldown', 'Wide-Grip_Lat_Pulldown/1705741388288d0f.mp4', 'Wide-Grip_Lat_Pulldown/1705741388288d0f.jpg')
on conflict (exercise_id) do update
  set video_path = excluded.video_path, poster_path = excluded.poster_path;
