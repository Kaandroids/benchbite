-- Changes Bite proposes, which the user applies, keeps as they are, or undoes (#297, ADR 0058).
-- Bite never changes data itself: its tools write a proposal, the chat shows it as a card, and
-- only the user's tap applies it, through the same functions the app uses. A proposal keeps what
-- it replaces, so that it applies only to what Bite saw and is undone to what was there.

-- The user's own targets are saved through one function, by the app and by the proposals alike,
-- which also keeps them over today and the days after it that kept some (ADR 0040): the app did
-- the two in separate calls.

-- Sets the caller's own targets, `targets` with `calories`, `proteinG`, `carbsG`, `fatG` and
-- `inUse`, and keeps the targets in use from the device's `today`. It writes the caller's own row
-- only, by auth.uid(); the table's checks hold the values.
create function public.save_own_nutrition_targets(targets jsonb, today date)
returns void
language plpgsql
-- Takes the user's lock, which callers may not, as save_workout() does.
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  -- As save_workout() and the proposals, so that a change in between is never lost.
  perform public.lock_user_limits((select auth.uid()));
  insert into public.own_nutrition_targets (user_id, calories, protein_g, carbs_g, fat_g, in_use)
  values (
    (select auth.uid()),
    (targets ->> 'calories')::integer,
    (targets ->> 'proteinG')::integer,
    (targets ->> 'carbsG')::integer,
    (targets ->> 'fatG')::integer,
    (targets ->> 'inUse')::boolean
  )
  on conflict (user_id) do update set
    calories = excluded.calories,
    protein_g = excluded.protein_g,
    carbs_g = excluded.carbs_g,
    fat_g = excluded.fat_g,
    in_use = excluded.in_use,
    updated_at = now();
  perform public.refresh_day_nutrition_targets(save_own_nutrition_targets.today);
end;
$$;

-- Puts the calculated targets back in use, keeping the caller's own for next time, from `today`.
create function public.use_calculated_nutrition_targets(today date)
returns void
language plpgsql
-- As save_own_nutrition_targets().
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform public.lock_user_limits((select auth.uid()));
  update public.own_nutrition_targets o set in_use = false, updated_at = now()
  where o.user_id = (select auth.uid());
  perform public.refresh_day_nutrition_targets(use_calculated_nutrition_targets.today);
end;
$$;

-- Removes the caller's own targets, as before they set any, from `today`.
create function public.clear_own_nutrition_targets(today date)
returns void
language plpgsql
-- As save_own_nutrition_targets().
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform public.lock_user_limits((select auth.uid()));
  delete from public.own_nutrition_targets o where o.user_id = (select auth.uid());
  perform public.refresh_day_nutrition_targets(clear_own_nutrition_targets.today);
end;
$$;

-- As before (20261028180000_own_nutrition_targets.sql), and keeps the targets in use from the
-- device's `today` in the same call. Without `today`, as older apps send it, they refresh today
-- themselves.
drop function public.recalculate_nutrition_targets(
  public.goal_kind, numeric, numeric, public.activity_level
);
create function public.recalculate_nutrition_targets(
  goal public.goal_kind,
  target_weight_kg numeric,
  weekly_pace_kg numeric,
  activity_level public.activity_level,
  today date default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  changes_weight boolean := recalculate_nutrition_targets.goal in ('lose_fat', 'build_muscle');
  -- Rounded as goals stores them, so that the check below sees what is saved.
  target_kg numeric := round(recalculate_nutrition_targets.target_weight_kg, 1);
  pace_kg numeric := round(recalculate_nutrition_targets.weekly_pace_kg, 2);
  current_kg numeric := public.my_latest_weight_kg();
begin
  if changes_weight and (target_kg is null or pace_kg is null) then
    raise exception 'A goal that changes the weight needs a target and a pace'
      using errcode = '22023';
  end if;
  -- The same direction calculate_nutrition_targets() needs to apply a deficit or a surplus; it
  -- ignores a target on the wrong side, so it is refused here rather than saved to no effect.
  if (recalculate_nutrition_targets.goal = 'lose_fat' and target_kg >= current_kg)
    or (recalculate_nutrition_targets.goal = 'build_muscle' and target_kg <= current_kg) then
    raise exception 'The target weight does not suit the goal' using errcode = 'BB031';
  end if;

  update public.goals g
  set kind = recalculate_nutrition_targets.goal,
    target_weight_kg = case when changes_weight then target_kg end,
    weekly_pace_kg = case when changes_weight then pace_kg end
  where g.user_id = caller_id;
  if not found then
    raise exception 'No goal to change before the onboarding is saved' using errcode = 'P0002';
  end if;
  update public.profiles p
  set activity_level = recalculate_nutrition_targets.activity_level
  where p.user_id = caller_id;
  update public.own_nutrition_targets o set in_use = false where o.user_id = caller_id;
  if recalculate_nutrition_targets.today is not null then
    perform public.refresh_day_nutrition_targets(recalculate_nutrition_targets.today);
  end if;
end;
$$;

-- Logs the caller's weight on the device's `today`, or corrects it if it was logged then
-- already, and keeps the targets in use from then on, as the calculated ones follow the weight.
-- Runs as the caller, so the policies of weight_entries apply.
create function public.log_weight(weight_kg numeric, today date)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.weight_entries (user_id, weight_kg, measured_on)
  values ((select auth.uid()), log_weight.weight_kg, log_weight.today)
  on conflict (user_id, measured_on) do update set weight_kg = excluded.weight_kg;
  perform public.refresh_day_nutrition_targets(log_weight.today);
end;
$$;

-- Only an undone proposal clears the targets; the app keeps them and puts them out of use.
revoke all on function public.clear_own_nutrition_targets(date) from public, anon, authenticated;
revoke all on function public.recalculate_nutrition_targets(
  public.goal_kind, numeric, numeric, public.activity_level, date
) from public, anon;
grant execute on function public.recalculate_nutrition_targets(
  public.goal_kind, numeric, numeric, public.activity_level, date
) to authenticated;
revoke all on function public.log_weight(numeric, date) from public, anon;
grant execute on function public.log_weight(numeric, date) to authenticated;
revoke all on function public.save_own_nutrition_targets(jsonb, date) from public, anon;
grant execute on function public.save_own_nutrition_targets(jsonb, date) to authenticated;
revoke all on function public.use_calculated_nutrition_targets(date) from public, anon;
grant execute on function public.use_calculated_nutrition_targets(date) to authenticated;

-- A workout changed as a whole, or the user's own targets.
create type public.coach_proposal_kind as enum ('workout', 'targets');

-- What the user decides on a proposal.
create type public.coach_proposal_decision as enum ('apply', 'keep', 'undo');

-- Pending until the user decides: applied (and maybe undone again) or kept as it is.
create type public.coach_proposal_status as enum ('pending', 'applied', 'kept', 'undone');

create table public.coach_proposals (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  thread_id bigint not null references public.coach_threads (id) on delete cascade,
  kind public.coach_proposal_kind not null,
  -- What applying sets: the workout as save_workout() takes it, or the targets.
  change jsonb not null check (
    jsonb_typeof(change) = 'object' and octet_length(change::text) <= 16384
  ),
  -- What it replaces, as coach_proposal_state() reads it: the workout, or the own targets, null
  -- when there were none.
  before jsonb check (octet_length(before::text) <= 16384),
  -- What applying left, read the same way, which undoing needs to find as it was.
  after jsonb check (octet_length(after::text) <= 16384),
  status public.coach_proposal_status not null default 'pending',
  created_at timestamptz not null default now(),
  -- A proposal Bite made a week ago is out of date, whatever the user did meanwhile.
  expires_at timestamptz not null default now() + interval '7 days',
  decided_at timestamptz
);

create index coach_proposals_user_id on public.coach_proposals (user_id, created_at);
create index coach_proposals_thread_id on public.coach_proposals (thread_id);

-- The user reads their proposals, which the chat shows; only the functions below write them.
alter table public.coach_proposals enable row level security;

create policy "Users read their own proposals"
  on public.coach_proposals for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.coach_proposals from anon;
revoke insert, update, delete, truncate on public.coach_proposals from authenticated;

-- A workout of the caller's as save_workout() takes it, with its id; null when it is not theirs.
-- Plan slots are left out, as save_workout() drops them.
create function public.saved_workout(workout_id bigint)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', w.id,
    'name', w.name,
    'weekdays', to_jsonb(w.weekdays),
    'exercises', coalesce((
      select jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'exerciseId', e.exercise_id,
          'sets', e.sets,
          'restSeconds', e.rest_seconds,
          'target', jsonb_strip_nulls(jsonb_build_object(
            'reps', case when e.target_reps_min is not null then jsonb_build_object(
              'min', e.target_reps_min, 'max', e.target_reps_max
            ) end,
            'seconds', e.target_seconds,
            'meters', e.target_meters
          ))
        ))
        order by e.position
      )
      from public.workout_exercises e
      where e.workout_id = w.id
    ), '[]'::jsonb)
  )
  from public.workouts w
  where w.id = saved_workout.workout_id and w.user_id = (select auth.uid());
