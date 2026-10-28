-- Local development only: `supabase db reset` runs this after the migrations. It creates an
-- account that has finished the onboarding, so the app can skip it from the developer tools
-- (#246). The password is a placeholder for the local database, not a secret; hosted projects
-- are never seeded.

-- The account, with a confirmed email so that it can sign in with its password at once.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  -- The auth server reads these as text and fails on null.
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values (
  '00000000-0000-0000-0000-000000000000', 'de000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'dev@benchbite.local',
  extensions.crypt('benchbite-dev', extensions.gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}', '{}', now(), now(),
  '', '', '', ''
);

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
values (
  gen_random_uuid(), 'de000000-0000-4000-8000-000000000001',
  'de000000-0000-4000-8000-000000000001', 'email',
  '{"sub": "de000000-0000-4000-8000-000000000001", "email": "dev@benchbite.local", "email_verified": true}',
  now(), now(), now()
);

-- The onboarding, saved as the app saves it: a 30-year-old man of 180 cm and 85 kg losing fat
-- towards 78 kg, lightly active, training on Monday, Wednesday and Friday.
select set_config(
  'request.jwt.claims',
  '{"sub": "de000000-0000-4000-8000-000000000001", "role": "authenticated"}',
  -- For the session, as the seed may run its statements in transactions of their own.
  false
);

select public.complete_onboarding(
  jsonb_build_object(
    'displayName', 'Dev', 'goal', 'lose_fat', 'consentedPolicyVersion', '2026-10-21',
    'sex', 'male', 'birthYear', extract(year from current_date)::integer - 30, 'heightCm', 180,
    'weightKg', 85, 'targetWeightKg', 78, 'weeklyPaceKg', 0.5, 'activityLevel', 'light',
    'experience', 'beginner', 'trainingDays', jsonb_build_array(1, 3, 5), 'setup', 'gym',
    'sessionMinutes', 45, 'weightUnit', 'kg', 'heightUnit', 'cm'
  ),
  jsonb_build_object('sessions', jsonb_build_array(
    jsonb_build_object('weekdays', jsonb_build_array(1, 5), 'type', 'full_body',
      'estimatedMinutes', 44, 'exercises', jsonb_build_array(
        jsonb_build_object('exerciseId', 'Barbell_Squat', 'slot', 'squat', 'sets', 3,
          'target', jsonb_build_object('reps', jsonb_build_object('min', 8, 'max', 12)),
          'restSeconds', 75),
        jsonb_build_object('exerciseId', 'Plank', 'slot', 'core', 'sets', 2,
          'target', jsonb_build_object('seconds', 30), 'restSeconds', 45))),
    jsonb_build_object('weekdays', jsonb_build_array(3), 'type', 'lower', 'estimatedMinutes', 45,
      'exercises', jsonb_build_array(
        jsonb_build_object('exerciseId', 'Leg_Press', 'slot', 'squat', 'sets', 3,
          'target', jsonb_build_object('reps', jsonb_build_object('min', 8, 'max', 12)),
          'restSeconds', 75),
        jsonb_build_object('exerciseId', 'Rowing_Stationary', 'slot', 'conditioning', 'sets', 1,
          'target', jsonb_build_object('seconds', 240), 'restSeconds', 0)))
  ))
);

-- Two weeks of weights before today's, going down, so that the charts have something to show.
insert into public.weight_entries (user_id, weight_kg, measured_on)
select 'de000000-0000-4000-8000-000000000001', 85 + days * 0.1, current_date - days
from generate_series(1, 14) days
on conflict do nothing;

select set_config('request.jwt.claims', '', false);
