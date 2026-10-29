-- streak_break_days() says why each missed day of a break not answered yet did not count: its
-- workouts not done or skipped, the calories eaten and its target (#278). Only the caller's own.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

set local session_replication_role = replica;

-- User a: from four days ago, nothing answered yet, a target of 2,000 kcal.
insert into public.planned_days_kept (user_id, through, started_on)
  values ('00000000-0000-0000-0000-00000000000a', current_date - 1, current_date - 4);
insert into public.user_streaks (user_id) values ('00000000-0000-0000-0000-00000000000a');
insert into public.own_nutrition_targets (user_id, calories, protein_g, carbs_g, fat_g)
  values ('00000000-0000-0000-0000-00000000000a', 2000, 100, 250, 60);
insert into public.workouts (id, user_id, name, type, weekdays, active, estimated_minutes)
  overriding system value values
  (930, '00000000-0000-0000-0000-00000000000a', 'Legs', null, '{}', true, 45),
  (931, '00000000-0000-0000-0000-00000000000a', null, 'push', '{}', true, 45);
-- Four days ago: both workouts planned, Legs not done, the other skipped, eaten to the target.
-- Three days ago: nothing eaten. Two days ago: over the target. Yesterday: done.
insert into public.planned_days (user_id, day, workout_id, name, type) values
  ('00000000-0000-0000-0000-00000000000a', current_date - 4, 930, 'Legs', null),
  ('00000000-0000-0000-0000-00000000000a', current_date - 4, 931, null, 'push');
insert into public.workout_moves (user_id, workout_id, from_on, to_on)
  values ('00000000-0000-0000-0000-00000000000a', 931, current_date - 4, null);

create function pg_temp.eat(on_day date, kcal integer) returns void language sql as $$
  insert into public.meal_entries (user_id, day, meal, food_id, grams, kcal_per_100g)
  values ('00000000-0000-0000-0000-00000000000a', on_day, 'lunch',
    (select id from public.foods order by id limit 1), kcal, 100);
$$;
select pg_temp.eat(current_date - 4, 1500);
select pg_temp.eat(current_date - 2, 2400);
select pg_temp.eat(current_date - 1, 1800);

set local session_replication_role = origin;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select results_eq(
  $$ select day from public.streak_break_days(current_date) $$,
  $$ values (current_date - 4), (current_date - 3), (current_date - 2) $$,
  'Each missed day of the break is listed, not the days that counted'
);
select is(
  (select workouts from public.streak_break_days(current_date) where day = current_date - 4),
  jsonb_build_array(
    jsonb_build_object('id', 930, 'name', 'Legs', 'type', null, 'skipped', false),
    jsonb_build_object('id', 931, 'name', null, 'type', 'push', 'skipped', true)
  ),
  'A day lists its workouts not done, and those skipped'
);
select results_eq(
  $$ select eaten, target from public.streak_break_days(current_date) where day = current_date - 4 $$,
  $$ values (1500.0::numeric, 2000) $$,
  'A day gives the calories eaten and its target'
);
select results_eq(
  $$ select workouts, eaten from public.streak_break_days(current_date) where day = current_date - 3 $$,
  $$ values ('[]'::jsonb, 0::numeric) $$,
  'A day without meals has eaten none'
);
select ok(
  (select eaten > target from public.streak_break_days(current_date) where day = current_date - 2),
  'A day over its target says by how much'
);

-- A deleted workout keeps its name from the day kept with it.
reset role;
delete from public.workouts where id = 930;
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select is(
  (select workouts -> 0 ->> 'name' from public.streak_break_days(current_date) where day = current_date - 4),
  'Legs',
  'A deleted workout keeps the name of the day kept with it'
);

-- Answered days are no longer listed.
select public.answer_streak_break(current_date, false);
select is_empty(
  $$ select 1 from public.streak_break_days(current_date) $$,
  'A break answered lists nothing'
);

-- Another user, who has not read the streak yet, has nothing to answer and sees nothing of a's.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select is_empty(
  $$ select 1 from public.streak_break_days(current_date) $$,
  'A user who has not read the streak has no break, and sees no one else''s'
);

select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select * from public.streak_break_days(current_date) $$,
  '42501', null,
  'Anon has no break'
);

select * from finish();
rollback;
