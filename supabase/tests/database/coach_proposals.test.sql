-- Bite proposes; the user applies, keeps or undoes, and only to what Bite saw (ADR 0058).
begin;
create extension if not exists pgtap with schema extensions;

select plan(31);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

-- A's floor is 1,200 kcal, a woman's.
set local session_replication_role = replica;
insert into public.profiles (user_id, sex, birth_year, height_cm, activity_level, experience,
  training_days, training_setup, session_minutes, height_unit, weight_unit)
values ('00000000-0000-0000-0000-00000000000a', 'female', 1990, 165, 'sedentary', 'beginner',
  '{1}', 'gym', 45, 'cm', 'kg');
set local session_replication_role = origin;

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

create temporary table ids (name text primary key, id bigint) on commit drop;
grant select, insert on ids to authenticated;

-- The signed-in user's workout as save_workout() takes it, which users may not read this way.
create function pg_temp.workout() returns jsonb language sql security definer as $$
  select public.saved_workout((select id from ids where name = 'workout'));
$$;
grant execute on function pg_temp.workout() to authenticated;

-- That workout with squats swapped for leg presses.
create function pg_temp.swapped() returns jsonb language sql as $$
  select jsonb_set(pg_temp.workout(), '{exercises,0,exerciseId}', '"Leg_Press"');
$$;

create function pg_temp.propose(kind text, change jsonb) returns bigint language sql as $$
  select public.propose_coach_change(
    (select id from ids where name = 'thread'), kind::public.coach_proposal_kind, change, current_date
  );
$$;

create function pg_temp.decide(name text, decision text) returns text language sql as $$
  select public.decide_coach_proposal((select id from ids where ids.name = decide.name), decision, current_date)::text;
$$;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
insert into ids select 'workout', public.save_workout(
  '{"name": "Legs", "weekdays": [1], "exercises": [
    {"exerciseId": "Barbell_Squat", "sets": 4, "restSeconds": 120, "target": {"reps": {"min": 6, "max": 8}}},
    {"exerciseId": "Plank", "sets": 3, "restSeconds": 60, "target": {"seconds": 45}}
  ]}',
  current_date
);
reset role;
insert into public.coach_threads (user_id) values ('00000000-0000-0000-0000-00000000000a');
insert into ids select 'thread', max(id) from public.coach_threads;
insert into public.coach_threads (user_id) values ('00000000-0000-0000-0000-00000000000b');
insert into ids select 'b thread', max(id) from public.coach_threads;
-- B's own targets, which nothing of A's may touch.
insert into public.own_nutrition_targets (user_id, calories, protein_g, carbs_g, fat_g, in_use)
values ('00000000-0000-0000-0000-00000000000b', 2500, 160, 300, 80, true);
-- A's day today, measured against 1,800 kcal so far.
insert into public.day_nutrition_targets (user_id, day, calories, protein_g, carbs_g, fat_g)
values ('00000000-0000-0000-0000-00000000000a', current_date, 1800, 120, 200, 60);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select is(
  pg_temp.workout() -> 'exercises' -> 1,
  '{"exerciseId": "Plank", "sets": 3, "restSeconds": 60, "target": {"seconds": 45}}'::jsonb,
  'A workout reads back as save_workout() takes it'
);

