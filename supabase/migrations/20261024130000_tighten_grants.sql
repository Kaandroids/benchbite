-- Closes what clients could reach without needing to (found in a codebase review):
--
-- 1. Consent is given only through complete_onboarding(), like the other onboarding answers since
--    20261021141554_restrict_onboarding_writes, which missed health_data_consents.
-- 2. Internal helper functions are no API endpoints. Postgres and Supabase grant execute on
--    every new function to anon and authenticated; the helpers called only from functions that
--    run as their owner lose it entirely, and the ones that row level security, constraints or
--    caller-rights functions call keep it for signed-in users only.
--    A new helper revokes execute itself, as every function here does.
-- 3. The workout log tables get the same grants as the other user tables: nothing for anon, and
--    for signed-in users only what the app does with them.
-- 4. Two indexes that the unique constraints of their tables already provide are dropped.

-- 1
drop policy "Users give their own consent" on public.health_data_consents;
revoke insert on public.health_data_consents from authenticated;

-- 2
revoke execute on function
  public.metrics_valid(public.exercise_metric[]),
  public.custom_exercise_fields(jsonb),
  public.target_suits(public.exercise_metric[], jsonb),
  public.exercise_seconds(jsonb),
  public.set_suits(public.exercise_metric[], numeric, integer, integer, integer),
  public.sets_of(jsonb)
from public, anon, authenticated;

revoke execute on function
  public.one_rep_max(numeric, integer),
  public.has_no_duplicates(smallint[]),
  public.age_in_years(integer),
  public.strength_kcal_per_minute(numeric)
from public, anon;
grant execute on function
  public.one_rep_max(numeric, integer),
  public.has_no_duplicates(smallint[]),
  public.age_in_years(integer),
  public.strength_kcal_per_minute(numeric)
to authenticated;

-- 3
revoke all on public.workout_logs, public.logged_sets, public.workout_log_summaries from anon;
revoke all on public.workout_logs, public.logged_sets, public.workout_log_summaries
  from authenticated;
grant select, delete on public.workout_logs to authenticated;
grant select on public.logged_sets, public.workout_log_summaries to authenticated;

-- 4
drop index public.logged_sets_log_id_idx;
drop index public.workout_exercises_workout_id_idx;
