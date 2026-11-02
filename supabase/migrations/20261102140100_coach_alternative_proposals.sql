-- Bite's proposals for temporary and lasting changes to the plan (#397, ADR 0075): a change to one
-- or more workouts at once, each with exercises swapped, removed and added; a new alternative of a
-- workout (ADR 0061), made from the one in use with such changes and put in use; and a switch to
-- another alternative, as when the user is better again. Each is applied, kept as it is or undone
-- as Bite's other proposals are (ADR 0058): only while what it replaces, or what applying left, is
-- still so.
--
-- New error codes:
--   BB049  an alternative of that name is the workout's already
--   BB050  the alternative to switch to is in use already

-- A workout's alternatives as a proposal sees them: the workout as saved_workout() reads it, and
-- each alternative, in order, with its exercises (none for the one in use, which are the
-- workout's); null when the workout is not the caller's.
create function public.coach_alternatives_state(workout_id bigint)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'workout', w.workout,
    'alternatives', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'position', a.position,
          'name', a.name,
          'inUse', a.in_use,
          'exercises', a.exercises
        )
        order by a.position
      )
      from public.workout_alternatives a
      where a.workout_id = coach_alternatives_state.workout_id
    ), '[]'::jsonb)
  )
  from (select public.saved_workout(coach_alternatives_state.workout_id) as workout) w
  where w.workout is not null;
$$;

