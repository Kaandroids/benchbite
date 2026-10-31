-- A log keeps the alternative it was done with (ADR 0069): the name and position of the one in use
-- when it is saved, none for a workout without alternatives, and as it was after a rename or a
-- switch. workout_log_summaries shows both.
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com');

select set_config('role', 'authenticated', true),
  set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);

create temporary table ids (name text primary key, id bigint) on commit drop;

create function pg_temp.id(name text) returns bigint language sql as $$
  select i.id from ids i where i.name = $1;
$$;

-- A log of the workout with one set of squats, an hour long, ending `ago` before now.
create function pg_temp.log(workout_id bigint, ago interval) returns bigint language sql as $$
  select public.log_workout(jsonb_build_object(
    'workoutId', workout_id,
    'startedAt', now() - ago - interval '1 hour',
    'finishedAt', now() - ago,
    'startedOn', ((now() - ago - interval '1 hour') at time zone 'UTC')::date,
    'exercises', jsonb_build_array(jsonb_build_object('exerciseId', 'Barbell_Squat',
      'sets', jsonb_build_array(jsonb_build_object('weightKg', 60, 'reps', 8))))
  ));
$$;

create function pg_temp.alternative(log_id bigint) returns table (name text, "position" smallint)
language sql as $$
  select s.alternative_name, s.alternative_position from public.workout_log_summaries s
  where s.id = log_id;
$$;

insert into ids select 'legs', public.save_workout(
  '{"name": "Legs", "weekdays": [], "exercises": [
    {"exerciseId": "Barbell_Squat", "sets": 3, "restSeconds": 120, "target": {"reps": {"min": 6, "max": 8}}}
  ]}',
  current_date
);

insert into ids select 'without', pg_temp.log(pg_temp.id('legs'), interval '5 hours');
select results_eq(
  $$ select * from pg_temp.alternative(pg_temp.id('without')) $$,
  $$ values (null::text, null::smallint) $$,
  'A log of a workout without alternatives has none'
);

-- Adding one makes the workout's own exercises the first alternative, in use and unnamed.
insert into ids select 'home', public.add_workout_alternative(pg_temp.id('legs'), current_date);
insert into ids select 'unnamed', pg_temp.log(pg_temp.id('legs'), interval '4 hours');
select results_eq(
  $$ select * from pg_temp.alternative(pg_temp.id('unnamed')) $$,
  $$ values (null::text, 1::smallint) $$,
  'A log of an unnamed alternative keeps its position'
);

select public.rename_workout_alternative(
  (select a.id from public.workout_alternatives a
   where a.workout_id = pg_temp.id('legs') and a.in_use),
  'Gym'
);
insert into ids select 'gym', pg_temp.log(pg_temp.id('legs'), interval '3 hours');
select results_eq(
  $$ select * from pg_temp.alternative(pg_temp.id('gym')) $$,
  $$ values ('Gym'::text, 1::smallint) $$,
  'A log keeps the name of the alternative in use'
);

select public.rename_workout_alternative(pg_temp.id('home'), 'Home');
select public.use_workout_alternative(pg_temp.id('home'), current_date);
insert into ids select 'home log', pg_temp.log(pg_temp.id('legs'), interval '2 hours');
select results_eq(
  $$ select * from pg_temp.alternative(pg_temp.id('home log')) $$,
  $$ values ('Home'::text, 2::smallint) $$,
  'After a switch, a log keeps the alternative then in use'
);
select results_eq(
  $$ select * from pg_temp.alternative(pg_temp.id('gym')) $$,
  $$ values ('Gym'::text, 1::smallint) $$,
  'An earlier log keeps the alternative it was done with'
);

select public.rename_workout_alternative(pg_temp.id('home'), 'Hotel');
select results_eq(
  $$ select * from pg_temp.alternative(pg_temp.id('home log')) $$,
  $$ values ('Home'::text, 2::smallint) $$,
  'Renaming the alternative later leaves the log as it was'
);

-- Users cannot set it themselves: they may only read and delete their logs.
select throws_ok(
  $$ update public.workout_logs set alternative_name = 'Moon' where id = pg_temp.id('gym') $$,
  '42501', null,
  'Users cannot change the alternative of a log'
);

select * from finish();
rollback;
