-- Changes to the food log Bite proposes, which the user applies, keeps as it is, or undoes (#299,
-- ADR 0068), as its other changes (ADR 0058): moving entries to another meal or day, changing their
-- grams, and removing them. A proposal keeps the entries as Bite saw them (`before`), so that it
-- applies only while they are still so, and as applying left them (`after`), so that it is undone
-- only while they are still so. Undoing a removal puts the entry back with the values it was logged
-- with, as restore_meal_entry() does, however long ago it was removed.
--
-- New error codes:
--   BB044  an entry to change is not the caller's
--   BB045  a proposal changes an entry twice

-- Puts a removed entry back as it was, with its id, time and copied values: what restore_meal_entry()
-- does once it has found the entry, and undoing a proposal's removal does with the entry the
-- proposal kept, `removed` named as removed_meal_entries names its columns. The day's checks still
-- apply. It takes JSON rather than the row, which would make it a column of removed_meal_entries
-- to PostgREST.
create function public.put_back_meal_entry(removed jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  entry public.removed_meal_entries := jsonb_populate_record(
    null::public.removed_meal_entries, removed
  );
begin
  -- Only for this insert, within this transaction.
  perform set_config('benchbite.restoring_meal_entry', 'on', true);
  insert into public.meal_entries (
    id, user_id, day, meal, food_id, custom_food_id, recipe_id, grams, portion_unit,
    portion_count, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, created_at
  )
  overriding system value
  values (
    entry.id, entry.user_id, entry.day, entry.meal, entry.food_id, entry.custom_food_id,
    entry.recipe_id, entry.grams, entry.portion_unit, entry.portion_count, entry.kcal_per_100g,
    entry.protein_per_100g, entry.carbs_per_100g, entry.fat_per_100g, entry.created_at
  );
  perform set_config('benchbite.restoring_meal_entry', 'off', true);
end;
$$;

revoke all on function public.put_back_meal_entry(jsonb) from public, anon, authenticated;

-- As before (20261028150000_recipes.sql), putting the entry back with put_back_meal_entry().
create or replace function public.restore_meal_entry(entry_id bigint)
returns void
language plpgsql
-- Reads the removed entries and writes the copied values, which callers cannot.
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  entry public.removed_meal_entries;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  delete from public.removed_meal_entries r
  where r.id = entry_id and r.user_id = caller_id and r.removed_at >= now() - interval '1 hour'
  returning * into entry;
  if not found then
    raise exception 'The entry cannot be restored' using errcode = 'BB023';
  end if;
  perform public.put_back_meal_entry(to_jsonb(entry));
end;
$$;

-- The ids of the entries a food log change names, in order.
create function public.food_log_entry_ids(change jsonb)
returns bigint[]
language sql
immutable
set search_path = ''
as $$
  select array(
    select (c.value ->> 'entryId')::bigint
    from jsonb_array_elements(change -> 'changes') c
    order by 1
  );
$$;

-- The caller's entries `entry_ids` as they are now, by id, with everything that puts one back as
-- it was, named as removed_meal_entries names it; those that are gone are left out.
create function public.food_log_entries(entry_ids bigint[])
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(e) order by e.id), '[]')
  from (
    select m.id, m.day, m.meal, m.food_id, m.custom_food_id, m.recipe_id, m.grams,
      m.portion_unit, m.portion_count, m.kcal_per_100g, m.protein_per_100g, m.carbs_per_100g,
      m.fat_per_100g, m.created_at
    from public.meal_entries m
    where m.id = any (food_log_entries.entry_ids) and m.user_id = (select auth.uid())
  ) e;
$$;

