-- Bite's changes to several workouts, its new alternatives and its switches (ADR 0075): built from
-- the plan as it is, applied and undone only while it is as the proposal saw it.
begin;
create extension if not exists pgtap with schema extensions;
-- Its helpers in pg_temp are called as the signed-in user, while new functions are closed to
-- PUBLIC by default (#529): opened again for this test, which is rolled back.
alter default privileges for role postgres grant execute on functions to public;

select plan(52);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

-- On premium, so that a workout may have 5 versions (ADR 0078).
insert into public.subscriptions (user_id, plan, period_start, period_end, billing, source)
select id, 'premium', now() - interval '1 day', now() + interval '29 days', 'monthly', 'manual'
from auth.users where email like '%@example.com';

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

create temporary table ids (name text primary key, id bigint) on commit drop;
grant select, insert, update on ids to authenticated;
-- The cards the alternatives' proposers give, with their ids.
create temporary table cards (name text primary key, card jsonb) on commit drop;
grant select, insert on cards to authenticated;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
insert into ids select 'legs', public.save_workout(
  '{"name": "Legs", "weekdays": [1], "exercises": [
    {"exerciseId": "Barbell_Squat", "sets": 4, "restSeconds": 120, "target": {"reps": {"min": 6, "max": 8}}},
    {"exerciseId": "Dumbbell_Lunges", "sets": 3, "restSeconds": 90, "target": {"reps": {"min": 10, "max": 12}}},
    {"exerciseId": "Plank", "sets": 3, "restSeconds": 60, "target": {"seconds": 45}}
  ]}',
  current_date
);
insert into ids select 'push', public.save_workout(
  '{"name": "Push", "weekdays": [3], "exercises": [
    {"exerciseId": "Pushups", "sets": 3, "restSeconds": 60, "target": {"reps": {"min": 10, "max": 15}}}
  ]}',
  current_date
);
reset role;
insert into public.coach_threads (user_id) values ('00000000-0000-0000-0000-00000000000a');
insert into ids select 'thread', max(id) from public.coach_threads;

create function pg_temp.id(key text) returns bigint language sql as $$
  select coalesce(
    (select id from ids where name = key),
    (select (card ->> 'id')::bigint from cards where name = key)
  );
$$;
create function pg_temp.card(key text) returns jsonb language sql as $$
  select card - 'id' from cards where name = key;
$$;
create function pg_temp.exercises(workout text) returns text[] language sql as $$
  select array_agg(exercise_id order by position) from public.workout_exercises
  where workout_id = pg_temp.id(workout);
$$;
create function pg_temp.decide(proposal text, decision public.coach_proposal_decision)
returns public.coach_proposal_status language sql as $$
  select public.decide_coach_proposal(pg_temp.id(proposal), decision, current_date);
$$;

-- Several workouts in one proposal, with exercises swapped, removed and added.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
insert into ids select 'both', public.propose_coach_workouts(
  pg_temp.id('thread'),
  jsonb_build_array(
    jsonb_build_object(
      'workoutId', pg_temp.id('legs'),
      'swaps', '[{"replace": "Barbell_Squat", "with": "Leg_Press", "sets": 3, "target": {"reps": {"min": 10, "max": 12}}}]'::jsonb,
      'remove', '["Dumbbell_Lunges"]'::jsonb,
      'add', '[{"exerciseId": "Lying_Leg_Curls", "sets": 3, "target": {"reps": {"min": 10, "max": 12}}}]'::jsonb
    ),
    jsonb_build_object('workoutId', pg_temp.id('push'), 'remove', '[]'::jsonb,
      'add', '[{"exerciseId": "Dips_-_Triceps_Version", "sets": 3, "target": {"reps": {"min": 8, "max": 10}}}]'::jsonb)
  ),
  current_date
);
select is(
  (select kind::text from public.coach_proposals where id = pg_temp.id('both')),
  'workouts',
  'A change to several workouts is one proposal'
);
select is(
  (select jsonb_agg(e ->> 'exerciseId') from public.coach_proposals p,
    jsonb_array_elements(p.change -> 'workouts' -> 0 -> 'exercises') e where p.id = pg_temp.id('both')),
  '["Leg_Press", "Plank", "Lying_Leg_Curls"]'::jsonb,
  'Its exercises are swapped in place, removed, and added at the end'
);
select is(
  (select p.change -> 'workouts' -> 0 -> 'exercises' -> 2 -> 'restSeconds' from public.coach_proposals p
    where p.id = pg_temp.id('both')),
  '90'::jsonb,
  'with 90 s of rest for one added'
);
select is(pg_temp.exercises('legs'), array['Barbell_Squat', 'Dumbbell_Lunges', 'Plank'], 'Nothing changes before it is applied');

