-- The imported exercise library: its metrics, and that clients can read but not change it.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

select is(
  (select count(*) from public.exercises where owner_id is null)::integer, 876,
  'The whole library is imported'
);

select is(
  (select metrics from public.exercises where id = 'Barbell_Bench_Press_-_Medium_Grip'),
  '{weight,reps}'::public.exercise_metric[],
  'Weighted exercises record weight and reps'
);
select is(
  (select metrics from public.exercises where id = 'Pullups'),
  '{reps}'::public.exercise_metric[],
  'Bodyweight exercises record reps'
);
select is(
  (select metrics from public.exercises where id = 'Plank'),
  '{duration}'::public.exercise_metric[],
  'Holds record duration'
);
select is(
  (select metrics from public.exercises where id = 'Running_Treadmill'),
  '{distance,duration}'::public.exercise_metric[],
  'Cardio records distance and duration'
);
select is(
  (select metrics from public.exercises where id = 'Farmers_Walk'),
  '{weight,distance,duration}'::public.exercise_metric[],
  'Exceptions from exercise-metrics.json are applied'
);

select set_config('role', 'authenticated', true),
  set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select isnt_empty(
  $$ select * from public.exercises e join public.exercise_translations t on t.exercise_id = e.id $$,
  'Signed-in users can read exercises and their translations'
);
select throws_ok(
  $$ update public.exercises set name = 'Changed' where id = 'Plank' $$,
  '42501',
  null,
  'Signed-in users cannot change exercises'
);
select throws_ok(
  $$ insert into public.exercise_translations (exercise_id, language, name) values ('Plank', 'de', 'x') $$,
  '42501',
  null,
  'Signed-in users cannot add translations'
);

select * from finish();
rollback;
