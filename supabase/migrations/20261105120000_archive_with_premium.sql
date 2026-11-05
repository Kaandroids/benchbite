-- The archive is premium's (#411, ADR 0082): `plans.archive` says whether a plan has it. On a plan
-- without it, nothing is moved to the archive, what is in it waits for premium, as `held`, and
-- neither it nor its alternatives count toward the limits.
-- New error code:
--   BB054  a plan without the archive cannot move a workout to it

alter table public.plans add column archive boolean not null default true;
update public.plans set archive = false where plan = 'free';
alter table public.plans alter column archive drop default;

-- Whether `workout` counts toward `limits`: on a plan with the archive, archived ones too.
create function public.counts_on_plan(workout public.workouts, limits public.plans)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (counts_on_plan.workout).active or (counts_on_plan.limits).archive;
$$;

-- How many workouts count toward `user_id`'s limit.
create function public.counted_workouts(user_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer from public.workouts w
  where w.user_id = counted_workouts.user_id
    and public.counts_on_plan(w, (select public.plan_limits(counted_workouts.user_id)));
$$;

-- As before (20261103090000), and on a plan without the archive, none of an archived workout's.
create or replace function public.added_alternative_count(user_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer from public.workout_alternatives a
  join public.workouts w on w.id = a.workout_id
  where a.user_id = added_alternative_count.user_id and a.exercises is not null
    and public.counts_on_plan(w, (select public.plan_limits(added_alternative_count.user_id)));
$$;

-- As before (20261103090000), with `archive`, whether the plan has the archive, and
-- `workouts_counted`, how many workouts count, so that the app counts them as the limit does.
drop function public.workout_limits();
create function public.workout_limits()
returns table (
  exercises integer,
  workouts integer,
  alternatives integer,
  alternative_name_length integer,
  added_alternatives integer,
  alternatives_added integer,
  archive boolean,
  workouts_counted integer
)
language sql
stable
-- Reads `plans` and plan_of(), which users may not.
security definer
set search_path = ''
as $$
  select p.exercises, p.workouts, p.versions, 12, p.added_alternatives,
    public.added_alternative_count((select auth.uid())), p.archive,
    public.counted_workouts((select auth.uid()))
  from public.plan_limits((select auth.uid())) p;
$$;

revoke execute on function public.workout_limits from public, anon;
grant execute on function public.workout_limits to authenticated;

-- As before (20261031160000), with the workouts counted as the plan counts them.
create or replace function public.save_workout(workout jsonb, today date)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  saved_id bigint := (workout ->> 'id')::bigint;
  items jsonb := coalesce(workout -> 'exercises', '[]');
  days smallint[] := array(
    select value::smallint from jsonb_array_elements_text(coalesce(workout -> 'weekdays', '[]'))
  );
  max_exercises integer;
  max_workouts integer;
  minutes smallint;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  perform public.lock_user_limits(caller_id);
  -- The days before the device's today keep the plan they had (ADR 0041), after the workout's row
  -- is locked, as in set_workout_active().
  if saved_id is not null then
    perform 1 from public.workouts w where w.id = saved_id and w.user_id = caller_id for update;
  end if;
  perform public.keep_planned_days(save_workout.today);

  select l.exercises, l.workouts into max_exercises, max_workouts from public.workout_limits() l;

  if jsonb_array_length(items) not between 1 and max_exercises then
    raise exception 'A workout needs 1 to % exercises', max_exercises using errcode = 'BB008';
  end if;
  -- Workouts from the plan builder count too, as the plan counts them.
  if saved_id is null
    and public.counted_workouts(caller_id) >= max_workouts then
    raise exception 'A user can have up to % workouts', max_workouts using errcode = 'BB009';
  end if;
  -- Unknown exercises are left to the foreign key.
  if exists (
    select 1
    from jsonb_array_elements(items) e
    join public.exercises x on x.id = e ->> 'exerciseId'
    where not public.target_suits(x.metrics, e -> 'target')
  ) then
    raise exception 'A target does not suit its exercise' using errcode = 'BB007';
  end if;

  minutes := public.workout_minutes(items);

  if saved_id is null then
    insert into public.workouts (user_id, name, weekdays, estimated_minutes)
    values (caller_id, workout ->> 'name', days, minutes)
    returning id into saved_id;
  else
    update public.workouts w
    set name = workout ->> 'name', weekdays = days, estimated_minutes = minutes
    where w.id = saved_id and w.user_id = caller_id;
    if not found then
      raise exception 'Workout not found' using errcode = 'BB006';
    end if;
    delete from public.workout_exercises where workout_id = saved_id;
  end if;

  -- A slot belongs to a plan's exercises only, so one sent with a hand-made workout is dropped.
  perform public.insert_workout_exercises(
    saved_id,
    caller_id,
    (
      select coalesce(jsonb_agg(e.value - 'slot' order by e.ordinality), '[]'::jsonb)
      from jsonb_array_elements(items) with ordinality e
    )
  );

  return saved_id;
end;
$$;

-- As before (20261028200000), with the workouts counted as the plan counts them.
create or replace function public.complete_onboarding(answers jsonb, plan jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Named apart from the tables' columns, so that queries cannot confuse the two.
  caller_id uuid := (select auth.uid());
  goal public.goal_kind := (answers ->> 'goal')::public.goal_kind;
  training_days smallint[] := array(
    select value::smallint from jsonb_array_elements_text(answers -> 'trainingDays')
  );
  session jsonb;
  new_workout_id bigint;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.profiles p
    where p.user_id = caller_id and p.onboarding_completed_at is not null
  ) then
    raise exception 'The onboarding is already completed' using errcode = 'BB001';
  end if;

  -- The app checks these too; the server must not rely on it. The minimum age is checked by the
  -- profiles table.
  if coalesce(answers ->> 'consentedPolicyVersion', '') = '' then
    raise exception 'Health data consent is required' using errcode = 'BB003';
  end if;
  -- Every training day is in exactly one session.
  if (
    select array_agg(d.value::smallint order by d.value::smallint)
    from jsonb_array_elements(plan -> 'sessions') s,
      jsonb_array_elements_text(s -> 'weekdays') d
  ) is distinct from (select array_agg(d order by d) from unnest(training_days) d) then
    raise exception 'The plan does not match the training days' using errcode = 'BB004';
  end if;
  perform public.lock_user_limits(caller_id);
  -- Workouts a guest saved before finishing the onboarding count too.
  if jsonb_array_length(plan -> 'sessions')
    + public.counted_workouts(caller_id)
    > (select l.workouts from public.workout_limits() l) then
    raise exception 'A user can have up to % workouts', (select l.workouts from public.workout_limits() l)
      using errcode = 'BB009';
  end if;
  -- A plan's workouts stay shorter than the 20 exercises a user may build: the plan builder fills
  -- at most 12 (PLAN_WORKOUT_EXERCISES), and never leaves one empty.
  if exists (
    select 1 from jsonb_array_elements(plan -> 'sessions') s
    where coalesce(jsonb_array_length(s -> 'exercises'), 0) not between 1 and 12
  ) then
    raise exception 'A session needs 1 to 12 exercises' using errcode = 'BB005';
  end if;
  -- Each target suits what its exercise records, as save_workout() checks; a workout would
  -- otherwise start with sets that its log refuses. Unknown exercises are left to the foreign key.
  if exists (
    select 1
    from jsonb_array_elements(plan -> 'sessions') s,
      jsonb_array_elements(s -> 'exercises') e
    join public.exercises x on x.id = e.value ->> 'exerciseId'
    where not public.target_suits(x.metrics, e.value -> 'target')
  ) then
    raise exception 'A target does not suit its exercise' using errcode = 'BB007';
  end if;

  insert into public.profiles (
    user_id, sex, birth_year, height_cm, weight_unit, height_unit, activity_level, experience,
    training_setup, training_days, session_minutes, display_name, onboarding_completed_at
  )
  values (
    caller_id,
    (answers ->> 'sex')::public.sex,
    (answers ->> 'birthYear')::integer,
    (answers ->> 'heightCm')::numeric,
    (answers ->> 'weightUnit')::public.weight_unit,
    (answers ->> 'heightUnit')::public.height_unit,
    (answers ->> 'activityLevel')::public.activity_level,
    (answers ->> 'experience')::public.experience,
    (answers ->> 'setup')::public.training_setup,
    training_days,
    (answers ->> 'sessionMinutes')::smallint,
    -- Optional: a skipped or blank name is no name. The table checks the rest.
    nullif(btrim(answers ->> 'displayName'), ''),
    now()
  );

  -- The plan starts on the device's today, sent with the answers (ADR 0041), before any
  -- workout of it is saved. Without one, or with a device clock more than a day off, it starts on
  -- the server's, so that the onboarding can always be finished.
  perform public.start_user_plan(caller_id, public.device_today_or_server(answers ->> 'today'));

  -- Only goals that change the weight keep a target weight and a pace.
  insert into public.goals (user_id, kind, target_weight_kg, weekly_pace_kg)
  values (
    caller_id,
    goal,
    case when goal in ('lose_fat', 'build_muscle') then (answers ->> 'targetWeightKg')::numeric end,
    case when goal in ('lose_fat', 'build_muscle') then (answers ->> 'weeklyPaceKg')::numeric end
  );

  insert into public.weight_entries (user_id, weight_kg)
  values (caller_id, (answers ->> 'weightKg')::numeric);

  insert into public.health_data_consents (user_id, policy_version)
  values (caller_id, answers ->> 'consentedPolicyVersion');

  for session in select value from jsonb_array_elements(plan -> 'sessions') loop
    insert into public.workouts (user_id, weekdays, type, estimated_minutes)
    values (
      caller_id,
      array(select value::smallint from jsonb_array_elements_text(session -> 'weekdays')),
      (session ->> 'type')::public.workout_type,
      (session ->> 'estimatedMinutes')::smallint
    )
    returning id into new_workout_id;

    -- The exercises in order; conditioning for fat loss is the last of them.
    perform public.insert_workout_exercises(new_workout_id, caller_id, session -> 'exercises');
  end loop;
end;
$$;

-- As before (20261103090000), and a plan without the archive moves nothing to it (BB054). Bringing
-- one back is refused as it waits (BB051).
create or replace function public.set_workout_active(workout_id bigint, active boolean, today date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform public.lock_user_limits((select auth.uid()));
  -- The workout's row before the plan's lock, so that two changes never wait on each other.
  perform 1 from public.workouts w
  where w.id = set_workout_active.workout_id and w.user_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'Workout not found' using errcode = 'BB006';
  end if;
  if not set_workout_active.active
    and not (select p.archive from public.plan_limits((select auth.uid())) p) then
    raise exception 'The archive comes with premium' using errcode = 'BB054';
  end if;
  perform public.keep_planned_days(set_workout_active.today);
  update public.workouts w
  set active = set_workout_active.active
  where w.id = set_workout_active.workout_id;
end;
$$;

-- As before (20261103090000), and on a plan without the archive, archived workouts wait whatever
-- else fits, and only active ones count and are ranked.
create or replace function public.apply_workout_limits(owner uuid, limits public.plans)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not limits.archive then
    update public.workouts w set held = true
    where w.user_id = apply_workout_limits.owner and not w.active and not w.held;
  end if;

  if public.counted_workouts(apply_workout_limits.owner) <= limits.workouts then
    update public.workouts w set held = false
    where w.user_id = apply_workout_limits.owner and w.held and public.counts_on_plan(w, limits);
  elsif (
    select count(*) from public.workouts w
    where w.user_id = apply_workout_limits.owner and not w.held
  ) > limits.workouts then
    update public.workouts w set held = true
    where w.id in (
      select u.id from public.workouts u
      where u.user_id = apply_workout_limits.owner and not u.held
      order by
        u.active desc,
        (select max(l.started_on) from public.workout_logs l where l.workout_id = u.id)
          desc nulls last,
        u.id desc
      offset limits.workouts
    );
  end if;
end;
$$;

-- As before (20261103090000), and the versions of an archived workout on a plan without the archive
-- keep nothing else waiting, as it waits with its alternatives.
create or replace function public.apply_alternative_limits(owner uuid, limits public.plans)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.workout_alternatives a set held = true
  from public.workouts w
  where w.id = a.workout_id and w.held and a.user_id = apply_alternative_limits.owner
    and a.exercises is not null and not a.held;

  if not exists (
    select 1 from public.workout_alternatives a
    join public.workouts w on w.id = a.workout_id
    where a.user_id = apply_alternative_limits.owner and public.counts_on_plan(w, limits)
    group by a.workout_id
    having count(*) > limits.versions
  ) and (
    limits.added_alternatives is null
    or public.added_alternative_count(apply_alternative_limits.owner) <= limits.added_alternatives
  ) then
    update public.workout_alternatives a set held = false
    from public.workouts w
    where w.id = a.workout_id and not w.held and a.user_id = apply_alternative_limits.owner
      and a.held;
  else
    with usable as (
      -- The alternatives that may stay: not in use, not waiting, of a workout that does not wait.
      select a.id, a.workout_id, a.last_used_at
      from public.workout_alternatives a
      join public.workouts w on w.id = a.workout_id and not w.held
      where a.user_id = apply_alternative_limits.owner and a.exercises is not null and not a.held
    ), ranked_in_workout as (
      -- Each workout's, last in use first; the one in use is a version too.
      select u.*, row_number() over (
        partition by u.workout_id order by u.last_used_at desc nulls last, u.id desc
      ) as place
      from usable u
    ), kept as (
      -- The ones a workout may have, then the ones a user may add in all, last in use first.
      select o.id
      from (
        select r.id,
          row_number() over (order by r.last_used_at desc nulls last, r.id desc) as overall
        from ranked_in_workout r
        where r.place < limits.versions
      ) o
      where limits.added_alternatives is null or o.overall <= limits.added_alternatives
    )
    update public.workout_alternatives a set held = true
    where a.id in (select u.id from usable u) and a.id not in (select k.id from kept k);
  end if;
end;
$$;

revoke execute on function public.counts_on_plan(public.workouts, public.plans),
  public.counted_workouts(uuid)
  from public, anon, authenticated;

-- On the free plan, what is in the archive waits from now on.
select public.apply_plan_limits(u.id) from auth.users u;
