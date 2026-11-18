-- Acceptance of the terms of use, which the onboarding asks for beside the consent to process
-- health data (ADR 0141). Like that consent, an entry is never changed, so the history shows
-- which version of the terms was accepted when; it is deleted with the user.
create table public.terms_acceptances (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  terms_version text not null check (length(terms_version) between 1 and 32),
  accepted_at timestamptz not null default now()
);

create index terms_acceptances_user_id_idx on public.terms_acceptances (user_id);

-- Users read their own; only complete_onboarding writes them.
alter table public.terms_acceptances enable row level security;

create policy "Users read their own terms acceptances"
  on public.terms_acceptances for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.terms_acceptances from anon, authenticated;
grant select on public.terms_acceptances to authenticated;

-- The onboarding is saved only with the terms accepted, as with the consent (BB059).
create or replace function public.complete_onboarding(answers jsonb, plan jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  insert into public.terms_acceptances (user_id, terms_version)
  values (caller_id, answers ->> 'acceptedTermsVersion');

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
$function$;
