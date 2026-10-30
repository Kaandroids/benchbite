-- Changes Bite proposes, which the user applies, keeps as they are, or undoes (#297, ADR 0058).
-- Bite never changes data itself: its tools write a proposal, the chat shows it as a card, and
-- only the user's tap applies it, through the same functions the app uses. A proposal keeps what
-- it replaces, so that it applies only to what Bite saw and is undone to what was there.

-- A workout changed as a whole, or the user's own targets.
create type public.coach_proposal_kind as enum ('workout', 'targets');

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

create index coach_proposals_user_id on public.coach_proposals (user_id);
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
    else (
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

-- Proposes `change` of `kind` in the caller's `thread_id`, keeping what it would replace, and
-- gives its id. A workout must be the caller's; targets may not ask for less than the caller's
-- calorie floor (ADR 0053). Bite's tools call it as the user.
create function public.propose_coach_change(
  thread_id bigint,
  kind public.coach_proposal_kind,
  change jsonb
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
  floor integer;
  proposed_id bigint;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.coach_threads t
    where t.id = propose_coach_change.thread_id and t.user_id = caller_id
  ) then
    raise exception 'Thread not found' using errcode = 'P0002';
  end if;

  before := public.coach_proposal_state(kind, change);
  if kind = 'workout' then
    if before is null then
      raise exception 'Workout not found' using errcode = 'BB006';
    end if;
  else
    select public.calorie_floor(p) into floor from public.profiles p where p.user_id = caller_id;
    if (change ->> 'calories')::integer is null
      or (change ->> 'calories')::integer < coalesce(floor, 1500) then
      raise exception 'Targets below the calorie floor' using errcode = 'BB037';
    end if;
  end if;

  insert into public.coach_proposals (user_id, thread_id, kind, change, before)
  values (caller_id, propose_coach_change.thread_id, kind, change, before)
  returning id into proposed_id;
  return proposed_id;
end;
$$;

-- Sets the caller's own targets to `targets`, in use, or as they were: none when `targets` is
-- null.
create function public.set_own_targets(targets jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if targets is null then
    delete from public.own_nutrition_targets o where o.user_id = (select auth.uid());
    return;
  end if;
  insert into public.own_nutrition_targets (user_id, calories, protein_g, carbs_g, fat_g, in_use)
  values (
    (select auth.uid()),
    (targets ->> 'calories')::integer,
    (targets ->> 'proteinG')::integer,
    (targets ->> 'carbsG')::integer,
    (targets ->> 'fatG')::integer,
    coalesce((targets ->> 'inUse')::boolean, true)
  )
  on conflict (user_id) do update set
    calories = excluded.calories,
    protein_g = excluded.protein_g,
    carbs_g = excluded.carbs_g,
    fat_g = excluded.fat_g,
    in_use = excluded.in_use,
    updated_at = now();
end;
$$;

-- Decides the caller's proposal `proposal_id`: `apply` it, `keep` things as they are, or `undo`
-- it once applied, with the device's `today` for the plan (ADR 0041). Applying needs what the
-- proposal replaces to be as Bite saw it, and undoing what it set to be as it left it, so that a
-- change made meanwhile is never overwritten.
create function public.decide_coach_proposal(proposal_id bigint, decision text, today date)
returns public.coach_proposal_status
language plpgsql
-- Writes proposals, which callers may only read; the changes themselves go through the
-- caller's own rights below.
security definer
set search_path = ''
as $$
declare
  proposal public.coach_proposals;
begin
  select * into proposal from public.coach_proposals p
  where p.id = decide_coach_proposal.proposal_id and p.user_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'Proposal not found' using errcode = 'P0002';
  end if;

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
      if public.coach_proposal_state(proposal.kind, proposal.change) is distinct from proposal.before then
        raise exception 'Changed since the proposal' using errcode = 'BB035';
      end if;
      if proposal.kind = 'workout' then
        perform public.save_workout(proposal.change, decide_coach_proposal.today);
      else
        perform public.set_own_targets(proposal.change || '{"inUse": true}');
      end if;
      proposal.after := public.coach_proposal_state(proposal.kind, proposal.change);
      proposal.status := 'applied';
    when 'undo' then
      if proposal.status <> 'applied' then
        raise exception 'Proposal not applied' using errcode = 'BB036';
      end if;
      if public.coach_proposal_state(proposal.kind, proposal.change) is distinct from proposal.after then
        raise exception 'Changed since the proposal was applied' using errcode = 'BB035';
      end if;
      if proposal.kind = 'workout' then
        perform public.save_workout(proposal.before, decide_coach_proposal.today);
      else
        perform public.set_own_targets(proposal.before);
      end if;
      proposal.status := 'undone';
    else
      raise exception 'Unknown decision %', decision using errcode = '22023';
  end case;

  update public.coach_proposals p
  set status = proposal.status, after = proposal.after, decided_at = now()
  where p.id = proposal.id;
  return proposal.status;
end;
$$;

revoke all on function public.saved_workout(bigint) from public, anon;
grant execute on function public.saved_workout(bigint) to authenticated;
revoke all on function public.coach_proposal_state(public.coach_proposal_kind, jsonb)
  from public, anon;
grant execute on function public.coach_proposal_state(public.coach_proposal_kind, jsonb)
  to authenticated;
revoke all on function public.propose_coach_change(bigint, public.coach_proposal_kind, jsonb)
  from public, anon;
grant execute on function public.propose_coach_change(bigint, public.coach_proposal_kind, jsonb)
  to authenticated;
revoke all on function public.set_own_targets(jsonb) from public, anon, authenticated;
revoke all on function public.decide_coach_proposal(bigint, text, date) from public, anon;
grant execute on function public.decide_coach_proposal(bigint, text, date) to authenticated;
