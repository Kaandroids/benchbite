-- Links to withdraw a consent from the website (#653, ADR 0146): made only for a confirmed account
-- and limited as those to delete one, they withdraw what the app does, work once, for 30 minutes,
-- for their own consent and address only, and are out of every client's reach.
begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

insert into auth.users (id, email, email_confirmed_at, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', 'kaan@example.com', now(), false),
  ('00000000-0000-0000-0000-00000000000b', 'unconfirmed@example.com', null, false),
  ('00000000-0000-0000-0000-00000000000c', 'other@example.com', now(), false);

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;
grant execute on all functions in schema pg_temp to public;

-- A finishes the onboarding, gives the AI consent and chats with Bite.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select public.complete_onboarding(
  jsonb_build_object(
    'goal', 'lose_fat', 'consentedPolicyVersion', '2026-10-21', 'acceptedTermsVersion', '2026-11-18',
    'sex', 'female', 'birthYear', extract(year from current_date)::integer - 30, 'heightCm', 168,
    'weightKg', 70, 'targetWeightKg', 64, 'weeklyPaceKg', 0.5, 'activityLevel', 'light',
    'experience', 'beginner', 'trainingDays', jsonb_build_array(1, 3), 'setup', 'gym',
    'sessionMinutes', 45, 'weightUnit', 'kg', 'heightUnit', 'cm'
  ),
  jsonb_build_object('sessions', jsonb_build_array(jsonb_build_object(
    'weekdays', jsonb_build_array(1, 3), 'type', 'full_body', 'estimatedMinutes', 30,
    'exercises', jsonb_build_array(jsonb_build_object('exerciseId', 'Plank', 'slot', 'core',
      'sets', 2, 'target', jsonb_build_object('seconds', 30), 'restSeconds', 45)))))
);
insert into public.ai_consents (consent_version) values ('2026-11-18');
reset role;
insert into public.coach_threads (user_id) values ('00000000-0000-0000-0000-00000000000a');

select is(
  public.start_consent_withdrawal(' Kaan@Example.com ', '\x01', '\xa1', 'ai'),
  'kaan@example.com',
  'A confirmed account gets a link, sent to its own address'
);
select is(
  public.start_consent_withdrawal('unconfirmed@example.com', '\x01', '\xb1', 'ai'),
  null,
  'An address nobody confirmed gets no link'
);
select is(
  public.start_consent_withdrawal('nobody@example.com', '\x01', '\xc1', 'ai'),
  null,
  'An address without an account gets no link'
);

select is(
  public.withdraw_consent_by_link('\xa1', 'health'),
  false,
  'A link withdraws no other consent than its own'
);
select is(
  public.withdraw_consent_by_link('\xa1', 'ai'),
  true,
  'A link withdraws its consent'
);
select results_eq(
  $$ select public.has_ai_consent('00000000-0000-0000-0000-00000000000a'),
       (select count(*) from public.coach_threads
         where user_id = '00000000-0000-0000-0000-00000000000a') $$,
  $$ values (false, 0::bigint) $$,
  'The AI consent ends with Bite''s chats, as in the app'
);
select is(public.withdraw_consent_by_link('\xa1', 'ai'), false, 'A link works once');

select public.start_consent_withdrawal('kaan@example.com', '\x02', '\xa2', 'ai');
select is(
  public.withdraw_consent_by_link('\xa2', 'ai'),
  true,
  'A consent already withdrawn counts as withdrawn'
);
select is(
  (select count(*) from public.ai_consent_withdrawals
    where user_id = '00000000-0000-0000-0000-00000000000a'),
  1::bigint,
  'And is not recorded again'
);

select public.start_consent_withdrawal('kaan@example.com', '\x02', '\xa3', 'health');
select is(
  public.withdraw_consent_by_link('\xa3', 'health'),
  true,
  'A link withdraws the health data consent'
);
select ok(
  not public.has_health_consent('00000000-0000-0000-0000-00000000000a')
    and not exists (select 1 from public.profiles
      where user_id = '00000000-0000-0000-0000-00000000000a')
    and not exists (select 1 from public.workouts
      where user_id = '00000000-0000-0000-0000-00000000000a')
    and exists (select 1 from auth.users where id = '00000000-0000-0000-0000-00000000000a'),
  'It deletes the profile and the plan, as in the app, and keeps the account'
);

select public.start_consent_withdrawal('other@example.com', '\x03', '\xd1', 'ai');
update public.consent_withdrawal_links set expires_at = now() - interval '1 second'
  where token_hash = '\xd1';
select is(public.withdraw_consent_by_link('\xd1', 'ai'), false, 'An old link does not work');

select public.start_consent_withdrawal('other@example.com', '\x03', '\xd2', 'ai');
update auth.users set email = 'new@example.com' where id = '00000000-0000-0000-0000-00000000000c';
select is(
  public.withdraw_consent_by_link('\xd2', 'ai'),
  false,
  'Nor does one whose address is no longer the account''s'
);
update auth.users set email = 'other@example.com' where id = '00000000-0000-0000-0000-00000000000c';
select public.start_consent_withdrawal('other@example.com', '\x03', '\xd7', 'ai');

select is(
  public.start_consent_withdrawal('other@example.com', '\x03', '\xd3', 'ai'),
  null,
  'An address asking a fourth time from one IP within an hour gets no link'
);
select isnt(
  public.start_consent_withdrawal('other@example.com', '\x04', '\xd4', 'ai'),
  null,
  'Its owner, from another IP, still gets one'
);
select public.start_consent_withdrawal(
  'many' || n || '@example.com', '\x09', extensions.digest(n::text, 'sha256'), 'ai'
) from generate_series(1, 10) n;
select is(
  public.start_consent_withdrawal('other@example.com', '\x09', '\xd5', 'ai'),
  null,
  'An IP gets no more than 10 an hour'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000c');
select throws_ok(
  $$ select public.withdraw_consent_by_link('\xd4', 'ai') $$,
  '42501',
  null,
  'A user cannot use a link from the app'
);
select throws_ok(
  $$ select public.start_consent_withdrawal('other@example.com', '\x05', '\xd6', 'ai') $$,
  '42501',
  null,
  'Nor make one'
);
select throws_ok(
  $$ select public.withdraw_ai_consent_of('00000000-0000-0000-0000-00000000000c') $$,
  '42501',
  null,
  'Nor withdraw the consent of a user they name'
);
select throws_ok(
  $$ select * from public.consent_withdrawal_links $$,
  '42501',
  null,
  'Nor read the links'
);

select * from finish();
rollback;
