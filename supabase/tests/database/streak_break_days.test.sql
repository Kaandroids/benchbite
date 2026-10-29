-- streak_break_days() says what each missed day of a break missed: its workouts not done or
-- skipped, with the name and type its day shows, the calories eaten and its target (#278). Only
-- the caller's own, within the year before the device's today.
begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- The Monday two weeks ago: a week that is past whatever day the tests run on.
create function pg_temp.w(offset_days integer) returns date language sql as $$
  select date_trunc('week', current_date)::date - 14 + offset_days;
$$;

set local session_replication_role = replica;

-- User a: from that Monday, every day kept as planned, a target of 2,000 kcal.
insert into public.planned_days_kept (user_id, through, started_on)
  values ('00000000-0000-0000-0000-00000000000a', current_date - 1, pg_temp.w(0));
insert into public.own_nutrition_targets (user_id, calories, protein_g, carbs_g, fat_g)
  values ('00000000-0000-0000-0000-00000000000a', 2000, 100, 250, 60);
insert into public.workouts (id, user_id, name, type, weekdays, active, estimated_minutes)
  overriding system value values
  (930, '00000000-0000-0000-0000-00000000000a', 'Legs', null, '{}', true, 45),
  (931, '00000000-0000-0000-0000-00000000000a', null, 'push', '{}', true, 45),
  (932, '00000000-0000-0000-0000-00000000000a', 'Core', null, '{}', true, 30);
-- Monday: Legs not done and Push skipped, eaten to the target. Tuesday: nothing eaten.
-- Wednesday: over the target. Thursday: Core, moved there from Monday, missed.
insert into public.planned_days (user_id, day, workout_id, name, type) values
  ('00000000-0000-0000-0000-00000000000a', pg_temp.w(0), 930, 'Legs', null),
  ('00000000-0000-0000-0000-00000000000a', pg_temp.w(0), 931, null, 'push'),
  ('00000000-0000-0000-0000-00000000000a', pg_temp.w(0), 932, 'Core', null);
insert into public.workout_moves (user_id, workout_id, from_on, to_on) values
  ('00000000-0000-0000-0000-00000000000a', 931, pg_temp.w(0), null),
  ('00000000-0000-0000-0000-00000000000a', 932, pg_temp.w(0), pg_temp.w(3));

create function pg_temp.eat(owner uuid, on_day date, kcal integer) returns void language sql as $$
  insert into public.meal_entries (user_id, day, meal, food_id, grams, kcal_per_100g)
  values (owner, on_day, 'lunch', (select id from public.foods order by id limit 1), kcal, 100);
$$;
select pg_temp.eat('00000000-0000-0000-0000-00000000000a', pg_temp.w(0), 1500);
select pg_temp.eat('00000000-0000-0000-0000-00000000000a', pg_temp.w(2), 2400);
select pg_temp.eat('00000000-0000-0000-0000-00000000000a', pg_temp.w(3), 1500);

-- User b: from the same Monday, with a workout and meals of their own that day.
insert into public.planned_days_kept (user_id, through, started_on)
  values ('00000000-0000-0000-0000-00000000000b', current_date - 1, pg_temp.w(0));
insert into public.workouts (id, user_id, name, type, weekdays, active, estimated_minutes)
  overriding system value
  values (940, '00000000-0000-0000-0000-00000000000b', 'Arms', null, '{}', true, 30);
insert into public.planned_days (user_id, day, workout_id, name, type)
  values ('00000000-0000-0000-0000-00000000000b', pg_temp.w(0), 940, 'Arms', null);
select pg_temp.eat('00000000-0000-0000-0000-00000000000b', pg_temp.w(0), 700);

set local session_replication_role = origin;

-- The days of a's break, as streak() would list them.
create function pg_temp.days() returns date[] language sql as $$
  select array[pg_temp.w(0), pg_temp.w(1), pg_temp.w(2), pg_temp.w(3)];
$$;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select results_eq(
  $$ select day from public.streak_break_days(pg_temp.days(), current_date) $$,
  $$ values (pg_temp.w(0)), (pg_temp.w(1)), (pg_temp.w(2)), (pg_temp.w(3)) $$,
  'Each day asked about is given, in order'
);
select is(
  (select workouts from public.streak_break_days(pg_temp.days(), current_date) where day = pg_temp.w(0)),
  jsonb_build_array(
    jsonb_build_object('id', 930, 'name', 'Legs', 'type', null, 'skipped', false),
    jsonb_build_object('id', 931, 'name', null, 'type', 'push', 'skipped', true)
  ),
  'A day lists its workouts not done, and those skipped, but not those moved away'
);
select results_eq(
  $$ select eaten, target from public.streak_break_days(pg_temp.days(), current_date)
     where day = pg_temp.w(0) $$,
  $$ values (1500.0::numeric, 2000) $$,
  'A day gives the calories eaten and its target'
);
select results_eq(
  $$ select workouts, eaten from public.streak_break_days(pg_temp.days(), current_date)
     where day = pg_temp.w(1) $$,
  $$ values ('[]'::jsonb, 0::numeric) $$,
  'A day without meals has eaten none'
);
select is(
  (select eaten - target from public.streak_break_days(pg_temp.days(), current_date)
   where day = pg_temp.w(2)),
  400::numeric,
  'A day over its target says by how much'
);

-- A workout moved to a day, missed and deleted since, keeps the name of the day it moved from.
reset role;
delete from public.workouts where id in (930, 932);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select is(
  (select workouts from public.streak_break_days(pg_temp.days(), current_date) where day = pg_temp.w(3)),
  jsonb_build_array(jsonb_build_object('id', 932, 'name', 'Core', 'type', null, 'skipped', false)),
  'A workout moved to a day and deleted since keeps the name of the day it moved from'
);
select is(
  (select workouts -> 0 ->> 'name' from public.streak_break_days(pg_temp.days(), current_date)
   where day = pg_temp.w(0)),
  'Legs',
  'A deleted workout keeps the name of the day kept with it'
);

select is_empty(
  $$ select 1 from public.streak_break_days('{}', current_date) $$,
  'No days, nothing to say'
);
select throws_ok(
  $$ select * from public.streak_break_days(array[current_date], current_date) $$,
  '22023', 'The days of a break are within the year before today',
  'Only days before today are asked about'
);

-- Another user asking about the same days gets their own, never a's.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select results_eq(
  $$ select workouts ->> 0, eaten from public.streak_break_days(array[pg_temp.w(0)], current_date) $$,
  $$ values ('{"id": 940, "name": "Arms", "type": null, "skipped": false}', 700.0::numeric) $$,
  'Another user gets only their own workouts and meals'
);

select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select * from public.streak_break_days(array[current_date - 1], current_date) $$,
  '42501', null,
  'Anon has no break'
);

select * from finish();
rollback;
