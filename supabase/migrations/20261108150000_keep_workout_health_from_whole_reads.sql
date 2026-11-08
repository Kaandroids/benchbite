-- set_workout_health() takes ADR 0099's rule over from the app: a read counts only with a heart
-- rate a person can have, as a pair, and its calories only with it; a read without one, or with a
-- value no person can have, changes nothing. It answers whether it changed anything, so that the
-- app reloads its screens only then.
drop function public.set_workout_health(bigint, numeric, numeric, numeric, text);

-- Keeps what the phone's health store measured for one of the caller's workouts. The stores give
-- fractions, which are rounded here; the ranges are the columns' checks (20261108140000). A value
-- the read did not find keeps what was kept, and a read without a source keeps the one kept. Users
-- still cannot update their logs directly.
create function public.set_workout_health(
  log_id bigint,
  heart_rate_avg numeric default null,
  heart_rate_max numeric default null,
  active_kcal numeric default null,
  source text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  average smallint;
  highest smallint;
  kcal integer;
  named text := left(nullif(regexp_replace(set_workout_health.source, '^\s+|\s+$', '', 'g'), ''), 80);
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  -- A value no person can have is none, also one too large for its column.
  if set_workout_health.heart_rate_avg between 25 and 250 then
    average := round(set_workout_health.heart_rate_avg);
  end if;
  if set_workout_health.heart_rate_max between 25 and 250 then
    highest := round(set_workout_health.heart_rate_max);
  end if;
  if set_workout_health.active_kcal between 0 and 5000 then
    kcal := round(set_workout_health.active_kcal);
  end if;

  if not exists (
    select from public.workout_logs l
    where l.id = set_workout_health.log_id and l.user_id = caller_id
  ) then
    raise exception 'Workout log not found' using errcode = 'BB013';
  end if;
  if average is null or highest is null then
    return false;
  end if;

  update public.workout_logs l
  set heart_rate_avg = least(average, highest),
    heart_rate_max = highest,
    active_kcal = coalesce(kcal, l.active_kcal),
    health_source = coalesce(named, l.health_source)
  where l.id = set_workout_health.log_id and l.user_id = caller_id
    and (l.heart_rate_avg, l.heart_rate_max, l.active_kcal, l.health_source)
      is distinct from (least(average, highest), highest, coalesce(kcal, l.active_kcal),
        coalesce(named, l.health_source));
  return found;
end;
$$;

revoke execute on function public.set_workout_health(bigint, numeric, numeric, numeric, text)
  from public, anon;
grant execute on function public.set_workout_health(bigint, numeric, numeric, numeric, text)
  to authenticated;
