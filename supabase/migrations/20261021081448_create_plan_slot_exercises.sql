-- The exercises the plan builder can prescribe. A workout is built from slots, movement patterns
-- such as a squat or a horizontal push, and each slot lists well-known exercises to choose from.
-- The plan builder takes the first candidate the user's setup and experience allow.

create type public.plan_slot as enum (
  'squat',
  'hinge',
  'lunge',
  'horizontal_push',
  'incline_push',
  'vertical_push',
  'horizontal_pull',
  'vertical_pull',
  'biceps',
  'triceps',
  'shoulders',
  'calves',
  'core',
  'conditioning'
);

create table public.plan_slot_exercises (
  slot public.plan_slot not null,
  exercise_id text not null references public.exercises (id) on delete cascade,
  -- The least equipment the exercise needs. Bodyweight assumes a floor, a chair and a sturdy
  -- table but no pull-up bar; dumbbells add a pair of dumbbells but no bench; the gym has
  -- everything.
  requires public.training_setup not null,
  -- The least experience the exercise is suitable for.
  min_experience public.experience not null,
  -- Lower comes first. Gyms prefer barbells and machines over dumbbells and bodyweight.
  priority smallint not null check (priority > 0),
  primary key (slot, exercise_id),
  unique (slot, priority)
);

alter table public.plan_slot_exercises enable row level security;

create policy "Plan slot exercises are readable by everyone"
  on public.plan_slot_exercises for select
  to anon, authenticated
  using (true);

revoke insert, update, delete, truncate on public.plan_slot_exercises from anon, authenticated;

