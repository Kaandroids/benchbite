-- A newer proposal for a workout replaces the ones still pending for it in the same thread (#402).
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'a@example.com');

create function pg_temp.sign_in() returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
$$;

create temporary table ids (name text primary key, id bigint) on commit drop;
grant select, insert on ids to authenticated;

select pg_temp.sign_in();
insert into ids select 'legs', public.save_workout(
  '{"name": "Legs", "weekdays": [1], "exercises": [
    {"exerciseId": "Barbell_Squat", "sets": 4, "restSeconds": 120, "target": {"reps": {"min": 6, "max": 8}}},
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
with made as (
  insert into public.coach_threads (user_id) values
    ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000a')
  returning id
)
insert into ids select unnest(array['thread', 'other']), unnest(array[min(id), max(id)]) from made;

create function pg_temp.id(key text) returns bigint language sql as $$
  select id from ids where name = key;
$$;
create function pg_temp.status(key text) returns text language sql as $$
  select status::text from public.coach_proposals where id = pg_temp.id(key);
$$;
create function pg_temp.propose(thread text, workout text, removed text) returns bigint
language sql as $$
  select public.propose_coach_workouts(
    pg_temp.id(thread),
    jsonb_build_array(jsonb_build_object('workoutId', pg_temp.id(workout), 'remove', jsonb_build_array(removed))),
    current_date
  );
$$;

select pg_temp.sign_in();
insert into ids select 'first', pg_temp.propose('thread', 'legs', 'Plank');
insert into ids select 'elsewhere', pg_temp.propose('other', 'legs', 'Plank');
insert into ids select 'second', pg_temp.propose('thread', 'legs', 'Barbell_Squat');

select is(pg_temp.status('first'), 'replaced', 'A newer proposal for the workout replaces one pending');
select is(pg_temp.status('second'), 'pending', 'and is pending itself');
select is(pg_temp.status('elsewhere'), 'pending', 'One in another thread stays');
select isnt(
  (select decided_at from public.coach_proposals where id = pg_temp.id('first')),
  null,
  'A replaced one is decided'
);
select throws_ok(
  format($$ select public.decide_coach_proposal(%s, 'apply', current_date) $$, pg_temp.id('first')),
  'BB036', null,
  'and can no longer be applied'
);

-- One for another workout, in a change of its own, leaves the others.
insert into ids select 'targets', public.propose_coach_change(
  pg_temp.id('thread'), 'targets', '{"calories": 2400, "proteinG": 150, "carbsG": 250, "fatG": 80}', current_date
);
select is(pg_temp.status('second'), 'pending', 'A proposal of another kind replaces none');

-- One for more workouts replaces those of its workouts; one for fewer leaves it.
insert into ids select 'both', public.propose_coach_workouts(
  pg_temp.id('thread'),
  jsonb_build_array(
    jsonb_build_object('workoutId', pg_temp.id('legs'), 'remove', '["Plank"]'::jsonb),
    jsonb_build_object('workoutId', pg_temp.id('push'), 'add',
      '[{"exerciseId": "Dips_-_Triceps_Version", "sets": 3, "target": {"reps": {"min": 8, "max": 10}}}]'::jsonb)
  ),
  current_date
);
select is(pg_temp.status('second'), 'replaced', 'A proposal for its workouts and more replaces one');
insert into ids select 'third', pg_temp.propose('thread', 'legs', 'Barbell_Squat');
select is(pg_temp.status('both'), 'pending', 'One for fewer workouts leaves it, so that no change is lost');
select is(pg_temp.status('third'), 'pending', 'and is pending beside it');

select * from finish();
rollback;