$$;

-- What a proposal of `kind` would replace now: the workout `change` names, or the caller's own
-- targets with whether they are in use, null when they have none.
create function public.coach_proposal_state(kind public.coach_proposal_kind, change jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case kind
    when 'workout' then public.saved_workout((change ->> 'id')::bigint)
    when 'targets' then (
      select jsonb_build_object(
        'calories', o.calories,
        'proteinG', o.protein_g,
        'carbsG', o.carbs_g,
        'fatG', o.fat_g,
        'inUse', o.in_use
      )
      from public.own_nutrition_targets o
      where o.user_id = (select auth.uid())
    )
  end;
$$;

-- Refuses targets under the caller's calorie floor (ADR 0053), the midpoint without a sex, as the
-- targets keep to.
create function public.check_coach_targets(change jsonb)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if (change ->> 'calories')::integer < coalesce(
    (select public.calorie_floor(p) from public.profiles p where p.user_id = (select auth.uid())),
    public.calorie_floor(null::public.sex)
  ) then
    raise exception 'Targets below the calorie floor' using errcode = 'BB037';
  end if;
end;
$$;

-- Applies `change` of `kind` for the caller from `today`, through the app's own functions.
create function public.apply_coach_change(kind public.coach_proposal_kind, change jsonb, today date)
returns void
language plpgsql
set search_path = ''
as $$
begin
  case kind
    when 'workout' then perform public.save_workout(change, today);
    when 'targets' then
      if change is null then
        perform public.clear_own_nutrition_targets(today);
      else
        perform public.save_own_nutrition_targets(change, today);
      end if;
  end case;
end;
$$;

-- Proposes `change` of `kind` in the caller's `thread_id`, keeping what it would replace, and
-- gives its id. It must apply as it is: it is tried on the device's `today` and rolled back, so
-- that the checks of save_workout() and of the targets refuse it now, with their own errors,
-- rather than when the user taps Apply. A user has at most 20 pending, and makes at most 100 a
-- day. Bite's tools call it as the user.
create function public.propose_coach_change(
  thread_id bigint,
  kind public.coach_proposal_kind,
  change jsonb,
  today date
)
returns bigint
language plpgsql
-- Writes proposals, which callers may only read.
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  before jsonb;
  proposed_id bigint;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform public.lock_user_limits(caller_id);
  if not exists (
    select 1 from public.coach_threads t
    where t.id = propose_coach_change.thread_id and t.user_id = caller_id
  ) then
    raise exception 'Thread not found' using errcode = 'P0002';
  end if;
  if (
    select count(*) from public.coach_proposals p
    where p.user_id = caller_id and p.status = 'pending' and p.expires_at > now()
  ) >= 20 or (
    select count(*) from public.coach_proposals p
    where p.user_id = caller_id and p.created_at > now() - interval '1 day'
  ) >= 100 then
    raise exception 'Too many proposals' using errcode = 'BB038';
  end if;

  case kind
    when 'workout' then
      -- A change names every field, so that one left out never empties it.
      if not coalesce(
        change ? 'id' and change ? 'name' and jsonb_typeof(change -> 'weekdays') = 'array'
          and jsonb_typeof(change -> 'exercises') = 'array',
        false
      ) then
        raise exception 'A workout change needs its id, name, weekdays and exercises'
          using errcode = '22023';
      end if;
    when 'targets' then
      if not (change ? 'calories' and change ? 'proteinG' and change ? 'carbsG' and change ? 'fatG') then
        raise exception 'A targets change needs calories, protein, carbs and fat'
          using errcode = '22023';
      end if;
      change := change || '{"inUse": true}';
      perform public.check_coach_targets(change);
  end case;

  before := public.coach_proposal_state(kind, change);
  if kind = 'workout' and before is null then
    raise exception 'Workout not found' using errcode = 'BB006';
  end if;

  -- Tried, so that the real functions' checks refuse it with their own errors rather than copies
  -- of them here, and rolled back on purpose by the error only this block catches. Nothing but
  -- BBTRY may be caught here, or a tried change would be kept.
  begin
    perform public.apply_coach_change(kind, change, propose_coach_change.today);
    raise exception 'Tried' using errcode = 'BBTRY';
  exception when sqlstate 'BBTRY' then
    null;
  end;

  insert into public.coach_proposals (user_id, thread_id, kind, change, before)
  values (caller_id, propose_coach_change.thread_id, kind, change, before)
  returning id into proposed_id;
  return proposed_id;
end;
$$;

-- Decides the caller's proposal `proposal_id`: `apply` it, `keep` things as they are, or `undo`
-- it once applied, with the device's `today` for the plan (ADR 0041) and the day's targets (ADR
-- 0040). Applying needs what the proposal replaces to be as Bite saw it, and undoing what it set to
-- be as it left it, so that a change made meanwhile is never overwritten.
create function public.decide_coach_proposal(
  proposal_id bigint,
  decision public.coach_proposal_decision,
  today date
)
returns public.coach_proposal_status
language plpgsql
-- Writes proposals, which callers may only read. The changes run as the owner, through
-- save_workout() and save_own_nutrition_targets(), which keep to the caller's own rows by
-- auth.uid() themselves, past the tables' policies.
security definer
set search_path = ''
as $$
declare
  proposal public.coach_proposals;
begin
  -- The user's lock first, as save_workout() takes it, then the workout's row, so that nothing
  -- changes between the check and the change.
  perform public.lock_user_limits((select auth.uid()));
  select * into proposal from public.coach_proposals p
  where p.id = decide_coach_proposal.proposal_id and p.user_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'Proposal not found' using errcode = 'P0002';
  end if;
  -- recalculate_nutrition_targets() changes the targets without the user's lock, so their row is
  -- locked too.
  case proposal.kind
    when 'workout' then
      perform 1 from public.workouts w
      where w.id = (proposal.change ->> 'id')::bigint and w.user_id = proposal.user_id
      for update;
    when 'targets' then
      perform 1 from public.own_nutrition_targets o where o.user_id = proposal.user_id for update;
  end case;

  case decision
    when 'keep' then
      if proposal.status <> 'pending' then
        raise exception 'Proposal already decided' using errcode = 'BB036';
      end if;
      proposal.status := 'kept';
    when 'apply' then
      if proposal.status <> 'pending' or proposal.expires_at <= now() then
        raise exception 'Proposal already decided or out of date' using errcode = 'BB036';
      end if;
      if public.coach_proposal_state(proposal.kind, proposal.change)
        is distinct from proposal.before then
        raise exception 'Changed since the proposal' using errcode = 'BB035';
      end if;
      -- The floor may have risen since, as with a sex set meanwhile.
      if proposal.kind = 'targets' then
        perform public.check_coach_targets(proposal.change);
      end if;
      perform public.apply_coach_change(proposal.kind, proposal.change, decide_coach_proposal.today);
      proposal.after := public.coach_proposal_state(proposal.kind, proposal.change);
      proposal.status := 'applied';
    when 'undo' then
      if proposal.status <> 'applied' then
        raise exception 'Proposal not applied' using errcode = 'BB036';
      end if;
      if public.coach_proposal_state(proposal.kind, proposal.change)
        is distinct from proposal.after then
        raise exception 'Changed since the proposal was applied' using errcode = 'BB035';
      end if;
      perform public.apply_coach_change(proposal.kind, proposal.before, decide_coach_proposal.today);
      proposal.status := 'undone';
  end case;

  update public.coach_proposals p
  set status = proposal.status, after = proposal.after, decided_at = now()
  where p.id = proposal.id;
  return proposal.status;
end;
$$;

-- The helpers run only inside the two functions above.
revoke all on function public.saved_workout(bigint) from public, anon, authenticated;
revoke all on function public.coach_proposal_state(public.coach_proposal_kind, jsonb)
  from public, anon, authenticated;
revoke all on function public.check_coach_targets(jsonb) from public, anon, authenticated;
revoke all on function public.apply_coach_change(public.coach_proposal_kind, jsonb, date)
  from public, anon, authenticated;
revoke all on function public.propose_coach_change(bigint, public.coach_proposal_kind, jsonb, date)
  from public, anon;
grant execute on function public.propose_coach_change(bigint, public.coach_proposal_kind, jsonb, date)
  to authenticated;
revoke all on function public.decide_coach_proposal(bigint, public.coach_proposal_decision, date)
  from public, anon;
grant execute on function public.decide_coach_proposal(bigint, public.coach_proposal_decision, date)
  to authenticated;
