-- Bite proposes changes to a note and archiving one, which the user applies (#534, ADR 0133),
-- where its tools changed notes themselves (ADR 0071): text in a photo could steer Bite into
-- changing them. A new note is still saved, or asked for, as before. The proposals keep the note as
-- it was, so that one applies only to what Bite saw and is undone to it.

-- What a proposal of `kind` would replace now, as before, and for a note the caller's note `change`
-- names, by its id, with whether it is archived; null for one waiting for their yes or not theirs.
create or replace function public.coach_proposal_state(
  kind public.coach_proposal_kind,
  change jsonb
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case
    when kind = 'workout' then public.saved_workout((change ->> 'id')::bigint)
    when kind = 'targets' then (
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
    when kind = 'food_log' then public.food_log_entries(public.food_log_entry_ids(change))
    when kind = 'workouts' then (
      select case when bool_and(saved is not null)
        then jsonb_build_object('workouts', jsonb_agg(saved order by n)) end
      from (
        select public.saved_workout((w ->> 'id')::bigint) as saved, n
        from jsonb_array_elements(change -> 'workouts') with ordinality as x(w, n)
      ) s
    )
    when kind in ('alternative', 'alternative_switch') then
      public.coach_alternatives_state((change ->> 'workoutId')::bigint)
    -- Named as a `note` change names it, the day to ask again even when there is none, so that
    -- undoing a change applies it as it was.
    when kind in ('note', 'note_archive') then (
      select jsonb_build_object(
        'id', n.id,
        'category', n.category,
        'text', n.text,
        'reviewOn', n.review_on,
        'archived', n.archived_at is not null
      )
      from public.coach_notes n
      where n.id = (change ->> 'id')::bigint and n.user_id = (select auth.uid()) and not n.asked
    )
  end;
$$;

-- As before, and changes a note: the fields `change` names, or archives it with why.
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
      if change ? 'currentName' then
        perform public.rename_workout_alternative(
          public.alternative_in_use(
            public.coach_alternatives_state((change ->> 'workoutId')::bigint)
          ),
          change ->> 'currentName'
        );
      end if;
      perform public.use_workout_alternative(added_id, today);
    when 'alternative_switch' then
      perform public.use_workout_alternative((change ->> 'alternativeId')::bigint, today);
    -- Only what the change names: a day to ask again given as null clears it.
    when 'note' then
      update public.coach_notes n
      set category = coalesce((change ->> 'category')::public.coach_note_category, n.category),
        text = coalesce(change ->> 'text', n.text),
        review_on = case when change ? 'reviewOn' then (change ->> 'reviewOn')::date else n.review_on end
      where n.id = (change ->> 'id')::bigint and n.user_id = (select auth.uid());
    when 'note_archive' then
      update public.coach_notes n
      set archived_at = now(), archive_reason = change ->> 'reason'
      where n.id = (change ->> 'id')::bigint and n.user_id = (select auth.uid());
  end case;
end;
$$;

-- As before, and puts an archived note back in use.
create or replace function public.undo_coach_change(
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
      previous_id := coalesce(
        public.alternative_in_use(before),
        (select (a ->> 'id')::bigint from jsonb_array_elements(after -> 'alternatives') a
          where not (a ->> 'inUse')::boolean)
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
    -- Back in use, as the user restores a past note in the notebook.
    when 'note_archive' then
      update public.coach_notes n
      set archived_at = null, archive_reason = null
      where n.id = (change ->> 'id')::bigint and n.user_id = (select auth.uid());
    -- A note's change too: what it replaces names every field it may change.
    else perform public.apply_coach_change(kind, before, today);
  end case;
end;
$$;

-- As before, checking the new kinds: a change to a note names its id and what to change, of its
-- category, text and day to ask again; archiving one names its id and why. Either needs a note of
-- the caller's in use (P0002). A change to a note keeps what the one it replaces changed and it
-- does not, so that a newer proposal never drops an earlier change the user has not applied.
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
  names text[];
  proposed_id bigint;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  -- A note's row before the user's lock, in the order archiving one in the notebook takes them,
  -- as check_coach_note_limit() takes the user's lock once the row is locked.
  if kind in ('note', 'note_archive') then
    perform 1 from public.coach_notes n
    where n.id = (change ->> 'id')::bigint and n.user_id = caller_id
    for update;
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
          and btrim(change ->> 'name') <> ''
          and coalesce(jsonb_typeof(change -> 'currentName'), 'null') in ('string', 'null')
          and jsonb_typeof(change -> 'exercises') = 'array'
          and jsonb_array_length(change -> 'exercises') > 0,
        false
      ) then
        raise exception 'An alternative needs its workout, name and exercises'
          using errcode = '22023';
      end if;
      change := jsonb_strip_nulls(change || jsonb_build_object(
        'name', btrim(change ->> 'name'),
        'currentName', nullif(btrim(change ->> 'currentName'), '')
      ));
    when 'alternative_switch' then
      if not (change ? 'workoutId' and change ? 'alternativeId') then
        raise exception 'A switch needs its workout and alternative' using errcode = '22023';
      end if;
    when 'note' then
      if not coalesce(
        jsonb_typeof(change -> 'id') = 'number'
          and (change ? 'category' or change ? 'text' or change ? 'reviewOn'),
        false
      ) then
        raise exception 'A note change needs its id and what to change' using errcode = '22023';
      end if;
      -- Only the fields it may change, so that nothing else is set on the note.
      change := jsonb_build_object('id', change -> 'id')
        || jsonb_strip_nulls(jsonb_build_object(
          'category', change -> 'category', 'text', change -> 'text'
        ))
        || case when change ? 'reviewOn'
          then jsonb_build_object('reviewOn', change -> 'reviewOn') else '{}' end;
      change := coalesce((
        select p.change from public.coach_proposals p
        where p.thread_id = propose_coach_change.thread_id
          and p.user_id = caller_id
          and p.kind = 'note'
          and p.status = 'pending'
          and p.expires_at > now()
          and p.change -> 'id' = propose_coach_change.change -> 'id'
        order by p.id desc
        limit 1
      ), '{}') || propose_coach_change.change;
    when 'note_archive' then
      if not coalesce(
        jsonb_typeof(change -> 'id') = 'number' and jsonb_typeof(change -> 'reason') = 'string',
        false
      ) then
        raise exception 'Archiving a note needs its id and why' using errcode = '22023';
      end if;
      change := jsonb_build_object('id', change -> 'id', 'reason', change -> 'reason');
  end case;

  before := public.coach_proposal_state(kind, change);
  if kind in ('workout', 'workouts', 'alternative', 'alternative_switch') and before is null then
    raise exception 'Workout not found' using errcode = 'BB006';
  end if;
  -- A note in use only: neither archived nor waiting for the user's yes.
  if kind in ('note', 'note_archive') and coalesce((before ->> 'archived')::boolean, true) then
    raise exception 'Note not found' using errcode = 'P0002';
  end if;

  if kind = 'alternative' then
    -- The one in use keeps a name it has.
    if exists (
      select 1 from jsonb_array_elements(before -> 'alternatives') a
      where (a ->> 'inUse')::boolean and a ->> 'name' is not null
    ) then
      change := change - 'currentName';
    end if;
    names := array(
      select lower(a ->> 'name') from jsonb_array_elements(before -> 'alternatives') a
      where a ->> 'name' is not null
    );
    if lower(change ->> 'name') = any (names)
      or lower(change ->> 'currentName') = any (names || lower(change ->> 'name')) then
      raise exception 'An alternative of that name exists' using errcode = 'BB049';
    end if;
  elsif kind = 'alternative_switch' then
    if not exists (
      select 1 from jsonb_array_elements(before -> 'alternatives') a
      where a -> 'id' = change -> 'alternativeId'
    ) then
      raise exception 'Alternative not found' using errcode = 'P0002';
    end if;
    if (change ->> 'alternativeId')::bigint = public.alternative_in_use(before) then
      raise exception 'The alternative is in use already' using errcode = 'BB050';
    end if;
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

-- As before, and locks the note a note's proposal changes, first, as the notebook changes notes
-- without the user's lock and archiving one takes it after the note's row.
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
  -- A note's row before the user's lock, as propose_coach_change() takes them.
  perform 1 from public.coach_notes n
  where n.id = (
      select (p.change ->> 'id')::bigint from public.coach_proposals p
      where p.id = decide_coach_proposal.proposal_id
        and p.user_id = (select auth.uid())
        and p.kind in ('note', 'note_archive')
    )
    and n.user_id = (select auth.uid())
  for update;
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
  perform 1 from public.workouts w
  where w.id = any (public.coach_proposal_workout_ids(proposal.kind, proposal.change))
    and w.user_id = proposal.user_id
  order by w.id
  for update;
  case proposal.kind
    when 'targets' then
      perform 1 from public.own_nutrition_targets o where o.user_id = proposal.user_id for update;
    when 'food_log' then
      perform 1 from public.meal_entries e
      where e.id = any (public.food_log_entry_ids(proposal.change)) and e.user_id = proposal.user_id
      for update;
    else null;
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

-- As before, and a newer proposal for a note replaces one pending for the same note in the thread.
create or replace function public.replace_coach_proposals()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.coach_proposals p
  set status = 'replaced', decided_at = now()
  where p.thread_id = new.thread_id
    and p.user_id = new.user_id
    and p.status = 'pending'
    and p.id <> new.id
    and (
      (
        (p.kind = new.kind or (p.kind in ('workout', 'workouts') and new.kind in ('workout', 'workouts')))
        and cardinality(public.coach_proposal_workout_ids(p.kind, p.change)) > 0
        and public.coach_proposal_workout_ids(p.kind, p.change)
          <@ public.coach_proposal_workout_ids(new.kind, new.change)
      )
      -- Or changes the same note, whether to change or archive it.
      or (
        p.kind in ('note', 'note_archive') and new.kind in ('note', 'note_archive')
        and p.change -> 'id' = new.change -> 'id'
      )
    );
  return null;
end;
$$;