-- A workout change.
insert into ids select 'swap', pg_temp.propose('workout', pg_temp.swapped());
select is(
  (select status::text from public.coach_proposals where id = (select id from ids where name = 'swap')),
  'pending',
  'A proposal waits for the user'
);
select throws_ok(
  $$ insert into public.coach_proposals (user_id, thread_id, kind, change)
     values ('00000000-0000-0000-0000-00000000000a', (select id from ids where name = 'thread'), 'workout', '{}') $$,
  '42501', null,
  'Users may not write proposals themselves'
);
select is(pg_temp.decide('swap', 'apply'), 'applied', 'The user applies it');
select is(pg_temp.workout() #>> '{exercises,0,exerciseId}', 'Leg_Press', 'and the workout changes');
select throws_ok($$ select pg_temp.decide('swap', 'apply') $$, 'BB036', null, 'A proposal applies once');
select is(pg_temp.decide('swap', 'undo'), 'undone', 'Undo puts it back');
select is(pg_temp.workout() #>> '{exercises,0,exerciseId}', 'Barbell_Squat', 'as it was');

-- A change made meanwhile is never overwritten.
insert into ids select 'stale', pg_temp.propose('workout', pg_temp.swapped());
select public.save_workout(jsonb_set(pg_temp.workout(), '{name}', '"Leg day"'), current_date);
select throws_ok(
  $$ select pg_temp.decide('stale', 'apply') $$, 'BB035', null,
  'A workout changed since the proposal is not changed by it'
);
select is(pg_temp.decide('stale', 'keep'), 'kept', 'The user keeps things as they are instead');
insert into ids select 'edited', pg_temp.propose('workout', pg_temp.swapped());
select pg_temp.decide('edited', 'apply');
select public.save_workout(jsonb_set(pg_temp.workout(), '{name}', '"Legs again"'), current_date);
select throws_ok(
  $$ select pg_temp.decide('edited', 'undo') $$, 'BB035', null,
  'nor undone over a change made after it'
);

-- A proposal must apply as it is, with the errors of the app's own checks.
select throws_ok(
  $$ select pg_temp.propose('workout', pg_temp.swapped() - 'weekdays') $$, '22023', null,
  'A workout change names its weekdays, which it would otherwise empty'
);
select throws_ok(
  $$ select pg_temp.propose('workout', jsonb_set(pg_temp.swapped(), '{exercises,0,target}', '{"seconds": 30}')) $$,
  'BB007', null,
  'and its targets suit their exercises, as save_workout() checks'
);
select throws_ok(
  $$ select pg_temp.propose('targets', '{"calories": 2000, "proteinG": 200, "carbsG": 300, "fatG": 80}') $$,
  '23514', null,
  'Targets whose macros exceed the calories are not proposed'
);
select throws_ok(
  $$ select pg_temp.propose('targets', '{"calories": 2000, "proteinG": 150}') $$, '22023', null,
  'nor targets that leave out a macro'
);
select throws_ok(
  $$ select pg_temp.propose('targets', '{"calories": 1100, "proteinG": 120, "carbsG": 90, "fatG": 35}') $$,
  'BB037', null,
  'nor targets under the calorie floor'
);
select is(
  (select count(*)::integer from public.coach_proposals where status = 'pending'),
  0,
  'and the trials leave nothing behind'
);

-- Targets, over the user's own of 2,000 kcal.
select public.save_own_nutrition_targets(
  '{"calories": 2000, "proteinG": 140, "carbsG": 200, "fatG": 70, "inUse": true}', current_date
);
insert into ids select 'targets', pg_temp.propose(
  'targets', '{"calories": 2100, "proteinG": 150, "carbsG": 210, "fatG": 70}'
);
select is(
  (select before ->> 'calories' from public.coach_proposals where id = (select id from ids where name = 'targets')),
  '2000',
  'A proposal keeps the targets it replaces'
);
select pg_temp.decide('targets', 'apply');
select results_eq(
  $$ select calories, protein_g, in_use from public.own_nutrition_targets $$,
  $$ values (2100, 150, true) $$,
  'Applied targets are the user''s own, in use'
);
select is(
  (select calories from public.day_nutrition_targets where day = current_date),
  2100,
  'and today is measured against them'
);
select pg_temp.decide('targets', 'undo');
select results_eq(
  $$ select calories from public.own_nutrition_targets $$,
  $$ values (2000) $$,
  'Undone they are as they were'
);
select is(
  (select calories from public.day_nutrition_targets where day = current_date),
  2000,
  'and so is today'
);
reset role;
select results_eq(
  $$ select calories from public.own_nutrition_targets where user_id = '00000000-0000-0000-0000-00000000000b' $$,
  $$ values (2500) $$,
  'Another user''s targets are never touched'
);

-- The floor at Apply, which may have risen since the proposal.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
insert into ids select 'low', pg_temp.propose(
  'targets', '{"calories": 1300, "proteinG": 100, "carbsG": 130, "fatG": 40}'
);
reset role;
update public.profiles set sex = 'male' where user_id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$ select pg_temp.decide('low', 'apply') $$, 'BB037', null,
  'Targets under a floor that rose since are not applied'
);

-- Out of date, and too many.
reset role;
update public.coach_proposals set expires_at = now() - interval '1 minute'
where id = (select id from ids where name = 'low');
insert into public.coach_proposals (user_id, thread_id, kind, change)
select '00000000-0000-0000-0000-00000000000a', (select id from ids where name = 'thread'), 'targets', '{}'
from generate_series(1, 20);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$ select pg_temp.decide('low', 'apply') $$, 'BB036', null,
  'A proposal a week old is not applied'
);
select throws_ok(
  $$ select pg_temp.propose('workout', pg_temp.swapped()) $$, 'BB038', null,
  'A user with 20 pending proposals is given no more'
);

-- Someone else's.
select throws_ok(
  format($$ select public.propose_coach_change(%s, 'workout', '{}', current_date) $$, (select id from ids where name = 'b thread')),
  'P0002', null,
  'Users propose only in their own threads'
);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select is_empty($$ select 1 from public.coach_proposals $$, 'and read no one else''s proposals');
select throws_ok(
  $$ select pg_temp.decide('swap', 'keep') $$, 'P0002', null,
  'nor decide them'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.propose_coach_change(bigint, public.coach_proposal_kind, jsonb, date)', 'execute')
    and not has_function_privilege('anon', 'public.decide_coach_proposal(bigint, text, date)', 'execute')
    and not has_function_privilege('anon', 'public.save_own_nutrition_targets(jsonb, date)', 'execute')
    and not has_table_privilege('anon', 'public.coach_proposals', 'select'),
  'Signed-out callers propose, decide and read nothing'
);
select ok(
  not has_function_privilege('authenticated', 'public.saved_workout(bigint)', 'execute')
    and not has_function_privilege('authenticated', 'public.coach_proposal_state(public.coach_proposal_kind, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.apply_coach_change(public.coach_proposal_kind, jsonb, date)', 'execute')
    and not has_function_privilege('authenticated', 'public.check_coach_targets(jsonb)', 'execute')
    and not has_table_privilege('authenticated', 'public.coach_proposals', 'insert, update, delete'),
  'and users change proposals and plans only through propose and decide'
);

select * from finish();
rollback;