select is(pg_temp.decide('both', 'apply'), 'applied'::public.coach_proposal_status, 'It is applied');
select is(pg_temp.exercises('legs'), array['Leg_Press', 'Plank', 'Lying_Leg_Curls'], 'to every workout it names');
select is(pg_temp.exercises('push'), array['Pushups', 'Dips_-_Triceps_Version'], 'at once');
select is(pg_temp.decide('both', 'undo'), 'undone'::public.coach_proposal_status, 'It is undone');
select is(pg_temp.exercises('legs'), array['Barbell_Squat', 'Dumbbell_Lunges', 'Plank'], 'and every workout is as it was');

select throws_ok(
  format($$ select public.propose_coach_workouts(%s, '[{"workoutId": %s, "remove": ["Deadlift"]}]', current_date) $$,
    pg_temp.id('thread'), pg_temp.id('legs')),
  'BB039', null,
  'An exercise to remove that is not in the workout is refused'
);
select throws_ok(
  format($$ select public.propose_coach_workouts(%s, '[{"workoutId": %s, "add": [{"exerciseId": "Plank", "sets": 3, "target": {"seconds": 30}}]}]', current_date) $$,
  pg_temp.id('thread'), pg_temp.id('legs')),
  'BB040', null,
  'An exercise added that is in the workout already is refused'
);
select throws_ok(
  format($$ select public.propose_coach_workouts(%s, '[{"workoutId": %s, "remove": ["Pushups"]}]', current_date) $$,
    pg_temp.id('thread'), pg_temp.id('push')),
  'BB008', null,
  'A workout left without exercises is refused by save_workout()'
);
select throws_ok(
  format($$ select public.propose_coach_workouts(%s, '[{"workoutId": %s, "swaps": [{"replace": "Plank", "sets": 3}]}]', current_date) $$,
    pg_temp.id('thread'), pg_temp.id('legs')),
  '22023', null,
  'A swap without the exercise to put in is refused as malformed'
);
select throws_ok(
  format($$ select public.propose_coach_workouts(%s, '[{"workoutId": %s, "add": [{"sets": 3}]}]', current_date) $$,
    pg_temp.id('thread'), pg_temp.id('legs')),
  '22023', null,
  'and so is an addition without its exercise'
);
select throws_ok(
  $$ select public.propose_coach_workouts(1, '[{"workoutId": 1}, {"workoutId": 2}, {"workoutId": 3}, {"workoutId": 4}]', current_date) $$,
  '22023', null,
  'More than 3 workouts are refused before any is read'
);
select throws_ok(
  format($$ select public.propose_coach_swaps(%s, %s, '[{"replace": "Barbell_Squat", "with": "Plank", "sets": 3, "target": {"seconds": 30}}]', current_date) $$,
    pg_temp.id('thread'), pg_temp.id('legs')),
  'BB040', null,
  'A swap in one workout is checked as in several, into an exercise it has already'
);

