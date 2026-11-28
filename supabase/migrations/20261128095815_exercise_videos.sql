-- Videos of 9 exercises, written by `pnpm import:exercise-videos` (ADR 0176).
insert into public.exercise_videos (exercise_id, video_path, poster_path)
values
  ('Dumbbell_Floor_Press', 'Dumbbell_Floor_Press/4df2536c84609c75.mp4', 'Dumbbell_Floor_Press/4df2536c84609c75.jpg'),
  ('Goblet_Squat', 'Goblet_Squat/d70b7034690c1ba5.mp4', 'Goblet_Squat/d70b7034690c1ba5.jpg'),
  ('Side_Lateral_Raise', 'Side_Lateral_Raise/cdda478fccc53507.mp4', 'Side_Lateral_Raise/cdda478fccc53507.jpg'),
  ('Split_Squat_with_Dumbbells', 'Split_Squat_with_Dumbbells/617462c73e922e06.mp4', 'Split_Squat_with_Dumbbells/617462c73e922e06.jpg'),
  ('Standing_Dumbbell_Triceps_Extension', 'Standing_Dumbbell_Triceps_Extension/7c6f7f85812b7e32.mp4', 'Standing_Dumbbell_Triceps_Extension/7c6f7f85812b7e32.jpg'),
  ('Standing_Dumbbell_Upright_Row', 'Standing_Dumbbell_Upright_Row/83e3950d86e57a74.mp4', 'Standing_Dumbbell_Upright_Row/83e3950d86e57a74.jpg'),
  ('Stiff-Legged_Dumbbell_Deadlift', 'Stiff-Legged_Dumbbell_Deadlift/0ba24f4a0af01864.mp4', 'Stiff-Legged_Dumbbell_Deadlift/0ba24f4a0af01864.jpg'),
  ('Straight-Arm_Dumbbell_Pullover', 'Straight-Arm_Dumbbell_Pullover/f0878226d50b10f2.mp4', 'Straight-Arm_Dumbbell_Pullover/f0878226d50b10f2.jpg'),
  ('Tricep_Dumbbell_Kickback', 'Tricep_Dumbbell_Kickback/7e75c7846cf1e1ed.mp4', 'Tricep_Dumbbell_Kickback/7e75c7846cf1e1ed.jpg')
on conflict (exercise_id) do update
  set video_path = excluded.video_path, poster_path = excluded.poster_path;
