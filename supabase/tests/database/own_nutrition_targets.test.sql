-- Own targets and working the calculated ones out again: each user's own, in use only when chosen,
-- and a new goal, target weight, pace and activity saved in one step.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

-- A 30-year-old man of 180 cm and 80 kg, moderately active, training three days a week.
insert into public.profiles (user_id, sex, birth_year, height_cm, weight_unit, height_unit,
  activity_level, experience, training_setup, training_days, session_minutes,
  onboarding_completed_at)
values ('00000000-0000-0000-0000-00000000000a', 'male', extract(year from current_date) - 30,
  180, 'kg', 'cm', 'moderate', 'beginner', 'gym', '{1,3,5}', 60, now());
insert into public.goals (user_id, kind) values ('00000000-0000-0000-0000-00000000000a', 'stay_healthy');
insert into public.weight_entries (user_id, weight_kg) values ('00000000-0000-0000-0000-00000000000a', 80);

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select is(
  public.my_nutrition_targets(),
  public.calculate_nutrition_targets('male', 30, 180, 80, 'moderate', 3, 'stay_healthy'),
  'Without own targets, the calculated ones are in use'
);

insert into public.own_nutrition_targets (calories, protein_g, carbs_g, fat_g)
  values (2200, 160, 240, 65);

select is(
  public.my_nutrition_targets(),
  row(2200, 160, 240, 65)::public.nutrition_targets,
  'Own targets are in use once set'
);
select is(
  public.calculated_nutrition_targets(),
  public.calculate_nutrition_targets('male', 30, 180, 80, 'moderate', 3, 'stay_healthy'),
  'and the calculated ones can still be read'
);

update public.own_nutrition_targets set in_use = false;
select is(
  public.my_nutrition_targets(),
  public.calculated_nutrition_targets(),
  'Leaving them out of use puts the calculated targets back'
);
select results_eq(
  $$ select calories, protein_g from public.own_nutrition_targets $$,
  $$ values (2200, 160) $$,
  'and keeps them for next time'
);

select throws_ok(
  $$ update public.own_nutrition_targets set calories = 1800, protein_g = 180, fat_g = 70 $$,
  '23514',
  null,
  'Protein, carbs and fat cannot make more than the calories'
);
select lives_ok(
  $$ update public.own_nutrition_targets set calories = 2200, protein_g = 160, carbs_g = 250, fat_g = 65 $$,
  'A few kcal over, from rounding, is allowed'
);
select throws_ok(
  $$ update public.own_nutrition_targets set calories = 500 $$,
  '23514',
  null,
  'The calories stay within limits'
);

-- Working them out again

select is(
  public.preview_nutrition_targets('lose_fat', 75, 0.5, 'light'),
  public.calculate_nutrition_targets('male', 30, 180, 80, 'light', 3, 'lose_fat', 75, 0.5),
  'A preview works out the targets of a new goal, before it is saved'
);

update public.own_nutrition_targets set in_use = true;
select lives_ok(
  $$ select public.recalculate_nutrition_targets('lose_fat', 75, 0.5, 'light') $$,
  'A new goal, target, pace and activity are saved in one step'
);
select results_eq(
  $$ select g.kind::text, g.target_weight_kg, g.weekly_pace_kg, p.activity_level::text
     from public.goals g join public.profiles p using (user_id) $$,
  $$ values ('lose_fat', 75.0, 0.50, 'light') $$,
  'to the goal and the profile'
);
select is(
  public.my_nutrition_targets(),
  public.calculate_nutrition_targets('male', 30, 180, 80, 'light', 3, 'lose_fat', 75, 0.5),
  'and the calculated targets are in use again'
);

select lives_ok(
  $$ select public.recalculate_nutrition_targets('stay_healthy', 70, 0.5, 'moderate') $$,
  'A goal that keeps the weight'
);
select results_eq(
  $$ select g.target_weight_kg, g.weekly_pace_kg from public.goals g $$,
  $$ values (null::numeric, null::numeric) $$,
  'drops the target weight and the pace'
);
select throws_ok(
  $$ select public.recalculate_nutrition_targets('lose_fat', 85, 0.5, 'light') $$,
  'BB031',
  null,
  'A target weight has to suit the goal'
);

-- Other users and requests without a session

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');

select is_empty(
  $$ select * from public.own_nutrition_targets $$,
  'Users do not see the targets of others'
);

select set_config('role', 'anon', true);
select throws_ok(
  $$ select public.my_nutrition_targets() $$,
  '42501',
  null,
  'Requests without a session cannot read targets'
);

select * from finish();
rollback;