-- A new alternative, made from the one in use and put in use.
select throws_ok(
  format($$ select public.propose_coach_alternative(%s, %s, '  ', null, '{"remove": ["Plank"]}', current_date) $$,
    pg_temp.id('thread'), pg_temp.id('legs')),
  '22023', null,
  'An alternative without a name is refused'
);
select throws_ok(
  format($$ select public.propose_coach_alternative(%s, %s, 'Home', ' home ', '{"remove": ["Plank"]}', current_date) $$,
    pg_temp.id('thread'), pg_temp.id('legs')),
  'BB049', null,
  'and one named as the one in use is to be'
);
insert into cards select 'knee', public.propose_coach_alternative(
  pg_temp.id('thread'), pg_temp.id('legs'), 'Knee-safe', 'Gym',
  '{"swaps": [{"replace": "Barbell_Squat", "with": "Leg_Press", "sets": 3, "target": {"reps": {"min": 10, "max": 12}}}], "remove": ["Dumbbell_Lunges"]}',
  current_date
);
select is(
  (select count(*)::integer from public.workout_alternatives where workout_id = pg_temp.id('legs')),
  0,
  'An alternative proposed adds nothing yet'
);
select is(
  pg_temp.card('knee'),
  '{"from": {"name": "Gym", "position": 1}}'::jsonb,
  'Its card names the version in use as applying names it, the first'
);
insert into cards select 'unnamed', public.propose_coach_alternative(
  pg_temp.id('thread'), pg_temp.id('push'), 'Hotel', null,
  '{"add": [{"exerciseId": "Dips_-_Triceps_Version", "sets": 3, "target": {"reps": {"min": 8, "max": 10}}}]}',
  current_date
);
select is(
  pg_temp.card('unnamed'),
  '{"from": {"name": null, "position": 1}}'::jsonb,
  'and without a name for it, as the first without one'
);
select is(pg_temp.decide('knee', 'apply'), 'applied'::public.coach_proposal_status, 'An alternative is applied');
select results_eq(
  format($$ select name, in_use from public.workout_alternatives where workout_id = %s order by position $$, pg_temp.id('legs')),
  $$ values ('Gym'::text, false), ('Knee-safe'::text, true) $$,
  'as a new alternative in use, the workout''s own named as Bite named it'
);
select is(pg_temp.exercises('legs'), array['Leg_Press', 'Plank'], 'The workout is the new alternative');
select throws_ok(
  format($$ select public.propose_coach_alternative(%s, %s, 'knee-safe', null, '{"remove": ["Plank"]}', current_date) $$,
    pg_temp.id('thread'), pg_temp.id('legs')),
  'BB049', null,
  'A name an alternative has already is refused'
);
select is(pg_temp.decide('knee', 'undo'), 'undone'::public.coach_proposal_status, 'An alternative is undone');
select is(
  (select count(*)::integer from public.workout_alternatives where workout_id = pg_temp.id('legs')),
  0,
  'and the workout has no alternatives again'
);
select is(pg_temp.exercises('legs'), array['Barbell_Squat', 'Dumbbell_Lunges', 'Plank'], 'and its own exercises');

-- A switch back to an alternative, once there is one.
insert into cards select 'knee2', public.propose_coach_alternative(
  pg_temp.id('thread'), pg_temp.id('legs'), 'Knee-safe', 'Gym', '{"remove": ["Dumbbell_Lunges"]}', current_date
);
select pg_temp.decide('knee2', 'apply');
insert into ids select 'gym', (
  select id from public.workout_alternatives where workout_id = pg_temp.id('legs') and name = 'Gym'
);
insert into cards select 'back', public.propose_coach_alternative_switch(pg_temp.id('thread'), pg_temp.id('gym'), current_date);
select is(
  pg_temp.card('back'),
  '{"from": {"name": "Knee-safe", "position": 2}, "to": {"name": "Gym", "position": 1}, "back": ["Dumbbell_Lunges"], "empty": false}'::jsonb,
  'A switch''s card names both alternatives and the exercises that come back'
);
select is(pg_temp.decide('back', 'apply'), 'applied'::public.coach_proposal_status, 'A switch is applied');
select is(pg_temp.exercises('legs'), array['Barbell_Squat', 'Dumbbell_Lunges', 'Plank'], 'to the alternative it names');
select throws_ok(
  format($$ select public.propose_coach_alternative_switch(%s, %s, current_date) $$, pg_temp.id('thread'), pg_temp.id('gym')),
  'BB050', null,
  'A switch to the alternative in use is refused'
);
select throws_ok(
  format($$ select public.propose_coach_change(%s, 'alternative_switch', '{"workoutId": %s, "alternativeId": %s}', current_date) $$,
    pg_temp.id('thread'), pg_temp.id('push'), pg_temp.id('gym')),
  'P0002', null,
  'A switch to an alternative of another workout is not found, however it is proposed'
);
select is(pg_temp.decide('back', 'undo'), 'undone'::public.coach_proposal_status, 'A switch is undone');
select results_eq(
  format($$ select name, in_use from public.workout_alternatives where workout_id = %s order by position $$, pg_temp.id('legs')),
  $$ values ('Gym'::text, false), ('Knee-safe'::text, true) $$,
  'and the one in use before is in use again'
);
select is(pg_temp.exercises('legs'), array['Barbell_Squat', 'Plank'], 'with its exercises');

