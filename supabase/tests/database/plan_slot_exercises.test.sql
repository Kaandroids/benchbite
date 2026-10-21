-- The plan slot catalogue has a candidate for every slot a workout cannot do without, for every
-- setup and level of experience.
begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

-- training_setup is ordered gym, dumbbells, bodyweight, so an exercise is possible when it
-- requires the user's setup or one that comes later. Experience is ordered beginner to advanced.
-- The outer values are qualified, because an unqualified slot would mean c.slot.
select is_empty(
  $$
    select u.setup, e.experience, s.slot
    from unnest(enum_range(null::public.training_setup)) u (setup),
      unnest(enum_range(null::public.experience)) e (experience),
      unnest(array['squat', 'hinge', 'lunge', 'horizontal_push', 'horizontal_pull', 'core',
        'conditioning']::public.plan_slot[]) s (slot)
    where not exists (
      select 1 from public.plan_slot_exercises c
      where c.slot = s.slot and c.requires >= u.setup and c.min_experience <= e.experience
    )
  $$,
  'Every essential slot has a candidate for every setup and experience'
);

select is_empty(
  $$
    select u.setup, s.slot
    from unnest(array['gym', 'dumbbells']::public.training_setup[]) u (setup),
      unnest(array['vertical_push', 'vertical_pull', 'biceps', 'triceps', 'shoulders',
        'calves']::public.plan_slot[]) s (slot)
    where not exists (
      select 1 from public.plan_slot_exercises c
      where c.slot = s.slot and c.requires >= u.setup and c.min_experience = 'beginner'
    )
  $$,
  'Gyms and dumbbells cover every other slot from the first workout'
);

select is_empty(
  $$
    select c.exercise_id from public.plan_slot_exercises c
    where not exists (
      select 1 from public.exercise_translations t
      where t.exercise_id = c.exercise_id and t.language = 'de'
    ) or not exists (
      select 1 from public.exercise_translations t
      where t.exercise_id = c.exercise_id and t.language = 'tr'
    )
  $$,
  'Every exercise in the catalogue has a German and a Turkish name'
);

select set_config('role', 'authenticated', true),
  set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select throws_ok(
  $$ delete from public.plan_slot_exercises $$,
  '42501',
  null,
  'Signed-in users cannot change the catalogue'
);

select * from finish();
rollback;
