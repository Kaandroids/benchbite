-- complete_onboarding() saves everything or nothing, checks what the app checks, and plans stay
-- private.
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- Answers and a plan for two training days, the second one with a finisher.
create function pg_temp.answers(changes jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object(
    'goal', 'lose_fat', 'consentedPolicyVersion', '2026-10-21', 'sex', 'female',
    'birthYear', extract(year from current_date)::integer - 30, 'heightCm', 168, 'weightKg', 70,
    'targetWeightKg', 64, 'weeklyPaceKg', 0.5, 'activityLevel', 'light',
    'experience', 'beginner', 'trainingDays', jsonb_build_array(1, 4), 'setup', 'gym',
    'sessionMinutes', 45, 'weightUnit', 'kg', 'heightUnit', 'cm'
  ) || changes;
$$;

create function pg_temp.plan(exercise_id text default 'Barbell_Squat') returns jsonb language sql as $$
  select jsonb_build_object('sessions', jsonb_build_array(
    jsonb_build_object('weekday', 1, 'type', 'full_body', 'estimatedMinutes', 44,
      'exercises', jsonb_build_array(
        jsonb_build_object('exerciseId', exercise_id, 'slot', 'squat', 'sets', 3,
          'target', jsonb_build_object('reps', jsonb_build_object('min', 8, 'max', 12)), 'restSeconds', 75),
        jsonb_build_object('exerciseId', 'Plank', 'slot', 'core', 'sets', 2,
          'target', jsonb_build_object('seconds', 30), 'restSeconds', 45)),
      'finisher', null),
    jsonb_build_object('weekday', 4, 'type', 'full_body', 'estimatedMinutes', 45,
      'exercises', jsonb_build_array(
        jsonb_build_object('exerciseId', 'Leg_Press', 'slot', 'squat', 'sets', 3,
          'target', jsonb_build_object('reps', jsonb_build_object('min', 8, 'max', 12)), 'restSeconds', 75)),
      'finisher', jsonb_build_object('exerciseId', 'Rowing_Stationary', 'slot', 'conditioning', 'sets', 1,
          'target', jsonb_build_object('seconds', 240), 'restSeconds', 0))
  ));
$$;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

-- Rejected answers save nothing.
select throws_ok(
  $$ select public.complete_onboarding(pg_temp.answers(jsonb_build_object('birthYear', extract(year from current_date)::integer - 17)), pg_temp.plan()) $$,
  'P0001', 'Benchbite is for people aged 18 and over',
  'Users under 18 are rejected'
);
select throws_ok(
  $$ select public.complete_onboarding(pg_temp.answers('{"consentedPolicyVersion": null}'), pg_temp.plan()) $$,
  'P0001', 'Health data consent is required',
  'Saving without consent is rejected'
);
select throws_ok(
  $$ select public.complete_onboarding(pg_temp.answers('{"trainingDays": [1, 3]}'), pg_temp.plan()) $$,
  'P0001', 'The plan does not match the training days',
  'A plan for other days is rejected'
);
select throws_ok(
  $$ select public.complete_onboarding(pg_temp.answers(), pg_temp.plan('No_Such_Exercise')) $$,
  '23503', null,
  'A plan with an unknown exercise is rejected'
);
select is_empty($$ select 1 from public.profiles $$, 'A failed save leaves no profile');
select is_empty($$ select 1 from public.weight_entries $$, 'A failed save leaves no weight');
select is_empty($$ select 1 from public.workout_plans $$, 'A failed save leaves no plan');

-- A valid save writes everything.
select lives_ok(
  $$ select public.complete_onboarding(pg_temp.answers(), pg_temp.plan()) $$,
  'Valid answers and plan are saved'
);
select isnt(
  (select onboarding_completed_at from public.profiles),
  null,
  'The onboarding is marked as completed'
);
select results_eq(
  $$ select kind::text, target_weight_kg, weekly_pace_kg from public.goals $$,
  $$ values ('lose_fat', 64.0, 0.50) $$,
  'The goal is saved with its target and pace'
);
select is((select count(*)::integer from public.health_data_consents), 1, 'The consent is saved');
select results_eq(
  $$ select s.weekday::integer, e.position::integer, e.exercise_id, e.is_finisher
     from public.plan_sessions s join public.plan_exercises e on e.session_id = s.id
     order by s.weekday, e.position $$,
  $$ values (1, 0, 'Barbell_Squat', false), (1, 1, 'Plank', false),
            (4, 0, 'Leg_Press', false), (4, 1, 'Rowing_Stationary', true) $$,
  'The plan is saved in order, with the finisher last'
);
select throws_ok(
  $$ select public.complete_onboarding(pg_temp.answers(), pg_temp.plan()) $$,
  'P0001', 'The onboarding is already completed',
  'The onboarding cannot be saved twice'
);

-- Other users see nothing and cannot add to the plan. The plan's id is taken while signed in as
-- its owner, as the other user cannot read it.
select set_config('test.plan_id', (select id::text from public.workout_plans), true);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select is_empty($$ select 1 from public.plan_sessions $$, 'Users cannot read other plans');
select throws_ok(
  format(
    $$ insert into public.plan_sessions (plan_id, user_id, weekday, type, estimated_minutes)
       values (%L, '00000000-0000-0000-0000-00000000000b', 2, 'push', 30) $$,
    current_setting('test.plan_id')
  ),
  '42501', null,
  'Users cannot add sessions to another user''s plan'
);

select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select public.complete_onboarding(pg_temp.answers(), pg_temp.plan()) $$,
  '42501', null,
  'Anon cannot save an onboarding'
);

select * from finish();
rollback;
