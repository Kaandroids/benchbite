-- What the premium page shows of the caller's plan (#411): the free plan's photos as a number,
-- the trial's and premium's windows as a share left with when they open again, never in money,
-- and only for the caller.
begin;
create extension if not exists pgtap with schema extensions;

select plan(23);

insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com', false),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com', false),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.com', false),
  ('00000000-0000-0000-0000-00000000000d', 'd@example.com', false),
  ('00000000-0000-0000-0000-00000000000e', 'e@example.com', false),
  ('00000000-0000-0000-0000-00000000000f', 'f@example.com', false);

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.used(
  user_id uuid, cost numeric, at timestamptz, free boolean default false, given boolean default null
) returns void language sql as $$
  insert into public.ai_usage
    (call_id, user_id, feature, model, input_tokens, cached_input_tokens, output_tokens,
     thinking_tokens, cost_usd, created_at, free, given)
  values (gen_random_uuid(), user_id, public.ai_counted_feature(), 'test-flash', 0, 0, 0, 0, cost,
    at, free, given);
$$;
insert into public.ai_model_prices (model, valid_from, input_usd, cached_input_usd, output_usd)
  values ('test-flash', '2000-01-01', 0, 0, 0);

-- Share left.
select is(public.share_left(1, 4), 0.75, 'The share left is what is not used of the budget');
select is(public.share_left(5, 4), 0::numeric, 'and never below nothing');
select is(public.share_left(0, null), null, 'and none without a budget');

-- A on the free plan, with one meal photo given this week.
select pg_temp.used('00000000-0000-0000-0000-00000000000a', 0.01, now(), true, true);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select is((public.plan_summary()).plan, 'free'::public.plan, 'A free user is on the free plan');
select is(
  ((public.plan_summary()).photos_per_week, (public.plan_summary()).photos_left),
  (2, 1),
  'with the week''s meal photos and those left'
);
select ok((public.plan_summary()).photos_reset_at > now(), 'and when the next week starts');
select is((public.plan_summary()).period_left, null, 'and no budget windows');
reset role;

-- B on premium, billed monthly, a quarter of the period's budget and the whole week's used.
insert into public.subscriptions (user_id, plan, period_start, period_end, billing, source)
  values ('00000000-0000-0000-0000-00000000000b', 'premium', now() - interval '3 days',
    now() + interval '27 days', 'monthly', 'manual');
select pg_temp.used(
  '00000000-0000-0000-0000-00000000000b',
  (select p.weekly_budget_usd from public.plans p where p.plan = 'premium'),
  now() - interval '1 hour'
);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
create temp table b_summary as select * from public.plan_summary();
reset role;
select is(
  (select (plan, billing) from b_summary),
  ('premium'::public.plan, 'monthly'::public.billing_period),
  'A premium user is on premium, with how it is billed'
);
select ok((select period_end from b_summary) > now() + interval '26 days', 'and when it renews');
select is((select week_left from b_summary), 0::numeric, 'with nothing left of the week');
select is(
  (select period_left from b_summary),
  1 - (select p.weekly_budget_usd / p.budget_usd from public.plans p where p.plan = 'premium'),
  'and the share of the period left'
);
select ok(
  (select week_resets_at < period_resets_at from b_summary), 'and when each opens again'
);
select is((select photos_left from b_summary), null, 'and no photo count');

-- C on the free plan, whose photos gave no estimate but spent the week's backstop.
select pg_temp.used(
  '00000000-0000-0000-0000-00000000000c',
  (select p.weekly_free_usd from public.plans p where p.plan = 'free'),
  now(), true, false
);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000c');
create temp table c_summary as select * from public.plan_summary();
reset role;
select is(
  (select photos_left from c_summary), 0,
  'No photo is left once the week''s backstop is spent, though none was counted'
);

-- D on premium, monthly, with all but a fifth of a week's budget spent in its first week.
insert into public.subscriptions (user_id, plan, period_start, period_end, billing, source)
  values ('00000000-0000-0000-0000-00000000000d', 'premium', now() - interval '10 days',
    now() + interval '20 days', 'monthly', 'manual');
select pg_temp.used(
  '00000000-0000-0000-0000-00000000000d',
  (select p.budget_usd - p.weekly_budget_usd / 5 from public.plans p where p.plan = 'premium'),
  now() - interval '9 days'
);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000d');
create temp table d_summary as select * from public.plan_summary();
reset role;
select is(
  (select week_left from d_summary), 0.2,
  'A fresh week has no more left than the period does'
);

-- E on the trial, whose week is its period.
insert into public.subscriptions (user_id, plan, period_start, period_end, billing, source)
  values ('00000000-0000-0000-0000-00000000000e', 'trial', now() - interval '1 day',
    now() + interval '6 days', 'monthly', 'manual');
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000e');
create temp table e_summary as select * from public.plan_summary();
reset role;
select is(
  (select (week_left, week_resets_at) from e_summary), (null::numeric, null::timestamptz),
  'The trial has no week apart from its period'
);
select is((select period_left from e_summary), 1::numeric, 'only the period');

-- F on premium, its period ended twenty minutes ago, in the hour of grace.
insert into public.subscriptions (user_id, plan, period_start, period_end, billing, source)
  values ('00000000-0000-0000-0000-00000000000f', 'premium', now() - interval '30 days',
    now() - interval '20 minutes', 'monthly', 'manual');
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000f');
create temp table f_summary as select * from public.plan_summary();
reset role;
select is((select plan from f_summary), 'premium'::public.plan, 'In its grace a plan is still on');
select is(
  (select (period_end, period_resets_at, week_resets_at) from f_summary),
  (null::timestamptz, null::timestamptz, null::timestamptz),
  'with no renewal or reset that has already passed'
);

-- What each plan allows.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
create temp table numbers as select * from public.plan_numbers();
reset role;
select is(
  (select (workouts, added_alternatives, weekly_photos) from numbers where plan = 'free'),
  (select (p.workouts, p.added_alternatives, p.weekly_photos) from public.plans p where p.plan = 'free'),
  'Each plan''s numbers can be compared'
);
select is((select count(*) from numbers)::integer, 3, 'for every plan');

-- Only a signed-in user.
select ok(
  not has_function_privilege('anon', 'public.plan_summary()', 'execute'),
  'A guest of the API cannot call it'
);
select set_config('request.jwt.claims', '', true);
set local role authenticated;
select throws_ok(
  'select public.plan_summary()', '42501', 'Not signed in',
  'nor can a caller who is not signed in'
);
reset role;

select * from finish();
rollback;
