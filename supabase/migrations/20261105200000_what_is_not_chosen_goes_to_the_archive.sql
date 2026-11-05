-- What a user does not choose goes to the archive (#411, ADR 0084), where a plan without it holds
-- it to look at, rather than waiting among the active workouts.

-- As before (20261105150000), and the active workouts not chosen are archived.
create or replace function public.choose_what_stays(workouts bigint[], alternatives bigint[], today date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  limits public.plans;
  kept bigint[] := coalesce(choose_what_stays.workouts, '{}');
  kept_alternatives bigint[] := coalesce(choose_what_stays.alternatives, '{}');
  active_count integer;
  allowed_alternatives integer;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform public.lock_user_limits(caller_id);
  limits := public.plan_limits(caller_id);
  if not coalesce(
    (select a.choice_open from public.applied_plans a where a.user_id = caller_id),
    false
  ) then
    raise exception 'There is no choice to make' using errcode = 'BB055';
  end if;
  -- The rows before the plan's lock, as set_workout_active() takes them.
  perform 1 from public.workouts w where w.user_id = caller_id order by w.id for update;

  select count(*)::integer into active_count from public.workouts w
  where w.user_id = caller_id and w.active;
  if cardinality(kept) <> least(active_count, limits.workouts)
    or (select count(distinct k) from unnest(kept) k) <> cardinality(kept)
    or exists (
      select 1 from unnest(kept) k
      where not exists (
        select 1 from public.workouts w
        where w.id = k and w.user_id = caller_id and w.active
      )
    ) then
    raise exception 'The workouts do not fit the plan' using errcode = 'BB056';
  end if;

  -- As many as the kept workouts could keep: each up to its versions, then up to the plan's total.
  select coalesce(sum(least(c.added, limits.versions - 1)), 0)::integer into allowed_alternatives
  from (
    select count(*) as added from public.workout_alternatives a
    where a.user_id = caller_id and a.workout_id = any (kept) and a.exercises is not null
    group by a.workout_id
  ) c;
  if cardinality(kept_alternatives)
      <> least(allowed_alternatives, coalesce(limits.added_alternatives, allowed_alternatives))
    or (select count(distinct k) from unnest(kept_alternatives) k) <> cardinality(kept_alternatives)
    or exists (
      select 1 from unnest(kept_alternatives) k
      where not exists (
        select 1 from public.workout_alternatives a
        where a.id = k and a.user_id = caller_id and a.workout_id = any (kept)
          and a.exercises is not null
      )
    )
    or exists (
      select 1 from public.workout_alternatives a
      where a.id = any (kept_alternatives)
      group by a.workout_id
      having count(*) >= limits.versions
    ) then
    raise exception 'The alternatives do not fit the plan' using errcode = 'BB056';
  end if;

  perform public.keep_planned_days(choose_what_stays.today);
  -- They stop waiting first, as what waits cannot change (BB051), and the plan holds what it must.
  update public.workouts w set held = false where w.user_id = caller_id and w.active and w.held;
  update public.workouts w set active = false
  where w.user_id = caller_id and w.active and not (w.id = any (kept));
  perform public.apply_workout_limits(caller_id, limits);
  perform public.apply_alternative_limits(caller_id, limits);
  update public.workout_alternatives a set held = not (a.id = any (kept_alternatives))
  from public.workouts w
  where w.id = a.workout_id and w.user_id = caller_id and w.active and a.exercises is not null
    and a.held is distinct from not (a.id = any (kept_alternatives));
  update public.applied_plans a set choice_open = false where a.user_id = caller_id;
end;
$$;

-- Those who have chosen already: what waits among their active workouts goes the same way.
do $$
declare
  owner uuid;
begin
  for owner in
    select distinct w.user_id from public.workouts w
    join public.applied_plans a on a.user_id = w.user_id
    where w.active and w.held and not a.choice_open
  loop
    update public.workouts w set held = false, active = false
    where w.user_id = owner and w.active and w.held;
    perform public.apply_plan_limits(owner);
  end loop;
end;
$$;
