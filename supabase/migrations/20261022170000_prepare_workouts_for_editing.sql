-- Workouts made by hand have a name instead of the plan builder's type, and their exercises have
-- no slot. Exercises that record a distance can have a distance target, alone or with a time.

alter table public.workouts
  add column name text check (length(trim(name)) between 1 and 60),
  alter column type drop not null,
  add constraint workouts_name_or_type_check check (name is not null or type is not null);

alter table public.workout_exercises
  alter column slot drop not null,
  add column target_meters integer check (target_meters between 1 and 100000),
  drop constraint workout_exercises_check,
  add constraint workout_exercises_target_check check (
    (
      target_reps_min is not null and target_reps_max >= target_reps_min
      and target_seconds is null and target_meters is null
    )
    or (
      target_reps_min is null and target_reps_max is null
      and (target_seconds is not null or target_meters is not null)
    )
  );
