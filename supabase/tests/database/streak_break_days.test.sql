-- streak_break_days() says what each missed day of a break missed: its workouts that did not keep
-- it, with the name and type its day shows, the calories eaten and its target (#278). Only the
-- caller's own, and only the week before the device's today, which a break holds (ADR 0045).
begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- Within the week before today: day x and the next day y, in the same week, so that a workout
-- can move from x to y, and two more days, whatever day the tests run on.
create function pg_temp.x() returns date language sql as $$
  select min(d)::date from generate_series(current_date - 7, current_date - 2, interval '1 day') d
  where date_trunc('week', d) = date_trunc('week', d + interval '1 day');
$$;
create function pg_temp.y() returns date language sql as $$ select pg_temp.x() + 1; $$;
create function pg_temp.other(n integer) returns date language sql as $$
  select d::date from generate_series(current_date - 7, current_date - 1, interval '1 day') d
  where d::date not in (pg_temp.x(), pg_temp.y())
  order by d offset n - 1 limit 1;
$$;

create function pg_temp.workout(id bigint, name text, type public.workout_type, skipped boolean)
returns public.break_workout language sql as $$
  select row(id, name, type, skipped)::public.break_workout;
$$;

set local session_replication_role = replica;

-- User a: from a week ago, every day kept as planned, a target of 2,000 kcal.
insert into public.planned_days_kept (user_id, through, started_on)
  values ('00000000-0000-0000-0000-00000000000a', current_date - 1, current_date - 7);
insert into public.own_nutrition_targets (user_id, calories, protein_g, carbs_g, fat_g)
  values ('00000000-0000-0000-0000-00000000000a', 2000, 100, 250, 60);
insert into public.workouts (id, user_id, name, type, weekdays, active, estimated_minutes)
  overriding system value values
  (930, '00000000-0000-0000-0000-00000000000a', 'Legs', null, '{}', true, 45),
  (931, '00000000-0000-0000-0000-00000000000a', null, 'push', '{}', true, 45),
  (932, '00000000-0000-0000-0000-00000000000a', 'Core', null, '{}', true, 30);
-- Day x: Legs not done, Push skipped, Core moved to y, eaten to the target. Day y: Core missed.
-- The first other day: nothing eaten. The second: over the target.
insert into public.planned_days (user_id, day, workout_id, name, type) values
  ('00000000-0000-0000-0000-00000000000a', pg_temp.x(), 930, 'Legs', null),
  ('00000000-0000-0000-0000-00000000000a', pg_temp.x(), 931, null, 'push'),
  ('00000000-0000-0000-0000-00000000000a', pg_temp.x(), 932, 'Core', null);
insert into public.workout_moves (user_id, workout_id, from_on, to_on) values
  ('00000000-0000-0000-0000-00000000000a', 931, pg_temp.x(), null),
  ('00000000-0000-0000-0000-00000000000a', 932, pg_temp.x(), pg_temp.y());

create function pg_temp.eat(owner uuid, on_day date, kcal integer) returns void language sql as $$
  insert into public.meal_entries (user_id, day, meal, food_id, grams, kcal_per_100g)
  values (owner, on_day, 'lunch', (select id from public.foods order by id limit 1), kcal, 100);
$$;
select pg_temp.eat('00000000-0000-0000-0000-00000000000a', pg_temp.x(), 1500);
select pg_temp.eat('00000000-0000-0000-0000-00000000000a', pg_temp.y(), 1500);
select pg_temp.eat('00000000-0000-0000-0000-00000000000a', pg_temp.other(2), 2400);

-- User b: from a week ago, with a workout and meals of their own on day x.
insert into public.planned_days_kept (user_id, through, started_on)
  values ('00000000-0000-0000-0000-00000000000b', current_date - 1, current_date - 7);
insert into public.workouts (id, user_id, name, type, weekdays, active, estimated_minutes)
  overriding system value
  values (940, '00000000-0000-0000-0000-00000000000b', 'Arms', null, '{}', true, 30);
insert into public.planned_days (user_id, day, workout_id, name, type)
  values ('00000000-0000-0000-0000-00000000000b', pg_temp.x(), 940, 'Arms', null);
select pg_temp.eat('00000000-0000-0000-0000-00000000000b', pg_temp.x(), 700);

set local session_replication_role = origin;

-- The days of a's break, as streak() would list them.
create function pg_temp.days() returns date[] language sql as $$
  select array[pg_temp.x(), pg_temp.y(), pg_temp.other(1), pg_temp.other(2)];
$$;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select results_eq(
  $$ select day from public.streak_break_days(pg_temp.days(), current_date) $$,
  $$ select d from unnest(pg_temp.days()) d order by d $$,
  'Each day asked about is given, in order'
);
select is(
  (select workouts from public.streak_break_days(pg_temp.days(), current_date) where day = pg_temp.x()),
  array[pg_temp.workout(930, 'Legs', null, false), pg_temp.workout(931, null, 'push', true)],
  'A day lists its workouts not done, and those skipped, but not those moved away'
);
select results_eq(
  $$ select eaten, target from public.streak_break_days(pg_temp.days(), current_date)
     where day = pg_temp.x() $$,
  $$ values (1500.0::numeric, 2000) $$,
  'A day gives the calories eaten and its target'
);
select results_eq(
  $$ select workouts, eaten from public.streak_break_days(pg_temp.days(), current_date)
     where day = pg_temp.other(1) $$,
  $$ values ('{}'::public.break_workout[], 0::numeric) $$,
  'A day without meals has eaten none'
);
select is(
  (select eaten - target from public.streak_break_days(pg_temp.days(), current_date)
   where day = pg_temp.other(2)),
  400::numeric,
  'A day over its target gives how far over it is'
);

-- Workouts deleted since keep the names of their days.
reset role;
delete from public.workouts where id in (930, 932);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select is(
  (select workouts from public.streak_break_days(pg_temp.days(), current_date) where day = pg_temp.y()),
  array[pg_temp.workout(932, 'Core', null, false)],
  'A workout moved to a day and deleted since keeps the name of the day it moved from'
);
select is(
  (select (workouts[1]).name from public.streak_break_days(pg_temp.days(), current_date)
   where day = pg_temp.x()),
  'Legs',
  'A deleted workout keeps the name of the day kept with it'
);

select is_empty(
  $$ select 1 from public.streak_break_days('{}', current_date) $$,
  'No days, nothing to say'
);
select results_eq(
  $$ select day from public.streak_break_days(
       array[current_date - 10, current_date, pg_temp.other(1)], current_date) $$,
  $$ values (pg_temp.other(1)) $$,
  'Days more than a week ago and from today on are left out'
);
select throws_ok(
  $$ select * from public.streak_break_days(pg_temp.days(), current_date + 5) $$,
  '22023', 'Today is the device''s today',
  'The break takes the device''s today, within a day of the server''s'
);

-- Another user asking about the same days gets their own, never a's.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select results_eq(
  $$ select workouts, eaten from public.streak_break_days(array[pg_temp.x()], current_date) $$,
  $$ values (array[pg_temp.workout(940, 'Arms', null, false)], 700.0::numeric) $$,
  'Another user gets only their own workouts and meals'
);

-- Signed in without a user, and anon.
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.streak_break_days(array[current_date - 1], current_date) $$,
  '42501', 'Not signed in',
  'A caller without a user has no break'
);
select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select * from public.streak_break_days(array[current_date - 1], current_date) $$,
  '42501', null,
  'Anon has no break'
);

select * from finish();
rollback;
