-- Withdrawing the health data consent (#652, ADR 0144): it is recorded, ends the AI consent with
-- Bite's data, deletes everything the user logged and planned, keeps the account, the proof and
-- the user's own library, leaves other users alone, and lets the onboarding be done again.
begin;
create extension if not exists pgtap with schema extensions;

select plan(23);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;
grant execute on all functions in schema pg_temp to public;

create function pg_temp.answers(changes jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object(
    'goal', 'lose_fat', 'consentedPolicyVersion', '2026-10-21', 'acceptedTermsVersion', '2026-11-18',
    'sex', 'female',
    'birthYear', extract(year from current_date)::integer - 30, 'heightCm', 168, 'weightKg', 70,
    'targetWeightKg', 64, 'weeklyPaceKg', 0.5, 'activityLevel', 'light',
    'experience', 'beginner', 'trainingDays', jsonb_build_array(1, 3, 4), 'setup', 'gym',
    'sessionMinutes', 45, 'weightUnit', 'kg', 'heightUnit', 'cm'
  ) || changes;
$$;
grant execute on all functions in schema pg_temp to public;
create function pg_temp.plan(exercise_id text default 'Barbell_Squat') returns jsonb language sql as $$
  select jsonb_build_object('sessions', jsonb_build_array(
    jsonb_build_object('weekdays', jsonb_build_array(1, 4), 'type', 'full_body', 'estimatedMinutes', 44,
      'exercises', jsonb_build_array(
        jsonb_build_object('exerciseId', exercise_id, 'slot', 'squat', 'sets', 3,
          'target', jsonb_build_object('reps', jsonb_build_object('min', 8, 'max', 12)), 'restSeconds', 75),
        jsonb_build_object('exerciseId', 'Plank', 'slot', 'core', 'sets', 2,
          'target', jsonb_build_object('seconds', 30), 'restSeconds', 45))),
    jsonb_build_object('weekdays', jsonb_build_array(3), 'type', 'lower', 'estimatedMinutes', 45,
      'exercises', jsonb_build_array(
        jsonb_build_object('exerciseId', 'Leg_Press', 'slot', 'squat', 'sets', 3,
          'target', jsonb_build_object('reps', jsonb_build_object('min', 8, 'max', 12)), 'restSeconds', 75),
        jsonb_build_object('exerciseId', 'Rowing_Stationary', 'slot', 'conditioning', 'sets', 1,
          'target', jsonb_build_object('seconds', 240), 'restSeconds', 0)))
  ));
$$;
grant execute on all functions in schema pg_temp to public;

-- The tables whose rows of a user stay after the withdrawal, as they rest on something else: the
-- account and its contract, the proof of consents, and the user's own library.
create function pg_temp.kept_tables() returns text[] language sql as $$
  select array[
    'account_deletion_codes', 'account_deletion_links', 'account_deletion_tries',
    'ai_calls_in_flight', 'ai_consent_withdrawals', 'ai_consents', 'ai_usage',
    'coach_media_deletions', 'consent_withdrawal_links', 'custom_foods', 'data_export_links',
    'data_export_runs',
    'favourite_foods', 'health_app_consent_withdrawals', 'health_app_consents',
    'health_data_consent_withdrawals', 'health_data_consents', 'password_changes', 'recipes',
    'subscriptions', 'terms_acceptances'
  ];
$$;
-- The tables with a user_id, but those kept on purpose.
create function pg_temp.user_tables() returns setof text language sql as $$
  select c.table_name::text from information_schema.columns c
  join information_schema.tables t using (table_schema, table_name)
  where c.table_schema = 'public' and c.column_name = 'user_id' and t.table_type = 'BASE TABLE'
    and c.table_name <> all (pg_temp.kept_tables())
  order by 1;
$$;
-- Every other table with a user_id that still holds a row of `owner`, so that a table added
-- later is not left out of the withdrawal unnoticed.
create function pg_temp.tables_holding(owner uuid) returns text[] language plpgsql as $$
declare
  name text;
  found boolean;
  holding text[] := '{}';
begin
  for name in select pg_temp.user_tables() loop
    execute format('select exists (select 1 from public.%I where user_id = $1)', name)
      into found using owner;
    if found then
      holding := holding || name;
    end if;
  end loop;
  return holding;
end;
$$;
-- The tables the withdrawal empties that do not refuse writes while it is withdrawn, but those
-- written during the withdrawal or holding no health data, and Bite's, which rest on the AI
-- consent that no thread is started without (ADR 0143).
create function pg_temp.tables_without_hold() returns text[] language sql as $$
  select coalesce(array_agg(n), '{}')
  from pg_temp.user_tables() n
  where n <> all (array['removed_meal_entries', 'applied_plans'])
    and n not like 'coach\_%'
    and not exists (
      select 1 from pg_trigger g
      where g.tgrelid = format('public.%I', n)::regclass
        and g.tgfoid = 'public.refuse_write_after_health_withdrawal()'::regprocedure
    );
$$;
grant execute on all functions in schema pg_temp to public;

-- Both finish the onboarding; A then logs a workout with an exercise of their own, a meal of a
-- food of their own, water and steps, and chats with Bite.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select public.complete_onboarding(pg_temp.answers(), pg_temp.plan());
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select public.complete_onboarding(pg_temp.answers(), pg_temp.plan());

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
create temp table made as select public.create_exercise(jsonb_build_object(
  'name', 'Hip thrust machine', 'metrics', jsonb_build_array('weight', 'reps'),
  'primaryMuscles', jsonb_build_array('glutes'), 'secondaryMuscles', jsonb_build_array(),
  'equipment', 'machine', 'level', 'intermediate', 'instructions', jsonb_build_array('Drive up.')
)) as id;
grant select on made to authenticated;
select public.log_workout(jsonb_build_object(
  'workoutId', (select min(id) from public.workouts),
  'startedAt', now() - interval '1 hour', 'finishedAt', now(),
  'exercises', jsonb_build_array(jsonb_build_object('exerciseId', (select id from made),
    'sets', jsonb_build_array(jsonb_build_object('weightKg', 60, 'reps', 10))))));
insert into public.custom_foods (name, kcal, protein_g, carbs_g, fat_g)
  values ('Ayran', 38, 1.7, 2.8, 2);
insert into public.favourite_foods (custom_food_id) select id from public.custom_foods;
insert into public.meal_entries (day, meal, custom_food_id, grams)
  select current_date, 'lunch', id, 200 from public.custom_foods;

reset role;
insert into public.water_days (user_id, day, ml)
  values ('00000000-0000-0000-0000-00000000000a', current_date, 500);
insert into public.step_days (user_id, day, steps)
  values ('00000000-0000-0000-0000-00000000000a', current_date, 8000);
insert into public.ai_consents (user_id, consent_version)
  values ('00000000-0000-0000-0000-00000000000a', '2026-11-18');
insert into public.coach_threads (user_id) values ('00000000-0000-0000-0000-00000000000a');
insert into public.subscriptions (user_id, plan, period_start, period_end, billing, source)
values ('00000000-0000-0000-0000-00000000000a', 'premium', now(), now() + interval '30 days',
  'monthly', 'manual');

select isnt(
  pg_temp.tables_holding('00000000-0000-0000-0000-00000000000a'), '{}'::text[],
  'Before, A''s data is in many tables'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select lives_ok(
  $$ select public.withdraw_health_consent() $$,
  'A user withdraws their health data consent'
);
select is(
  (select count(*) from public.health_data_consent_withdrawals), 1::bigint,
  'The withdrawal is recorded'
);
select throws_ok(
  $$ select public.withdraw_health_consent() $$,
  'BB062',
  null,
  'A consent cannot be withdrawn twice'
);

reset role;
select is(
  pg_temp.tables_holding('00000000-0000-0000-0000-00000000000a'), '{}'::text[],
  'Everything A logged and planned is deleted'
);
select is(
  (select count(*) from public.ai_consent_withdrawals
    where user_id = '00000000-0000-0000-0000-00000000000a'),
  1::bigint,
  'The AI consent ends with it'
);
select results_eq(
  $$ select (select count(*) from public.custom_foods
              where user_id = '00000000-0000-0000-0000-00000000000a'),
            (select count(*) from public.favourite_foods
              where user_id = '00000000-0000-0000-0000-00000000000a'),
       (select count(*) from public.exercises where owner_id = '00000000-0000-0000-0000-00000000000a') $$,
  $$ values (1::bigint, 1::bigint, 1::bigint) $$,
  'A''s own foods, favourites and exercises stay'
);
select results_eq(
  $$ select (select count(*) from public.health_data_consents
              where user_id = '00000000-0000-0000-0000-00000000000a'),
            (select count(*) from public.terms_acceptances
              where user_id = '00000000-0000-0000-0000-00000000000a') $$,
  $$ values (1::bigint, 1::bigint) $$,
  'The consent and the acceptance of the terms stay, as proof'
);
select ok(
  exists (select 1 from auth.users where id = '00000000-0000-0000-0000-00000000000a')
    and exists (select 1 from public.subscriptions
      where user_id = '00000000-0000-0000-0000-00000000000a'),
  'The account and its subscription stay'
);
select ok(
  exists (select 1 from public.profiles where user_id = '00000000-0000-0000-0000-00000000000b')
    and exists (select 1 from public.workouts where user_id = '00000000-0000-0000-0000-00000000000b'),
  'Another user''s data is untouched'
);
select is(
  (select count(*) from public.coach_media_deletions
    where user_id = '00000000-0000-0000-0000-00000000000a'),
  1::bigint,
  'The media of Bite''s chats are queued for the purge'
);

-- While it is withdrawn, nothing that rests on it is written again, as by another phone.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$ select public.import_steps(jsonb_build_array(jsonb_build_object('day', current_date, 'steps', 9000)), current_date) $$,
  'BB063', null, 'Steps are not imported after the withdrawal'
);
select throws_ok(
  $$ select public.add_water(current_date, 250) $$,
  'BB063', null, 'Water is not logged'
);
select throws_ok(
  $$ insert into public.meal_entries (day, meal, food_id, grams)
     values (current_date, 'lunch', 'C133000', 100) $$,
  'BB063', null, 'Meals are not logged'
);
select throws_ok(
  $$ insert into public.ai_consents (consent_version) values ('2026-11-18') $$,
  'BB063', null, 'and the AI consent cannot be given, so nothing goes to the model'
);

-- The subscription stays the contract: it can change, and the plans' limits are applied for all.
reset role;
select lives_ok(
  $$ update public.subscriptions set period_end = period_end + interval '1 month'
     where user_id = '00000000-0000-0000-0000-00000000000a' $$,
  'The subscription can still change'
);
select lives_ok(
  $$ select public.apply_changed_plan_limits() $$,
  'and the plans'' limits are still applied'
);

-- The onboarding can be done again, with a new consent. The withdrawal is moved back, as it would
-- be in a transaction of its own.
reset role;
update public.health_data_consent_withdrawals set withdrawn_at = now() - interval '1 minute';
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select lives_ok(
  $$ select public.complete_onboarding(pg_temp.answers(), pg_temp.plan()) $$,
  'The user can finish the onboarding again'
);
select lives_ok(
  $$ select public.add_water(current_date, 250) $$,
  'and log again'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.withdraw_health_consent()', 'execute'),
  'anon cannot withdraw a consent'
);
select ok(
  not has_function_privilege('authenticated', 'public.end_ai_consent(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.has_health_consent(uuid)', 'execute'),
  'Its helpers are closed to clients'
);

-- Every table the withdrawal deletes is held while it is withdrawn, so that a table added later
-- is not left out of either.
select is(
  array(
    select n from unnest(pg_temp.tables_without_hold()) n order by 1
  ),
  '{}'::text[],
  'Every table the withdrawal empties refuses writes while it is withdrawn'
);

-- Users who never consented, as before the onboarding, are not held.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000c');
select lives_ok(
  $$ select public.add_water(current_date, 250) $$,
  'A user before the onboarding logs as before'
);

select * from finish();
rollback;
