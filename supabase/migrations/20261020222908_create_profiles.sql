-- What the onboarding asks: the profile, the goal, the weight history and the consent to process
-- health data. Body measurements are stored in metric units; the unit columns only decide how the
-- app shows them.

create extension if not exists moddatetime with schema extensions;

create type public.sex as enum ('female', 'male', 'unspecified');
create type public.weight_unit as enum ('kg', 'lb');
create type public.height_unit as enum ('cm', 'ft');
-- Daily movement outside workouts; training days are taken into account separately.
create type public.activity_level as enum ('sedentary', 'light', 'moderate', 'active');
create type public.experience as enum ('beginner', 'intermediate', 'advanced');
create type public.training_setup as enum ('gym', 'dumbbells', 'bodyweight');
create type public.goal_kind as enum ('lose_fat', 'build_muscle', 'get_stronger', 'stay_healthy');

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  sex public.sex not null,
  birth_year smallint not null check (birth_year between 1900 and 2100),
  height_cm numeric(4, 1) not null check (height_cm between 100 and 250),
  weight_unit public.weight_unit not null,
  height_unit public.height_unit not null,
  activity_level public.activity_level not null,
  experience public.experience not null,
  training_setup public.training_setup not null,
  -- ISO weekdays, 1 for Monday to 7 for Sunday.
  training_days smallint[] not null check (
    cardinality(training_days) between 1 and 7
    and training_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
  ),
  session_minutes smallint not null check (session_minutes in (30, 45, 60, 75)),
  -- No calorie deficit is recommended while this is true.
  pregnant_or_breastfeeding boolean not null default false,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The current goal, one per user.
create table public.goals (
  user_id uuid primary key references auth.users (id) on delete cascade,
  kind public.goal_kind not null,
  -- Only for goals that change the weight.
  target_weight_kg numeric(4, 1) check (target_weight_kg between 30 and 300),
  weekly_pace_kg numeric(3, 2) check (weekly_pace_kg between 0.1 and 1.5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The latest entry is the current weight; the first one is the starting weight.
create table public.weight_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  weight_kg numeric(4, 1) not null check (weight_kg between 30 and 300),
  measured_on date not null default current_date,
  created_at timestamptz not null default now()
);

create index weight_entries_user_id_measured_on_idx
  on public.weight_entries (user_id, measured_on desc);

-- Explicit consent to process health data (GDPR Article 9). Entries are never changed, so the
-- history shows which policy version was accepted when.
create table public.health_data_consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  policy_version text not null,
  granted_at timestamptz not null default now()
);

create index health_data_consents_user_id_idx on public.health_data_consents (user_id);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function extensions.moddatetime(updated_at);

create trigger goals_updated_at
  before update on public.goals
  for each row execute function extensions.moddatetime(updated_at);

-- Users can only see and change their own rows. Anonymous users have the authenticated role
-- too. Rows are deleted together with the user, so there are no delete policies.
alter table public.profiles enable row level security;
alter table public.goals enable row level security;
alter table public.weight_entries enable row level security;
alter table public.health_data_consents enable row level security;

create policy "Users read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users create their own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users read their own goal"
  on public.goals for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users create their own goal"
  on public.goals for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update their own goal"
  on public.goals for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users read their own weight entries"
  on public.weight_entries for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users add their own weight entries"
  on public.weight_entries for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update their own weight entries"
  on public.weight_entries for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Consents can be read and added, but not changed.
create policy "Users read their own consents"
  on public.health_data_consents for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users give their own consent"
  on public.health_data_consents for insert to authenticated
  with check ((select auth.uid()) = user_id);

revoke all on public.profiles, public.goals, public.weight_entries, public.health_data_consents
  from anon;
revoke delete, truncate on public.profiles, public.goals, public.weight_entries
  from authenticated;
revoke insert, update, delete, truncate on public.health_data_consents from authenticated;
-- The server sets granted_at, so a consent cannot be backdated.
grant insert (user_id, policy_version) on public.health_data_consents to authenticated;