insert into public.plan_slot_exercises (slot, exercise_id, requires, min_experience, priority)
values
  ('squat', 'Barbell_Squat', 'gym', 'beginner', 1),
  ('squat', 'Leg_Press', 'gym', 'beginner', 2),
  ('squat', 'Goblet_Squat', 'dumbbells', 'beginner', 3),
  ('squat', 'Dumbbell_Squat', 'dumbbells', 'beginner', 4),
  ('squat', 'Hack_Squat', 'gym', 'beginner', 5),
  ('squat', 'Front_Squat_Clean_Grip', 'gym', 'advanced', 6),
  ('squat', 'Bodyweight_Squat', 'bodyweight', 'beginner', 7),

  ('hinge', 'Romanian_Deadlift', 'gym', 'beginner', 1),
  ('hinge', 'Barbell_Deadlift', 'gym', 'intermediate', 2),
  ('hinge', 'Stiff-Legged_Dumbbell_Deadlift', 'dumbbells', 'beginner', 3),
  ('hinge', 'Barbell_Hip_Thrust', 'gym', 'intermediate', 4),
  ('hinge', 'Hyperextensions_Back_Extensions', 'gym', 'beginner', 5),
  ('hinge', 'Single_Leg_Glute_Bridge', 'bodyweight', 'beginner', 6),
  ('hinge', 'Butt_Lift_Bridge', 'bodyweight', 'beginner', 7),

  ('lunge', 'Barbell_Lunge', 'gym', 'intermediate', 1),
  ('lunge', 'Dumbbell_Lunges', 'dumbbells', 'beginner', 2),
  ('lunge', 'Split_Squat_with_Dumbbells', 'dumbbells', 'beginner', 3),
  ('lunge', 'Bodyweight_Walking_Lunge', 'bodyweight', 'beginner', 4),
  ('lunge', 'Step-up_with_Knee_Raise', 'bodyweight', 'beginner', 5),

  ('horizontal_push', 'Barbell_Bench_Press_-_Medium_Grip', 'gym', 'beginner', 1),
  ('horizontal_push', 'Dumbbell_Bench_Press', 'gym', 'beginner', 2),
  ('horizontal_push', 'Leverage_Chest_Press', 'gym', 'beginner', 3),
  ('horizontal_push', 'Dumbbell_Floor_Press', 'dumbbells', 'beginner', 4),
  ('horizontal_push', 'Pushups', 'bodyweight', 'beginner', 5),
  ('horizontal_push', 'Incline_Push-Up', 'bodyweight', 'beginner', 6),

  ('incline_push', 'Barbell_Incline_Bench_Press_-_Medium_Grip', 'gym', 'intermediate', 1),
  ('incline_push', 'Incline_Dumbbell_Press', 'gym', 'beginner', 2),
  ('incline_push', 'Cable_Crossover', 'gym', 'beginner', 3),
  ('incline_push', 'Decline_Push-Up', 'bodyweight', 'intermediate', 4),
  ('incline_push', 'Dumbbell_Flyes', 'gym', 'beginner', 5),

  ('vertical_push', 'Standing_Military_Press', 'gym', 'intermediate', 1),
  ('vertical_push', 'Dumbbell_Shoulder_Press', 'dumbbells', 'beginner', 2),
  ('vertical_push', 'Machine_Shoulder_Military_Press', 'gym', 'beginner', 3),
  ('vertical_push', 'Arnold_Dumbbell_Press', 'dumbbells', 'intermediate', 4),

  ('horizontal_pull', 'Bent_Over_Barbell_Row', 'gym', 'intermediate', 1),
  ('horizontal_pull', 'Seated_Cable_Rows', 'gym', 'beginner', 2),
  ('horizontal_pull', 'One-Arm_Dumbbell_Row', 'dumbbells', 'beginner', 3),
  ('horizontal_pull', 'T-Bar_Row_with_Handle', 'gym', 'intermediate', 4),
  ('horizontal_pull', 'Bent_Over_Two-Dumbbell_Row', 'dumbbells', 'beginner', 5),
  ('horizontal_pull', 'Inverted_Row', 'bodyweight', 'beginner', 6),

  ('vertical_pull', 'Wide-Grip_Lat_Pulldown', 'gym', 'beginner', 1),
  ('vertical_pull', 'Pullups', 'gym', 'intermediate', 2),
  ('vertical_pull', 'Close-Grip_Front_Lat_Pulldown', 'gym', 'beginner', 3),
  ('vertical_pull', 'Chin-Up', 'gym', 'intermediate', 4),
  ('vertical_pull', 'Straight-Arm_Dumbbell_Pullover', 'dumbbells', 'beginner', 5),

  ('biceps', 'Barbell_Curl', 'gym', 'beginner', 1),
  ('biceps', 'Hammer_Curls', 'dumbbells', 'beginner', 2),
  ('biceps', 'EZ-Bar_Curl', 'gym', 'beginner', 3),
  ('biceps', 'Seated_Dumbbell_Curl', 'dumbbells', 'beginner', 4),
  ('biceps', 'Preacher_Curl', 'gym', 'beginner', 5),
  ('biceps', 'Concentration_Curls', 'dumbbells', 'beginner', 6),

  ('triceps', 'Triceps_Pushdown', 'gym', 'beginner', 1),
  ('triceps', 'Standing_Dumbbell_Triceps_Extension', 'dumbbells', 'beginner', 2),
  ('triceps', 'Cable_Rope_Overhead_Triceps_Extension', 'gym', 'beginner', 3),
  ('triceps', 'EZ-Bar_Skullcrusher', 'gym', 'intermediate', 4),
  ('triceps', 'Tricep_Dumbbell_Kickback', 'dumbbells', 'beginner', 5),
  ('triceps', 'Bench_Dips', 'bodyweight', 'beginner', 6),
  ('triceps', 'Push-Ups_-_Close_Triceps_Position', 'bodyweight', 'intermediate', 7),

  ('shoulders', 'Side_Lateral_Raise', 'dumbbells', 'beginner', 1),
  ('shoulders', 'Face_Pull', 'gym', 'beginner', 2),
  ('shoulders', 'Reverse_Flyes', 'dumbbells', 'beginner', 3),
  ('shoulders', 'Front_Dumbbell_Raise', 'dumbbells', 'beginner', 4),
  ('shoulders', 'Standing_Dumbbell_Upright_Row', 'dumbbells', 'intermediate', 5),

  ('calves', 'Standing_Calf_Raises', 'gym', 'beginner', 1),
  ('calves', 'Seated_Calf_Raise', 'gym', 'beginner', 2),
  ('calves', 'Standing_Dumbbell_Calf_Raise', 'dumbbells', 'beginner', 3),

  ('core', 'Plank', 'bodyweight', 'beginner', 1),
  ('core', 'Cable_Crunch', 'gym', 'beginner', 2),
  ('core', 'Crunches', 'bodyweight', 'beginner', 3),
  ('core', 'Dead_Bug', 'bodyweight', 'beginner', 4),
  ('core', 'Hanging_Leg_Raise', 'gym', 'advanced', 5),
  ('core', 'Russian_Twist', 'bodyweight', 'intermediate', 6),
  ('core', 'Side_Bridge', 'bodyweight', 'beginner', 7),
  ('core', 'Ab_Roller', 'gym', 'intermediate', 8),

  ('conditioning', 'Rowing_Stationary', 'gym', 'beginner', 1),
  ('conditioning', 'Bicycling_Stationary', 'gym', 'beginner', 2),
  ('conditioning', 'Battling_Ropes', 'gym', 'intermediate', 3),
  ('conditioning', 'Mountain_Climbers', 'bodyweight', 'beginner', 4),
  ('conditioning', 'Star_Jump', 'bodyweight', 'beginner', 5),
  ('conditioning', 'Knee_Tuck_Jump', 'bodyweight', 'intermediate', 6);
