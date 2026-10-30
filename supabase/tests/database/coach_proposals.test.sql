-- Bite proposes; the user applies, keeps or undoes, and only to what Bite saw (ADR 0058).
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

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
grant select, insert, update on ids to authenticated;

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

-- The workout as save_workout() takes it, with squats swapped for leg presses.
create function pg_temp.swapped() returns jsonb language sql as $$
  select jsonb_set(
    public.saved_workout((select id from ids where name = 'workout')),
    '{exercises,0,exerciseId}', '"Leg_Press"'
  );
$$;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select is(
  public.saved_workout((select id from ids where name = 'workout')) -> 'exercises' -> 1,
  '{"exerciseId": "Plank", "sets": 3, "restSeconds": 60, "target": {"seconds": 45}}'::jsonb,
  'A workout reads back as save_workout() takes it'
);

-- A workout change.
insert into ids select 'swap', public.propose_coach_change(
  (select id from ids where name = 'thread'), 'workout', pg_temp.swapped()
);
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
select is(
  public.decide_coach_proposal((select id from ids where name = 'swap'), 'apply', current_date)::text,
  'applied',
  'The user applies it'
);
select is(
  public.saved_workout((select id from ids where name = 'workout')) #>> '{exercises,0,exerciseId}',
  'Leg_Press',
  'and the workout changes'
);
select throws_ok(
  format($$ select public.decide_coach_proposal(%s, 'apply', current_date) $$, (select id from ids where name = 'swap')),
  'BB036', null,
  'A proposal applies once'
);
select is(
  public.decide_coach_proposal((select id from ids where name = 'swap'), 'undo', current_date)::text,
  'undone',
  'Undo puts it back'
);
select is(
  public.saved_workout((select id from ids where name = 'workout')) #>> '{exercises,0,exerciseId}',
  'Barbell_Squat',
  'as it was'
);

-- A change made meanwhile is never overwritten.
insert into ids select 'stale', public.propose_coach_change(
  (select id from ids where name = 'thread'), 'workout', pg_temp.swapped()
);
select public.save_workout(
  jsonb_set(public.saved_workout((select id from ids where name = 'workout')), '{name}', '"Leg day"'),
  current_date
);
select throws_ok(
  format($$ select public.decide_coach_proposal(%s, 'apply', current_date) $$, (select id from ids where name = 'stale')),
  'BB035', null,
  'A workout changed since the proposal is not changed by it'
);
select is(
  public.decide_coach_proposal((select id from ids where name = 'stale'), 'keep', current_date)::text,
  'kept',
  'The user keeps things as they are instead'
);

insert into ids select 'edited', public.propose_coach_change(
  (select id from ids where name = 'thread'), 'workout', pg_temp.swapped()
);
select public.decide_coach_proposal((select id from ids where name = 'edited'), 'apply', current_date);
select public.save_workout(
  jsonb_set(public.saved_workout((select id from ids where name = 'workout')), '{name}', '"Legs again"'),
  current_date
);
select throws_ok(
  format($$ select public.decide_coach_proposal(%s, 'undo', current_date) $$, (select id from ids where name = 'edited')),
  'BB035', null,
  'nor undone over a change made after it'
);

-- Targets.
select throws_ok(
  format(
    $$ select public.propose_coach_change(%s, 'targets', '{"calories": 1100, "proteinG": 120, "carbsG": 90, "fatG": 35}') $$,
    (select id from ids where name = 'thread')
  ),
  'BB037', null,
  'Targets under the calorie floor are not proposed'
);
insert into ids select 'targets', public.propose_coach_change(
  (select id from ids where name = 'thread'),
  'targets',
  '{"calories": 2100, "proteinG": 150, "carbsG": 210, "fatG": 70}'
);
select is(
  (select before from public.coach_proposals where id = (select id from ids where name = 'targets')),
  null,
  'A user without own targets had none before'
);
select public.decide_coach_proposal((select id from ids where name = 'targets'), 'apply', current_date);
select results_eq(
  $$ select calories, protein_g, in_use from public.own_nutrition_targets $$,
  $$ values (2100, 150, true) $$,
  'Applied targets are the user''s own, in use'
);
select public.decide_coach_proposal((select id from ids where name = 'targets'), 'undo', current_date);
select is_empty(
  $$ select 1 from public.own_nutrition_targets $$,
  'and undone they are gone again'
);

-- Someone else's.
select throws_ok(
  format($$ select public.propose_coach_change(%s, 'workout', pg_temp.swapped()) $$, (select id from ids where name = 'b thread')),
  'P0002', null,
  'Users propose only in their own threads'
);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select throws_ok(
  format($$ select public.propose_coach_change(%s, 'workout', '{"id": %s, "name": "Mine"}') $$,
    (select id from ids where name = 'b thread'), (select id from ids where name = 'workout')),
  'BB006', null,
  'and only on their own workouts'
);
select is_empty(
  $$ select 1 from public.coach_proposals $$,
  'Users read no one else''s proposals'
);
select throws_ok(
  format($$ select public.decide_coach_proposal(%s, 'keep', current_date) $$, (select id from ids where name = 'swap')),
  'P0002', null,
  'nor decide them'
);
select is(
  public.saved_workout((select id from ids where name = 'workout')),
  null,
  'nor read their workouts'
);

-- Out of date.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
insert into ids select 'old', public.propose_coach_change(
  (select id from ids where name = 'thread'),
  'targets',
  '{"calories": 2000, "proteinG": 140, "carbsG": 200, "fatG": 65}'
);
reset role;
update public.coach_proposals set expires_at = now() - interval '1 minute'
where id = (select id from ids where name = 'old');
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  format($$ select public.decide_coach_proposal(%s, 'apply', current_date) $$, (select id from ids where name = 'old')),
  'BB036', null,
  'A proposal a week old is not applied'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.decide_coach_proposal(bigint, text, date)', 'execute')
    and not has_function_privilege('authenticated', 'public.set_own_targets(jsonb)', 'execute'),
  'Signed-out callers decide nothing, and no one sets targets past the proposals'
);

select * from finish();
rollback;
