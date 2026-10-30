-- The pace of loss the targets really give. A 30-year-old woman, 165 cm, training three days a
-- week.
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

select is(
  public.achievable_weekly_pace_kg('female', 30, 165, 70, 'moderate', 3, 'lose_fat', 65, 0.9),
  0.9,
  'The chosen pace, when the targets can give it'
);
select is(
  public.achievable_weekly_pace_kg('female', 30, 165, 60, 'sedentary', 3, 'lose_fat', 55, 0.9),
  0.56,
  'Less, when the floor holds the calories up: (1820 - 1200) * 7 / 7700'
);
select is(
  public.achievable_weekly_pace_kg('female', 30, 165, 70, 'moderate', 3, 'lose_fat', 65),
  0.5,
  'Half a kilogram a week without a pace, as the targets assume'
);
select is(
  public.achievable_weekly_pace_kg('female', 30, 145, 40, 'sedentary', 0, 'lose_fat', 38, 0.5),
  0::numeric,
  'None, when the weight is kept already at the floor'
);
select is(
  public.achievable_weekly_pace_kg('female', 30, 165, 60, 'moderate', 3, 'build_muscle', 65, 0.25),
  null,
  'None for a goal to gain, which the floor never holds back'
);
select is(
  public.achievable_weekly_pace_kg('female', 30, 165, 60, 'moderate', 3, 'stay_healthy'),
  null,
  'None for a goal that keeps the weight'
);

select ok(
  not has_function_privilege('anon', 'public.achievable_weekly_pace_kg(public.sex, integer, numeric, numeric, public.activity_level, integer, public.goal_kind, numeric, numeric, boolean)', 'execute')
    and has_function_privilege('authenticated', 'public.achievable_weekly_pace_kg(public.sex, integer, numeric, numeric, public.activity_level, integer, public.goal_kind, numeric, numeric, boolean)', 'execute'),
  'Signed-in users work out a pace; guests without an account may not'
);
select ok(
  not has_function_privilege('anon', 'public.my_achievable_weekly_pace_kg()', 'execute')
    and has_function_privilege('authenticated', 'public.my_achievable_weekly_pace_kg()', 'execute'),
  'Signed-in users read their own pace; guests without an account may not'
);

-- A loses as above; B keeps the weight; C has no profile yet.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.com');
insert into public.profiles (user_id, sex, birth_year, height_cm, weight_unit, height_unit,
  activity_level, experience, training_setup, training_days, session_minutes,
  onboarding_completed_at)
values
  ('00000000-0000-0000-0000-00000000000a', 'female', extract(year from current_date) - 30,
    165, 'kg', 'cm', 'sedentary', 'beginner', 'gym', '{1,3,5}', 60, now()),
  ('00000000-0000-0000-0000-00000000000b', 'male', extract(year from current_date) - 30,
    180, 'kg', 'cm', 'moderate', 'beginner', 'gym', '{1,3,5}', 60, now());
insert into public.goals (user_id, kind, target_weight_kg, weekly_pace_kg) values
  ('00000000-0000-0000-0000-00000000000a', 'lose_fat', 55, 0.9),
  ('00000000-0000-0000-0000-00000000000b', 'stay_healthy', null, null);
insert into public.weight_entries (user_id, weight_kg) values
  ('00000000-0000-0000-0000-00000000000a', 60),
  ('00000000-0000-0000-0000-00000000000b', 80);

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select is(public.my_achievable_weekly_pace_kg(), 0.56, 'A reads the pace of her own goal');
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select is(public.my_achievable_weekly_pace_kg(), null, 'B, keeping his weight, has none, not A''s');
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000c');
select is(public.my_achievable_weekly_pace_kg(), null, 'C, before the onboarding, has none');

reset role;
select is(
  (select count(*) from pg_proc where proname = 'my_achievable_weekly_pace_kg' and prosecdef),
  0::bigint,
  'It runs as the caller, so the policies keep it to their rows'
);

select * from finish();
rollback;