-- Another alternative, once the workout has some.
insert into cards select 'home', public.propose_coach_alternative(
  pg_temp.id('thread'), pg_temp.id('legs'), ' Home ', 'Other', '{"remove": ["Plank"]}', current_date
);
select is(
  (select change - 'exercises' from public.coach_proposals where id = pg_temp.id('home')),
  jsonb_build_object('workoutId', pg_temp.id('legs'), 'name', 'Home'),
  'A new alternative is named trimmed, and the one in use keeps its name'
);
select is(
  pg_temp.card('home'),
  '{"from": {"name": "Knee-safe", "position": 2}}'::jsonb,
  'A version in use with a name keeps it on the card'
);
select pg_temp.decide('home', 'apply');
select results_eq(
  format($$ select name, in_use from public.workout_alternatives where workout_id = %s order by position $$, pg_temp.id('legs')),
  $$ values ('Gym'::text, false), ('Knee-safe'::text, false), ('Home'::text, true) $$,
  'It is added after the others and put in use'
);
select is(pg_temp.decide('home', 'undo'), 'undone'::public.coach_proposal_status, 'It is undone');
select results_eq(
  format($$ select name, in_use from public.workout_alternatives where workout_id = %s order by position $$, pg_temp.id('legs')),
  $$ values ('Gym'::text, false), ('Knee-safe'::text, true) $$,
  'and the others are as they were'
);
select is(pg_temp.exercises('legs'), array['Barbell_Squat', 'Plank'], 'the workout too');

-- One named for it, of a workout with alternatives whose one in use has no name.
select public.add_workout_alternative(pg_temp.id('push'), current_date, 'Bands', null, null);
insert into cards select 'dips', public.propose_coach_alternative(
  pg_temp.id('thread'), pg_temp.id('push'), 'Dips', 'Gym',
  '{"add": [{"exerciseId": "Dips_-_Triceps_Version", "sets": 3, "target": {"reps": {"min": 8, "max": 10}}}]}',
  current_date
);
select is(
  pg_temp.card('dips'),
  '{"from": {"name": "Gym", "position": 1}}'::jsonb,
  'An unnamed one in use is named on the card as Bite named it'
);
select pg_temp.decide('dips', 'apply');
select results_eq(
  format($$ select name, in_use from public.workout_alternatives where workout_id = %s order by position $$, pg_temp.id('push')),
  $$ values ('Gym'::text, false), ('Bands'::text, false), ('Dips'::text, true) $$,
  'The one in use is named as Bite named it'
);
select pg_temp.decide('dips', 'undo');
select results_eq(
  format($$ select name, in_use from public.workout_alternatives where workout_id = %s order by position $$, pg_temp.id('push')),
  $$ values (null::text, true), ('Bands'::text, false) $$,
  'and has no name again once it is undone'
);

-- A switch to an alternative without exercises says that it has none.
insert into ids select 'rest', public.add_workout_alternative(pg_temp.id('push'), current_date, 'Rest', '[]', null);
insert into cards select 'rest', public.propose_coach_alternative_switch(pg_temp.id('thread'), pg_temp.id('rest'), current_date);
select is(
  pg_temp.card('rest') -> 'empty',
  'true'::jsonb,
  'A switch to an empty alternative says so on its card'
);

-- Another user's workout or alternative is not found.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select throws_ok(
  format($$ select public.propose_coach_alternative_switch(%s, %s, current_date) $$, pg_temp.id('thread'), pg_temp.id('gym')),
  'P0002', null,
  'Another user''s alternative is not found'
);
select throws_ok(
  format($$ select public.propose_coach_alternative(%s, %s, 'Mine', null, '{"remove": ["Plank"]}', current_date) $$,
    pg_temp.id('thread'), pg_temp.id('legs')),
  'BB006', null,
  'nor another user''s workout for an alternative'
);
select throws_ok(
  format($$ select public.propose_coach_workouts(%s, '[{"workoutId": %s, "remove": ["Plank"]}]', current_date) $$,
    pg_temp.id('thread'), pg_temp.id('legs')),
  'BB006', null,
  'or for a change'
);

set local role anon;
select throws_ok(
  $$ select public.propose_coach_workouts(1, '[]', current_date) $$,
  '42501', null,
  'Signed out, nothing is proposed'
);
select throws_ok(
  $$ select public.propose_coach_alternative(1, 1, 'Home', null, '{}', current_date) $$,
  '42501', null,
  'no alternative'
);
select throws_ok(
  $$ select public.propose_coach_alternative_switch(1, 1, current_date) $$,
  '42501', null,
  'and no switch'
);

select * from finish();
rollback;
