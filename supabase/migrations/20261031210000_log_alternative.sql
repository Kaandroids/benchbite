-- A log keeps which alternative of its workout it was done with, so that the history can name it
-- after the workout, as "Upper body · Home" (#346, ADR 0069): its name, or its position for an
-- unnamed one, which the app shows as "Alternative N". Both are copied when the log is saved, so a
-- later rename, reorder or delete leaves the log as it was. Null for a workout without
-- alternatives and for logs saved before. The name has no length check of its own: only the trigger
-- writes it, from workout_alternatives, which checks it.
alter table public.workout_logs
  add column alternative_name text,
  add column alternative_position smallint check (alternative_position >= 1),
  add check (alternative_name is null or alternative_position is not null);

-- The alternative in use when the log is saved is the one it was done with: a workout's exercises
-- are always those of the one in use (ADR 0061). Only on insert, as an edited log keeps its own.
create function public.keep_log_alternative()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select a.name, a.position into new.alternative_name, new.alternative_position
  from public.workout_alternatives a
  where a.workout_id = new.workout_id and a.in_use;
  return new;
end;
$$;

create trigger workout_logs_keep_alternative
  before insert on public.workout_logs
  for each row execute function public.keep_log_alternative();

-- Unchanged apart from the two new columns, at the end.
create or replace view public.workout_log_summaries
with (security_invoker = true)
as
select
  l.id,
  l.workout_id,
  l.name,
  l.type,
  l.started_at,
  l.finished_at,
  s.exercises,
  l.planned_exercises,
  s.sets,
  l.planned_sets,
  s.kilograms,
  l.estimated_kcal,
  l.planned_exercise_ids,
  l.alternative_name,
  l.alternative_position
from public.workout_logs l
cross join lateral (
  select
    count(distinct t.exercise_position)::integer as exercises,
    count(*)::integer as sets,
    coalesce(sum(t.weight_kg * t.reps), 0)::numeric as kilograms
  from public.logged_sets t
  where t.log_id = l.id
) s;