-- The exercises of `workout`, as saved_workout() reads it, after `edit`: its `swaps` each put an
-- exercise (`with`) in the place of one (`replace`) with its `sets` and `target`, its `remove` takes
-- exercises out, and its `add` puts new ones at the end, each with `exerciseId`, `sets` and
-- `target`, and 90 s of rest. What it names must match the workout as it is, so that the card
-- shows what applying does: an exercise to replace or remove that is not in it (BB039), or one
-- changed twice, an exercise put in that is in it already, or one in it twice that is changed
-- (BB040), is refused. An edit changes something (22023).
create function public.edited_workout_exercises(workout jsonb, edit jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  swaps jsonb := coalesce(edit -> 'swaps', '[]');
  removed text[];
  added jsonb := coalesce(edit -> 'add', '[]');
  present text[];
  replaced text[];
  touched text[];
  incoming text[];
begin
  if jsonb_typeof(swaps) <> 'array' or jsonb_typeof(added) <> 'array'
    or jsonb_typeof(coalesce(edit -> 'remove', '[]')) <> 'array' then
    raise exception 'Swaps, removals and additions are lists' using errcode = '22023';
  end if;
  removed := array(select jsonb_array_elements_text(coalesce(edit -> 'remove', '[]')));
  if jsonb_array_length(swaps) + cardinality(removed) + jsonb_array_length(added) = 0 then
    raise exception 'An edit changes something' using errcode = '22023';
  end if;

  present := array(select e ->> 'exerciseId' from jsonb_array_elements(workout -> 'exercises') e);
  replaced := array(select s ->> 'replace' from jsonb_array_elements(swaps) s);
  touched := replaced || removed;
  incoming := array(select s ->> 'with' from jsonb_array_elements(swaps) s)
    || array(select a ->> 'exerciseId' from jsonb_array_elements(added) a);
  if not touched <@ present then
    raise exception 'An exercise to replace or remove is not in the workout' using errcode = 'BB039';
  end if;
  if cardinality(touched) <> (select count(distinct t) from unnest(touched) t)
    or cardinality(incoming) <> (select count(distinct i) from unnest(incoming) i)
    or exists (
      select 1 from unnest(present) p where p = any (touched) group by p having count(*) > 1
    )
    -- What comes in is not in the workout as it stays, nor one taken out.
    or exists (select 1 from unnest(incoming) i where i = any (present)) then
    raise exception 'Changes overlap' using errcode = 'BB040';
  end if;

  return coalesce((
    select jsonb_agg(item order by position)
    from (
      select
        case when swap.value is null then e.value
          else e.value || jsonb_build_object(
            'exerciseId', swap.value ->> 'with',
            'sets', swap.value -> 'sets',
            'target', swap.value -> 'target'
          )
        end as item,
        e.ordinality as position
      from jsonb_array_elements(workout -> 'exercises') with ordinality e
      left join lateral (
        select s.value from jsonb_array_elements(swaps) s
        where s.value ->> 'replace' = e.value ->> 'exerciseId'
      ) swap on true
      where not (e.value ->> 'exerciseId' = any (removed))
      union all
      select
        jsonb_build_object(
          'exerciseId', a.value ->> 'exerciseId',
          'sets', a.value -> 'sets',
          'restSeconds', 90,
          'target', a.value -> 'target'
        ),
        1000 + a.ordinality
      from jsonb_array_elements(added) with ordinality a
    ) items
  ), '[]'::jsonb);
end;
$$;

-- As before (20261031200100_food_log_proposals.sql), and the new kinds: the workouts a change to
-- several names, in its order, null if one of them is not the caller's; or the alternatives of
-- the workout an alternative or a switch is for.
create or replace function public.coach_proposal_state(
  kind public.coach_proposal_kind,
  change jsonb
)
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
    when 'food_log' then public.food_log_entries(public.food_log_entry_ids(change))
    when 'workouts' then (
      select case when bool_and(saved is not null)
        then jsonb_build_object('workouts', jsonb_agg(saved order by n)) end
      from (
        select public.saved_workout((w ->> 'id')::bigint) as saved, n
        from jsonb_array_elements(change -> 'workouts') with ordinality as x(w, n)
      ) s
    )
    when 'alternative' then public.coach_alternatives_state((change ->> 'workoutId')::bigint)
    when 'alternative_switch' then
      public.coach_alternatives_state((change ->> 'workoutId')::bigint)
  end;
$$;

-- As before, and the new kinds: each workout of a change to several saved; a new alternative added
-- and put in use, the one in use named `currentName` when it had no name, as when the workout had
-- no alternatives; and a switch, through use_workout_alternative().
create or replace function public.apply_coach_change(
  kind public.coach_proposal_kind,
  change jsonb,
  today date
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  workout jsonb;
  added_id bigint;
  current_id bigint;
begin
  case kind
    when 'workout' then perform public.save_workout(change, today);
    when 'targets' then
      if change is null then
        perform public.clear_own_nutrition_targets(today);
      else
        perform public.save_own_nutrition_targets(change, today);
      end if;
    when 'food_log' then perform public.apply_food_log_change(change);
    when 'workouts' then
      for workout in select w from jsonb_array_elements(change -> 'workouts') w loop
        perform public.save_workout(workout, today);
      end loop;
    when 'alternative' then
      added_id := public.add_workout_alternative(
        (change ->> 'workoutId')::bigint, today, change ->> 'name', change -> 'exercises'
      );
      select a.id into current_id from public.workout_alternatives a
      where a.workout_id = (change ->> 'workoutId')::bigint and a.in_use and a.name is null;
      if current_id is not null and nullif(btrim(change ->> 'currentName'), '') is not null then
        perform public.rename_workout_alternative(current_id, change ->> 'currentName');
      end if;
      perform public.use_workout_alternative(added_id, today);
    when 'alternative_switch' then
      perform public.use_workout_alternative((change ->> 'alternativeId')::bigint, today);
  end case;
end;
$$;

-- The id of the alternative in use in `state`, as coach_alternatives_state() reads it.
create function public.alternative_in_use(state jsonb)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select (a ->> 'id')::bigint from jsonb_array_elements(state -> 'alternatives') a
  where (a ->> 'inUse')::boolean;
$$;

-- Undoes an applied `change` of `kind`, putting back what `before` holds, with what applying left
-- (`after`): as before (20261031200100_food_log_proposals.sql), and the new kinds. A new
-- alternative goes again, after the one in use before is put back in use, unnamed again if it was
-- named for it; the first one of a workout that had none, added with it, goes with it. A switch
-- puts the one in use before back in use.
drop function public.undo_coach_change(public.coach_proposal_kind, jsonb, jsonb, date);
create function public.undo_coach_change(
  kind public.coach_proposal_kind,
  change jsonb,
  before jsonb,
  after jsonb,
  today date
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  previous_id bigint;
begin
  case kind
    when 'food_log' then perform public.undo_food_log_change(change, before);
    when 'alternative' then
      -- Without alternatives before, the one in use then is the first of them now.
      previous_id := coalesce(
        public.alternative_in_use(before),
        (select (a ->> 'id')::bigint from jsonb_array_elements(after -> 'alternatives') a
          where (a ->> 'position')::integer = 1)
      );
      perform public.use_workout_alternative(previous_id, today);
      if exists (
        select 1 from jsonb_array_elements(before -> 'alternatives') a
        where (a ->> 'id')::bigint = previous_id and a ->> 'name' is null
      ) then
        perform public.rename_workout_alternative(previous_id, '');
      end if;
      perform public.delete_workout_alternative(public.alternative_in_use(after));
    when 'alternative_switch' then
      perform public.use_workout_alternative(public.alternative_in_use(before), today);
    else perform public.apply_coach_change(kind, before, today);
  end case;
end;
$$;

-- As before, checking the new kinds: a change to several workouts names 1 to 3 different ones,
-- each whole; an alternative names its workout, its name and exercises; a switch its workout and
-- alternative.
create or replace function public.propose_coach_change(
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
      if not public.is_whole_workout(change) then
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
    when 'food_log' then
      change := public.food_log_change(change);
    when 'workouts' then
      if not coalesce(
        jsonb_typeof(change -> 'workouts') = 'array'
          and jsonb_array_length(change -> 'workouts') between 1 and 3
          and (
            select bool_and(public.is_whole_workout(w)) and count(distinct w ->> 'id') = count(*)
            from jsonb_array_elements(change -> 'workouts') w
          ),
        false
      ) then
        raise exception 'A change to workouts names 1 to 3 different ones, each whole'
          using errcode = '22023';
      end if;
    when 'alternative' then
      if not coalesce(
        change ? 'workoutId' and jsonb_typeof(change -> 'name') = 'string'
          and jsonb_typeof(change -> 'exercises') = 'array'
          and jsonb_array_length(change -> 'exercises') > 0,
        false
      ) then
        raise exception 'An alternative needs its workout, name and exercises'
          using errcode = '22023';
      end if;
    when 'alternative_switch' then
      if not (change ? 'workoutId' and change ? 'alternativeId') then
        raise exception 'A switch needs its workout and alternative' using errcode = '22023';
      end if;
  end case;

  before := public.coach_proposal_state(kind, change);
  if kind in ('workout', 'workouts', 'alternative', 'alternative_switch') and before is null then
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

-- Whether `workout` names every field a workout change needs.
create function public.is_whole_workout(workout jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    workout ? 'id' and workout ? 'name' and jsonb_typeof(workout -> 'weekdays') = 'array'
      and jsonb_typeof(workout -> 'exercises') = 'array',
    false
  );
$$;

-- As before, locking the workouts of the new kinds, and undoing with what applying left.
create or replace function public.decide_coach_proposal(
  proposal_id bigint,
  decision public.coach_proposal_decision,
  today date
)
returns public.coach_proposal_status
language plpgsql
-- Writes proposals, which callers may only read. The changes run as the owner, through
-- save_workout(), save_own_nutrition_targets(), the food log's and the alternatives' functions,
-- which keep to the caller's own rows by auth.uid() themselves, past the tables' policies.
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
  -- recalculate_nutrition_targets() changes the targets without the user's lock, and the app
  -- changes entries without it, so their rows are locked too.
  case proposal.kind
    when 'workout' then
      perform 1 from public.workouts w
      where w.id = (proposal.change ->> 'id')::bigint and w.user_id = proposal.user_id
      for update;
    when 'workouts' then
      perform 1 from public.workouts w
      where w.id in (
        select (x ->> 'id')::bigint from jsonb_array_elements(proposal.change -> 'workouts') x
      ) and w.user_id = proposal.user_id
      order by w.id
      for update;
    when 'alternative', 'alternative_switch' then
      perform 1 from public.workouts w
      where w.id = (proposal.change ->> 'workoutId')::bigint and w.user_id = proposal.user_id
      for update;
    when 'targets' then
      perform 1 from public.own_nutrition_targets o where o.user_id = proposal.user_id for update;
    when 'food_log' then
      perform 1 from public.meal_entries e
      where e.id = any (public.food_log_entry_ids(proposal.change)) and e.user_id = proposal.user_id
      for update;
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
      perform public.undo_coach_change(
        proposal.kind, proposal.change, proposal.before, proposal.after, decide_coach_proposal.today
      );
      proposal.status := 'undone';
  end case;

  update public.coach_proposals p
  set status = proposal.status, after = proposal.after, decided_at = now()
  where p.id = proposal.id;
  return proposal.status;
end;
$$;

-- Proposes `edits` to 1 to 3 of the caller's workouts in one card, each naming its `workoutId`
-- and the `swaps`, `remove` and `add` of edited_workout_exercises(); the rest of each workout stays
-- as it is. Gives the proposal's id, as propose_coach_change() does.
create function public.propose_coach_workouts(thread_id bigint, edits jsonb, today date)
returns bigint
language plpgsql
-- Reads the workouts with saved_workout(), which callers may not.
security definer
set search_path = ''
as $$
declare
  workouts jsonb := '[]';
  edit jsonb;
  workout jsonb;
begin
  if edits is null or jsonb_typeof(edits) <> 'array' or jsonb_array_length(edits) = 0 then
    raise exception 'Edits are a list of at least one' using errcode = '22023';
  end if;
  for edit in select e from jsonb_array_elements(edits) e loop
    workout := public.saved_workout((edit ->> 'workoutId')::bigint);
    if workout is null then
      raise exception 'Workout not found' using errcode = 'BB006';
    end if;
    workouts := workouts || jsonb_build_array(
      workout || jsonb_build_object('exercises', public.edited_workout_exercises(workout, edit))
    );
  end loop;
  return public.propose_coach_change(
    propose_coach_workouts.thread_id,
    'workouts',
    jsonb_build_object('workouts', workouts),
    propose_coach_workouts.today
  );
end;
$$;

-- Proposes a new alternative of the caller's `workout_id`, named `name`: the one in use with
-- `edit` (edited_workout_exercises()), put in use when applied. The one in use is named
-- `current_name` then, if it has no name, as when the workout has no alternatives yet. A name an
-- alternative of the workout has already is refused (BB049), so that Bite switches to that one
-- instead. Gives the proposal's id, as propose_coach_change() does.
create function public.propose_coach_alternative(
  thread_id bigint,
  workout_id bigint,
  name text,
  current_name text,
  edit jsonb,
  today date
)
returns bigint
language plpgsql
-- Reads the workout with saved_workout(), which callers may not.
security definer
set search_path = ''
as $$
declare
  workout jsonb := public.saved_workout(propose_coach_alternative.workout_id);
begin
  if workout is null then
    raise exception 'Workout not found' using errcode = 'BB006';
  end if;
  if exists (
    select 1 from public.workout_alternatives a
    where a.workout_id = propose_coach_alternative.workout_id
      and lower(a.name) = lower(btrim(propose_coach_alternative.name))
  ) then
    raise exception 'An alternative of that name exists' using errcode = 'BB049';
  end if;
  return public.propose_coach_change(
    propose_coach_alternative.thread_id,
    'alternative',
    jsonb_strip_nulls(jsonb_build_object(
      'workoutId', propose_coach_alternative.workout_id,
      'name', btrim(propose_coach_alternative.name),
      'currentName', nullif(btrim(propose_coach_alternative.current_name), ''),
      'exercises', public.edited_workout_exercises(workout, edit)
    )),
    propose_coach_alternative.today
  );
end;
$$;

-- Proposes putting the caller's `alternative_id` in use, which must not be in use already
-- (BB050). Gives the proposal's id, as propose_coach_change() does.
create function public.propose_coach_alternative_switch(
  thread_id bigint,
  alternative_id bigint,
  today date
)
returns bigint
language plpgsql
-- Writes proposals through propose_coach_change().
security definer
set search_path = ''
as $$
declare
  alternative public.workout_alternatives;
begin
  select * into alternative from public.workout_alternatives a
  where a.id = propose_coach_alternative_switch.alternative_id
    and a.user_id = (select auth.uid());
  if not found then
    raise exception 'Alternative not found' using errcode = 'P0002';
  end if;
  if alternative.in_use then
    raise exception 'The alternative is in use already' using errcode = 'BB050';
  end if;
  return public.propose_coach_change(
    propose_coach_alternative_switch.thread_id,
    'alternative_switch',
    jsonb_build_object('workoutId', alternative.workout_id, 'alternativeId', alternative.id),
    propose_coach_alternative_switch.today
  );
end;
$$;

-- The helpers run only inside the functions above; Bite's tools call the three proposers as the
-- user.
revoke all on function public.coach_alternatives_state(bigint) from public, anon, authenticated;
revoke all on function public.edited_workout_exercises(jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.alternative_in_use(jsonb) from public, anon, authenticated;
revoke all on function public.is_whole_workout(jsonb) from public, anon, authenticated;
revoke all on function public.undo_coach_change(
  public.coach_proposal_kind, jsonb, jsonb, jsonb, date
) from public, anon, authenticated;
revoke all on function public.propose_coach_workouts(bigint, jsonb, date) from public, anon;
grant execute on function public.propose_coach_workouts(bigint, jsonb, date) to authenticated;
revoke all on function public.propose_coach_alternative(bigint, bigint, text, text, jsonb, date)
  from public, anon;
grant execute on function public.propose_coach_alternative(bigint, bigint, text, text, jsonb, date)
  to authenticated;
revoke all on function public.propose_coach_alternative_switch(bigint, bigint, date)
  from public, anon;
grant execute on function public.propose_coach_alternative_switch(bigint, bigint, date)
  to authenticated;
