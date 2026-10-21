-- The user's workout plan: a session per training day, each with its exercises and targets. Plans
-- are stored as rows rather than one document, so that logged sets can refer to the planned
-- exercise they belong to (#34). Every table carries the user id, so row level security needs no
-- joins.

create type public.plan_session_type as enum ('full_body', 'upper', 'lower', 'push', 'pull', 'legs');

-- One plan per user for now; the onboarding creates it.
create table public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.plan_sessions (
  id bigint generated always as identity primary key,
  plan_id uuid not null references public.workout_plans (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- ISO weekday, 1 for Monday to 7 for Sunday.
  weekday smallint not null check (weekday between 1 and 7),
  type public.plan_session_type not null,
  estimated_minutes smallint not null check (estimated_minutes between 1 and 180),
  unique (plan_id, weekday)
);

create table public.plan_exercises (
  id bigint generated always as identity primary key,
  session_id bigint not null references public.plan_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The order within the session; the finisher comes last.
  position smallint not null check (position >= 0),
  exercise_id text not null references public.exercises (id),
  slot public.plan_slot not null,
  sets smallint not null check (sets between 1 and 10),
  -- Either a rep range or a time, matching what the exercise records.
  target_reps_min smallint check (target_reps_min between 1 and 100),
  target_reps_max smallint check (target_reps_max between 1 and 100),
  target_seconds smallint check (target_seconds between 1 and 3600),
  rest_seconds smallint not null check (rest_seconds between 0 and 600),
  -- The conditioning block at the end of a fat loss session.
  is_finisher boolean not null default false,
  unique (session_id, position),
  check (
    (target_seconds is null and target_reps_min is not null and target_reps_max >= target_reps_min)
    or (target_seconds is not null and target_reps_min is null and target_reps_max is null)
  )
);

create index plan_sessions_plan_id_idx on public.plan_sessions (plan_id);
create index plan_exercises_session_id_idx on public.plan_exercises (session_id);

-- Users read and change only their own plan. It is written by complete_onboarding(), which runs
-- with the user's rights, so inserts are allowed for the user's own rows.
alter table public.workout_plans enable row level security;
alter table public.plan_sessions enable row level security;
alter table public.plan_exercises enable row level security;

create policy "Users read their own plan"
  on public.workout_plans for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users create their own plan"
  on public.workout_plans for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users delete their own plan"
  on public.workout_plans for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users read their own plan sessions"
  on public.plan_sessions for select to authenticated
  using ((select auth.uid()) = user_id);
-- Foreign keys do not check row level security, so inserts also check that the plan or session
-- they belong to is the user's own.
create policy "Users create their own plan sessions"
  on public.plan_sessions for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.workout_plans p
      where p.id = plan_id and p.user_id = (select auth.uid())
    )
  );

create policy "Users read their own plan exercises"
  on public.plan_exercises for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users create their own plan exercises"
  on public.plan_exercises for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.plan_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );

revoke all on public.workout_plans, public.plan_sessions, public.plan_exercises from anon;
revoke update, truncate on public.workout_plans, public.plan_sessions, public.plan_exercises
  from authenticated;
revoke delete on public.plan_sessions, public.plan_exercises from authenticated;