-- Whether `day` can still be logged: the server's today, the day after for the time zones, and the
-- days back to the last one closed to logging.
create function public.is_loggable_day(day date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select is_loggable_day.day between public.last_day_closed_to_logging() + 1 and current_date + 1;
$$;

revoke execute on function public.is_loggable_day(date) from public, anon;
grant execute on function public.is_loggable_day(date) to authenticated;

-- As before (20261029110000_streaks.sql), with the window checked by is_loggable_day().
create or replace function public.check_log_day()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_loggable_day(new.day) then
    raise exception 'Only today and the week before can be logged' using errcode = 'BB020';
  end if;
  return new;
end;
$$;

-- Refuses entries on a day that can no longer be logged, as check_log_day() refuses moving one
-- there, so that Bite changes only the days the user may change themselves (BB020).
create function public.check_food_log_days(entries jsonb)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if exists (
    select 1 from jsonb_array_elements(entries) e
    where not public.is_loggable_day((e.value ->> 'day')::date)
  ) then
    raise exception 'Only today and the week before can be logged' using errcode = 'BB020';
  end if;
end;
$$;

-- A food log change as a proposal keeps it, from `changes` as Bite gives them: up to 10, each
-- naming an entry of the caller's by `entryId` and either `remove: true` or what changes of its
-- `day`, `meal` and `grams`. What it leaves out stays as the entry has it now, and is filled in, so
-- that applying sets exactly what the card shows. A change that changes nothing, or one of another
-- shape, is refused (22023), as is an entry named twice (BB045) or not the caller's (BB044).
create function public.food_log_change(change jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  changes jsonb := change -> 'changes';
  entries jsonb;
  filled jsonb;
begin
  if jsonb_typeof(changes) is distinct from 'array'
    or jsonb_array_length(changes) not between 1 and 10
    or exists (
      select 1 from jsonb_array_elements(changes) c
      where jsonb_typeof(c.value) <> 'object'
        or jsonb_typeof(c.value -> 'entryId') is distinct from 'number'
        or c.value - array['entryId', 'day', 'meal', 'grams', 'remove'] <> '{}'
        or case when c.value ? 'remove'
          then c.value -> 'remove' <> 'true' or c.value ?| array['day', 'meal', 'grams']
          else not c.value ?| array['day', 'meal', 'grams']
        end
    ) then
    raise exception 'A food log change is a list of 1 to 10, each an entry to move, resize or remove'
      using errcode = '22023';
  end if;
  if (select count(distinct c.value -> 'entryId') from jsonb_array_elements(changes) c)
    <> jsonb_array_length(changes) then
    raise exception 'An entry is changed twice' using errcode = 'BB045';
  end if;

  entries := public.food_log_entries(public.food_log_entry_ids(change));
  if jsonb_array_length(entries) <> jsonb_array_length(changes) then
    raise exception 'Entry not found' using errcode = 'BB044';
  end if;

  filled := (
    select jsonb_agg(
      case when c.value ? 'remove'
        then jsonb_build_object('entryId', e.value -> 'id', 'remove', true)
        else jsonb_build_object(
          'entryId', e.value -> 'id',
          'day', coalesce((c.value ->> 'day')::date, (e.value ->> 'day')::date),
          'meal', coalesce((c.value ->> 'meal')::public.meal, (e.value ->> 'meal')::public.meal),
          -- As the entry keeps them.
          'grams', coalesce(round((c.value ->> 'grams')::numeric, 1), (e.value ->> 'grams')::numeric)
        )
      end
      order by c.ordinality
    )
    from jsonb_array_elements(changes) with ordinality c
    join jsonb_array_elements(entries) e on e.value -> 'id' = c.value -> 'entryId'
  );
  if exists (
    select 1 from jsonb_array_elements(filled) c
    join jsonb_array_elements(entries) e on e.value -> 'id' = c.value -> 'entryId'
    where not c.value ? 'remove'
      and c.value -> 'day' = e.value -> 'day'
      and c.value -> 'meal' = e.value -> 'meal'
      and (c.value ->> 'grams')::numeric = (e.value ->> 'grams')::numeric
  ) then
    raise exception 'A change changes nothing' using errcode = '22023';
  end if;
  return jsonb_build_object('changes', filled);
end;
$$;

-- Applies the caller's food log `change`, as food_log_change() gives it: moves and resizes the
-- entries, a new amount being grams rather than portions, and removes those it removes.
create function public.apply_food_log_change(change jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  c jsonb;
begin
  -- The days the entries are on; check_log_day() checks the days they move to.
  perform public.check_food_log_days(public.food_log_entries(public.food_log_entry_ids(change)));
  for c in select value from jsonb_array_elements(change -> 'changes') loop
    if c ? 'remove' then
      delete from public.meal_entries e
      where e.id = (c ->> 'entryId')::bigint and e.user_id = caller_id;
    else
      update public.meal_entries e
      set day = (c ->> 'day')::date,
        meal = (c ->> 'meal')::public.meal,
        portion_unit = case when e.grams = (c ->> 'grams')::numeric then e.portion_unit end,
        portion_count = case when e.grams = (c ->> 'grams')::numeric then e.portion_count end,
        grams = (c ->> 'grams')::numeric
      where e.id = (c ->> 'entryId')::bigint and e.user_id = caller_id;
    end if;
  end loop;
end;
$$;

-- Undoes the caller's applied food log `change`, putting each entry back as `before` holds it:
-- moved and resized back, and a removed one put back with the values it was logged with, its copy
-- among the removed entries dropped. One whose food or recipe was deleted since cannot come back
-- (BB035).
create function public.undo_food_log_change(change jsonb, before jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  c jsonb;
  was jsonb;
begin
  perform public.check_food_log_days(before);
  perform public.check_food_log_days(public.food_log_entries(public.food_log_entry_ids(change)));
  for c in select value from jsonb_array_elements(change -> 'changes') loop
    was := (
      select e.value from jsonb_array_elements(before) e where e.value -> 'id' = c -> 'entryId'
    );
    if c ? 'remove' then
      delete from public.removed_meal_entries r
      where r.id = (was ->> 'id')::bigint and r.user_id = caller_id;
      begin
        perform public.put_back_meal_entry(was || jsonb_build_object('user_id', caller_id));
      exception when foreign_key_violation then
        raise exception 'Changed since the proposal was applied' using errcode = 'BB035';
      end;
    else
      update public.meal_entries e
      set day = (was ->> 'day')::date,
        meal = (was ->> 'meal')::public.meal,
        grams = (was ->> 'grams')::numeric,
        portion_unit = (was ->> 'portion_unit')::public.portion_unit,
        portion_count = (was ->> 'portion_count')::numeric
      where e.id = (was ->> 'id')::bigint and e.user_id = caller_id;
    end if;
  end loop;
end;
$$;

-- As before (20261030230000_coach_proposals.sql), and the entries a food log change names.
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
  end;
$$;

-- As before, and a food log change.
create or replace function public.apply_coach_change(
  kind public.coach_proposal_kind,
  change jsonb,
  today date
)
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
    when 'food_log' then perform public.apply_food_log_change(change);
  end case;
end;
$$;

-- As before, and a food log change, which food_log_change() checks and fills in: it keeps the
-- entries as they are (`before`), and is tried as the others are, so that a day out of range
-- (BB020) or grams out of range (23514) are refused now.
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
    when 'food_log' then
      change := public.food_log_change(change);
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

-- As before, and a food log change: its entries are locked with the proposal, and undoing it puts
-- them back with undo_food_log_change(), as `before` holds them.
create or replace function public.decide_coach_proposal(
  proposal_id bigint,
  decision public.coach_proposal_decision,
  today date
)
returns public.coach_proposal_status
language plpgsql
-- Writes proposals, which callers may only read. The changes run as the owner, through
-- save_workout(), save_own_nutrition_targets() and the food log's functions, which keep to the
-- caller's own rows by auth.uid() themselves, past the tables' policies.
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
      if proposal.kind = 'food_log' then
        perform public.undo_food_log_change(proposal.change, proposal.before);
      else
        perform public.apply_coach_change(proposal.kind, proposal.before, decide_coach_proposal.today);
      end if;
      proposal.status := 'undone';
  end case;

  update public.coach_proposals p
  set status = proposal.status, after = proposal.after, decided_at = now()
  where p.id = proposal.id;
  return proposal.status;
end;
$$;

-- The helpers run only inside the functions above.
revoke all on function public.food_log_entry_ids(jsonb) from public, anon, authenticated;
revoke all on function public.food_log_entries(bigint[]) from public, anon, authenticated;
revoke all on function public.check_food_log_days(jsonb) from public, anon, authenticated;
revoke all on function public.food_log_change(jsonb) from public, anon, authenticated;
revoke all on function public.apply_food_log_change(jsonb) from public, anon, authenticated;
revoke all on function public.undo_food_log_change(jsonb, jsonb) from public, anon, authenticated;
