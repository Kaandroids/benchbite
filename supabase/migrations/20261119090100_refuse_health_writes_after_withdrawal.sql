-- Nothing that rests on the health data consent is written while it is withdrawn (#652, ADR 0144).
-- Withdrawing it deletes what is there; without this, another phone of the user, or an import
-- running at that moment, would write their health data again, and an AI consent given afterwards
-- would send it to the model. Users who never consented, as guests before the onboarding, are not
-- held: only a withdrawal with no consent after it refuses a write (BB063).

-- Holds the user's health data consent still until the transaction ends.
create function public.lock_health_consent(user_id uuid)
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('health_consent ' || lock_health_consent.user_id::text, 0));
$$;

revoke execute on function public.lock_health_consent(uuid) from public, anon, authenticated;

-- Whether the user withdrew their health data consent and has not given it again.
create function public.health_consent_withdrawn(user_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.health_data_consent_withdrawals w
    where w.user_id = health_consent_withdrawn.user_id
  ) and not public.has_health_consent(health_consent_withdrawn.user_id);
$$;

revoke execute on function public.health_consent_withdrawn(uuid) from public, anon, authenticated;

-- Refuses a row of a user whose health data consent is withdrawn. Volatile, so that the consent is
-- read after the lock, with what a withdrawal has committed.
create function public.refuse_write_after_health_withdrawal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.lock_health_consent(new.user_id);
  if public.health_consent_withdrawn(new.user_id) then
    raise exception 'The health data consent is withdrawn' using errcode = 'BB063';
  end if;
  return new;
end;
$$;

revoke execute on function public.refuse_write_after_health_withdrawal()
  from public, anon, authenticated;

-- The tables whose rows rest on the consent, and the AI consent, which sends that data to the model.
-- Left out: removed_meal_entries, which deleting the meals writes during the withdrawal, and
-- applied_plans, the plan's limits, which the subscription keeps writing and hold no health data.
create trigger profiles_need_health_consent
  before insert on public.profiles
  for each row execute function public.refuse_write_after_health_withdrawal();

create trigger goals_need_health_consent
  before insert on public.goals
  for each row execute function public.refuse_write_after_health_withdrawal();

create trigger weight_entries_need_health_consent
  before insert on public.weight_entries
  for each row execute function public.refuse_write_after_health_withdrawal();

create trigger meal_entries_need_health_consent
  before insert on public.meal_entries
  for each row execute function public.refuse_write_after_health_withdrawal();

create trigger water_days_need_health_consent
  before insert on public.water_days
  for each row execute function public.refuse_write_after_health_withdrawal();

create trigger step_days_need_health_consent
  before insert on public.step_days
  for each row execute function public.refuse_write_after_health_withdrawal();

create trigger workout_logs_need_health_consent
  before insert on public.workout_logs
  for each row execute function public.refuse_write_after_health_withdrawal();

create trigger logged_sets_need_health_consent
  before insert on public.logged_sets
  for each row execute function public.refuse_write_after_health_withdrawal();

create trigger outside_workouts_need_health_consent
  before insert on public.outside_workouts
  for each row execute function public.refuse_write_after_health_withdrawal();

create trigger workouts_need_health_consent
  before insert on public.workouts
  for each row execute function public.refuse_write_after_health_withdrawal();

create trigger workout_exercises_need_health_consent
  before insert on public.workout_exercises
  for each row execute function public.refuse_write_after_health_withdrawal();

create trigger workout_alternatives_need_health_consent
  before insert on public.workout_alternatives
  for each row execute function public.refuse_write_after_health_withdrawal();

create trigger workout_moves_need_health_consent
  before insert on public.workout_moves
  for each row execute function public.refuse_write_after_health_withdrawal();

create trigger planned_days_need_health_consent
  before insert on public.planned_days
  for each row execute function public.refuse_write_after_health_withdrawal();

create trigger planned_days_kept_need_health_consent
  before insert on public.planned_days_kept
  for each row execute function public.refuse_write_after_health_withdrawal();


create trigger day_nutrition_targets_need_health_consent
  before insert on public.day_nutrition_targets
  for each row execute function public.refuse_write_after_health_withdrawal();

create trigger own_nutrition_targets_need_health_consent
  before insert on public.own_nutrition_targets
  for each row execute function public.refuse_write_after_health_withdrawal();

create trigger streak_days_need_health_consent
  before insert on public.streak_days
  for each row execute function public.refuse_write_after_health_withdrawal();

create trigger user_streaks_need_health_consent
  before insert on public.user_streaks
  for each row execute function public.refuse_write_after_health_withdrawal();

create trigger ai_consents_need_health_consent
  before insert on public.ai_consents
  for each row execute function public.refuse_write_after_health_withdrawal();

-- As before, and no AI consent counts while the health data consent is withdrawn.
create or replace function public.has_ai_consent(user_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select not public.health_consent_withdrawn(has_ai_consent.user_id) and exists (
    select 1 from public.ai_consents c
    where c.user_id = has_ai_consent.user_id
      and c.granted_at > coalesce(
        (select max(w.withdrawn_at) from public.ai_consent_withdrawals w
          where w.user_id = has_ai_consent.user_id),
        '-infinity'
      )
  );
$$;

-- As before, holding the consent while it withdraws it, and recording the withdrawal last.
create or replace function public.withdraw_health_consent()
returns void
language plpgsql
-- Deletes rows the user may not delete themselves, and writes the withdrawals.
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  -- After a write being made now, which this then deletes, or before it, which is then refused.
  perform public.lock_health_consent(caller_id);
  if not public.has_health_consent(caller_id) then
    raise exception 'There is no health data consent to withdraw' using errcode = 'BB062';
  end if;

  perform public.end_ai_consent(caller_id);

  delete from public.meal_entries where user_id = caller_id;
  -- After the meals, whose delete records them here.
  delete from public.removed_meal_entries where user_id = caller_id;
  delete from public.water_days where user_id = caller_id;
  delete from public.step_days where user_id = caller_id;

  delete from public.workout_logs where user_id = caller_id;
  delete from public.outside_workouts where user_id = caller_id;
  delete from public.workout_moves where user_id = caller_id;
  delete from public.workouts where user_id = caller_id;
  delete from public.planned_days_kept where user_id = caller_id;
  delete from public.planned_days where user_id = caller_id;
  delete from public.applied_plans where user_id = caller_id;

  delete from public.day_nutrition_targets where user_id = caller_id;
  delete from public.own_nutrition_targets where user_id = caller_id;
  delete from public.streak_days where user_id = caller_id;
  delete from public.user_streaks where user_id = caller_id;
  delete from public.weight_entries where user_id = caller_id;
  delete from public.goals where user_id = caller_id;
  delete from public.profiles where user_id = caller_id;

  -- Last, as deleting workouts writes their planned days, which the withdrawal would refuse.
  insert into public.health_data_consent_withdrawals (user_id) values (caller_id);
end;
$$;

-- As before, with the consent saved first.
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
  if coalesce(answers ->> 'acceptedTermsVersion', '') = '' then
    raise exception 'The terms of use must be accepted' using errcode = 'BB059';
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

  -- The consent first, as a user who withdrew it may write their data again only after it (BB063).
  insert into public.health_data_consents (user_id, policy_version)
  values (caller_id, answers ->> 'consentedPolicyVersion');

  insert into public.terms_acceptances (user_id, terms_version)
  values (caller_id, answers ->> 'acceptedTermsVersion');

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
