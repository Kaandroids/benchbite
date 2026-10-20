-- What is recorded for each set of an exercise: any combination of weight, reps, duration and
-- distance, such as weight and reps for a bench press or distance and duration for a run.
-- Records are later defined per exercise from these metrics (#36).
create type public.exercise_metric as enum ('weight', 'reps', 'duration', 'distance');

-- The import that follows sets the metrics of every exercise; the default only fills the
-- existing rows until then.
alter table public.exercises
  add column metrics public.exercise_metric[] not null default '{weight,reps}'
    check (cardinality(metrics) between 1 and 4);

alter table public.exercises alter column metrics drop default;
