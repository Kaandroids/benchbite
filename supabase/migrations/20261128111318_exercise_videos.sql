-- Videos of 16 exercises, written by `pnpm import:exercise-videos` (ADR 0176).
insert into public.exercise_videos (exercise_id, video_path, poster_path)
values
  ('Bench_Dips', 'Bench_Dips/478154a3fa5716d7.mp4', 'Bench_Dips/478154a3fa5716d7.jpg'),
  ('Bodyweight_Squat', 'Bodyweight_Squat/6543c46cf7b0ba47.mp4', 'Bodyweight_Squat/6543c46cf7b0ba47.jpg'),
  ('Bodyweight_Walking_Lunge', 'Bodyweight_Walking_Lunge/45e0e20fe5202f63.mp4', 'Bodyweight_Walking_Lunge/45e0e20fe5202f63.jpg'),
  ('Butt_Lift_Bridge', 'Butt_Lift_Bridge/716b86ff6d4dc9a6.mp4', 'Butt_Lift_Bridge/716b86ff6d4dc9a6.jpg'),
  ('Crunches', 'Crunches/89620cd920968c6b.mp4', 'Crunches/89620cd920968c6b.jpg'),
  ('Decline_Push-Up', 'Decline_Push-Up/ef6a360e5c211c4c.mp4', 'Decline_Push-Up/ef6a360e5c211c4c.jpg'),
  ('Dips_-_Triceps_Version', 'Dips_-_Triceps_Version/d57edc8fbf27ee24.mp4', 'Dips_-_Triceps_Version/d57edc8fbf27ee24.jpg'),
  ('EZ-Bar_Curl', 'EZ-Bar_Curl/b9be3434909dc125.mp4', 'EZ-Bar_Curl/b9be3434909dc125.jpg'),
  ('EZ-Bar_Skullcrusher', 'EZ-Bar_Skullcrusher/7efc1d7d21c68953.mp4', 'EZ-Bar_Skullcrusher/7efc1d7d21c68953.jpg'),
  ('Freehand_Jump_Squat', 'Freehand_Jump_Squat/22a25b59586758aa.mp4', 'Freehand_Jump_Squat/22a25b59586758aa.jpg'),
  ('Glute_Kickback', 'Glute_Kickback/242cff1afdb90892.mp4', 'Glute_Kickback/242cff1afdb90892.jpg'),
  ('Plank', 'Plank/86744e6004a84dbb.mp4', 'Plank/86744e6004a84dbb.jpg'),
  ('Pullups', 'Pullups/a566b65f649d632e.mp4', 'Pullups/a566b65f649d632e.jpg'),
  ('Pushups', 'Pushups/dd4d1287569ec049.mp4', 'Pushups/dd4d1287569ec049.jpg'),
  ('Russian_Twist', 'Russian_Twist/772664fc79b91b0f.mp4', 'Russian_Twist/772664fc79b91b0f.jpg'),
  ('Standing_Dumbbell_Calf_Raise', 'Standing_Dumbbell_Calf_Raise/e7be8634b3f35199.mp4', 'Standing_Dumbbell_Calf_Raise/e7be8634b3f35199.jpg')
on conflict (exercise_id) do update
  set video_path = excluded.video_path, poster_path = excluded.poster_path;
