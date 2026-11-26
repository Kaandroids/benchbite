-- Bite proposes a new recipe and changes to the favourites, which the user applies (ADR 0172), as
-- every change Bite makes (ADR 0058). A recipe is saved through save_recipe(), the favourites as
-- the app stars and unstars foods; undoing deletes the recipe again, or stars and unstars back.
--
-- New error codes:
--   BB068  the user has a recipe of that name already
--   BB069  a food to add is a favourite already, or one to remove is not one
--   BB070  a food is not one the user can log: not in the library, deleted, or not theirs

-- A new recipe as a proposal keeps it: its name trimmed, servings and their unit, and 1 to 50
-- ingredients, each a library food (foodId) or one of the user's own (customFoodId), with grams and
-- the portion that was picked, if one was (22023).
create function public.coach_recipe_change(change jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if not coalesce(
    jsonb_typeof(change -> 'name') = 'string'
      and jsonb_typeof(change -> 'servings') = 'number'
      and (change ->> 'servingUnit') = any (enum_range(null::public.portion_unit)::text[])
      and jsonb_typeof(change -> 'ingredients') = 'array'
      and jsonb_array_length(change -> 'ingredients') between 1 and 50
      and (
        select bool_and(
          jsonb_typeof(i) = 'object'
            -- One food: a library food's id, or the id of a food of one's own.
            and (i ? 'foodId') <> (i ? 'customFoodId')
            and coalesce(jsonb_typeof(i -> 'foodId'), 'string') = 'string'
            and coalesce(jsonb_typeof(i -> 'customFoodId'), 'number') = 'number'
            and jsonb_typeof(i -> 'grams') = 'number'
            and (i ? 'portionUnit') = (i ? 'portionCount')
            and (
              not i ? 'portionUnit'
              or ((i ->> 'portionUnit') = any (enum_range(null::public.portion_unit)::text[])
                and jsonb_typeof(i -> 'portionCount') = 'number')
            )
        )
        from jsonb_array_elements(change -> 'ingredients') i
      ),
    false
  ) then
    raise exception 'A recipe needs a name, servings, their unit and 1 to 50 ingredients'
      using errcode = '22023';
  end if;
  return jsonb_build_object(
    'name', btrim(change ->> 'name'),
    'servings', change -> 'servings',
    'servingUnit', change -> 'servingUnit',
    'ingredients', (
      select jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'foodId', i -> 'foodId',
          'customFoodId', i -> 'customFoodId',
          'grams', i -> 'grams',
          'portionUnit', i -> 'portionUnit',
          'portionCount', i -> 'portionCount'
        ))
        order by n
      )
      from jsonb_array_elements(change -> 'ingredients') with ordinality as x(i, n)
    )
  );
end;
$$;

revoke execute on function public.coach_recipe_change(jsonb) from public, anon, authenticated;

-- The caller's recipe in use of the name `change` gives, compared as search compares names, as
-- `change` names a recipe, with its id; null when they have none.
create function public.coach_recipe_state(change jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id,
    'name', r.name,
    'servings', r.servings,
    'servingUnit', r.serving_unit,
    'ingredients', (
      select jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'foodId', i.food_id,
          'customFoodId', i.custom_food_id,
          'grams', i.grams,
          'portionUnit', i.portion_unit,
          'portionCount', i.portion_count
        ))
        order by i.position
      )
      from public.recipe_ingredients i
      where i.recipe_id = r.id
    )
  )
  from public.recipes r
  where r.user_id = (select auth.uid())
    and r.archived_at is null
    and public.food_name_key(r.name) = public.food_name_key(change ->> 'name');
$$;

revoke execute on function public.coach_recipe_state(jsonb) from public, anon, authenticated;

-- A food as a favourite names it: by exactly one of foodId, customFoodId or recipeId.
create function public.is_coach_food_ref(ref jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(ref) = 'object'
      and (select count(*) from jsonb_object_keys(ref)) = 1
      and (
        jsonb_typeof(ref -> 'foodId') = 'string'
        or jsonb_typeof(ref -> 'customFoodId') = 'number'
        or jsonb_typeof(ref -> 'recipeId') = 'number'
      ),
    false
  );
$$;

revoke execute on function public.is_coach_food_ref(jsonb) from public, anon, authenticated;

-- A change to the favourites as a proposal keeps it: foods to add and foods to remove, 1 to 10 in
-- all, each named once (22023).
create function public.coach_favourites_change(change jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  foods jsonb;
begin
  if not coalesce(
    jsonb_typeof(coalesce(change -> 'add', '[]')) = 'array'
      and jsonb_typeof(coalesce(change -> 'remove', '[]')) = 'array',
    false
  ) then
    raise exception 'Favourites change by foods to add and to remove' using errcode = '22023';
  end if;
  change := jsonb_build_object(
    'add', coalesce(change -> 'add', '[]'),
    'remove', coalesce(change -> 'remove', '[]')
  );
  foods := (change -> 'add') || (change -> 'remove');
  if not coalesce(
    jsonb_array_length(foods) between 1 and 10
      and (
        select bool_and(public.is_coach_food_ref(f)) and count(distinct f) = count(*)
        from jsonb_array_elements(foods) f
      ),
    false
  ) then
    raise exception 'A change to the favourites names 1 to 10 foods, each once'
      using errcode = '22023';
  end if;
  return change;
end;
$$;

revoke execute on function public.coach_favourites_change(jsonb) from public, anon, authenticated;

-- Of the foods `change` adds and removes, in that order, those that are the caller's favourites.
create function public.coach_favourites_state(change jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('starred', coalesce(jsonb_agg(f order by n), '[]'))
  from jsonb_array_elements(
    coalesce(change -> 'add', '[]') || coalesce(change -> 'remove', '[]')
  ) with ordinality as x(f, n)
  where exists (
    select 1 from public.favourite_foods fav
    where fav.user_id = (select auth.uid())
      and fav.food_id is not distinct from (f ->> 'foodId')
      and fav.custom_food_id is not distinct from (f ->> 'customFoodId')::bigint
      and fav.recipe_id is not distinct from (f ->> 'recipeId')::bigint
  );
$$;

revoke execute on function public.coach_favourites_state(jsonb) from public, anon, authenticated;

-- Refuses a food the caller cannot log (BB070): a library food that is not in it or left it, or a
-- food or recipe of their own that is deleted or not theirs. Proposals apply as the owner, past
-- the policies that keep favourites and ingredients to one's own foods, so this keeps them so.
create function public.check_coach_foods(foods jsonb)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if exists (
    select 1 from jsonb_array_elements(foods) f
    where case
      when f ? 'foodId' then not exists (
        select 1 from public.foods x where x.id = f ->> 'foodId' and x.archived_at is null
      )
      when f ? 'customFoodId' then not exists (
        select 1 from public.custom_foods c
        where c.id = (f ->> 'customFoodId')::bigint
          and c.user_id = (select auth.uid()) and c.archived_at is null
      )
      else not exists (
        select 1 from public.recipes r
        where r.id = (f ->> 'recipeId')::bigint
          and r.user_id = (select auth.uid()) and r.archived_at is null
      )
    end
  ) then
    raise exception 'A food is not one the user can log' using errcode = 'BB070';
  end if;
end;
$$;

revoke execute on function public.check_coach_foods(jsonb) from public, anon, authenticated;

-- Stars `foods` for the caller, or unstars them.
create function public.star_coach_foods(foods jsonb, starred boolean)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if starred then
    insert into public.favourite_foods (user_id, food_id, custom_food_id, recipe_id)
    select (select auth.uid()), f ->> 'foodId', (f ->> 'customFoodId')::bigint,
      (f ->> 'recipeId')::bigint
    from jsonb_array_elements(foods) with ordinality as x(f, n)
    order by n;
  else
    delete from public.favourite_foods fav
    using jsonb_array_elements(foods) f
    where fav.user_id = (select auth.uid())
      and fav.food_id is not distinct from (f ->> 'foodId')
      and fav.custom_food_id is not distinct from (f ->> 'customFoodId')::bigint
      and fav.recipe_id is not distinct from (f ->> 'recipeId')::bigint;
  end if;
end;
$$;

revoke execute on function public.star_coach_foods(jsonb, boolean) from public, anon, authenticated;

-- As before, and for a recipe the caller's recipe of its name, and for favourites which of its
-- foods are favourites.
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
    when kind = 'recipe' then public.coach_recipe_state(change)
    when kind = 'favourites' then public.coach_favourites_state(change)
  end;
$$;

-- As before, and saves a recipe, or stars and unstars foods.
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
    -- Through save_recipe(), as the app saves one, with its checks and limits.
    when 'recipe' then
      perform public.check_coach_foods(change -> 'ingredients');
      perform public.save_recipe(
        null,
        change ->> 'name',
        (change ->> 'servings')::smallint,
        (change ->> 'servingUnit')::public.portion_unit,
        (
          select jsonb_agg(
            jsonb_strip_nulls(jsonb_build_object(
              'food_id', i -> 'foodId',
              'custom_food_id', i -> 'customFoodId',
              'grams', i -> 'grams',
              'portion_unit', i -> 'portionUnit',
              'portion_count', i -> 'portionCount'
            ))
            order by n
          )
          from jsonb_array_elements(change -> 'ingredients') with ordinality as x(i, n)
        )
      );
    when 'favourites' then
      perform public.check_coach_foods(change -> 'add');
      perform public.star_coach_foods(change -> 'add', true);
      perform public.star_coach_foods(change -> 'remove', false);
  end case;
end;
$$;

-- As before, and deletes a saved recipe again, as the app deletes one, or stars and unstars the
-- favourites back. Meals logged with the recipe meanwhile keep it, as they do when the app deletes
-- it (ADR 0038).
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
    when 'recipe' then
      update public.recipes r
      set archived_at = now()
      where r.id = (after ->> 'id')::bigint and r.user_id = (select auth.uid());
    when 'favourites' then
      perform public.star_coach_foods(change -> 'add', false);
      perform public.star_coach_foods(change -> 'remove', true);
    -- A note's change too: what it replaces names every field it may change.
    else perform public.apply_coach_change(kind, before, today);
  end case;
end;
$$;

-- As before, checking the new kinds: a recipe needs a name the user has no recipe of (BB068), and
-- a change to the favourites foods to add that are none yet and foods to remove that are
-- (BB069).
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
          -- Only while the note is as it saw it, or it would undo what the user changed since.
          and p.before = public.coach_proposal_state('note', propose_coach_change.change)
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
    when 'recipe' then
      change := public.coach_recipe_change(change);
    when 'favourites' then
      change := public.coach_favourites_change(change);
  end case;

  before := public.coach_proposal_state(kind, change);
  if kind in ('workout', 'workouts', 'alternative', 'alternative_switch') and before is null then
    raise exception 'Workout not found' using errcode = 'BB006';
  end if;
  -- A note in use only: neither archived nor waiting for the user's yes.
  if kind in ('note', 'note_archive') and coalesce((before ->> 'archived')::boolean, true) then
    raise exception 'Note not found' using errcode = 'P0002';
  end if;
  if kind = 'recipe' and before is not null then
    raise exception 'A recipe of that name exists' using errcode = 'BB068';
  end if;
  -- None of the foods to add is a favourite, and every one to remove is.
  if kind = 'favourites' and before -> 'starred' <> change -> 'remove' then
    raise exception 'A food to add is a favourite, or one to remove is not'
      using errcode = 'BB069';
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

-- As before, and locks the recipes of a recipe's name, as the app changes recipes without the
-- user's lock.
create or replace function public.decide_coach_proposal(
  proposal_id bigint,
  decision public.coach_proposal_decision,
  today date
)
returns public.coach_proposal_status
language plpgsql
-- Writes proposals, which callers may only read. The changes run as the owner, through
-- save_workout(), save_own_nutrition_targets(), save_recipe(), the food log's and the
-- alternatives' functions, which keep to the caller's own rows by auth.uid() themselves, past the
-- tables' policies, and for a note, a recipe and the favourites as changes that keep to the
-- caller's own by auth.uid() too.
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
  -- changes entries and recipes without it, so their rows are locked too.
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
    when 'recipe' then
      perform 1 from public.recipes r
      where r.user_id = proposal.user_id
        and public.food_name_key(r.name) = public.food_name_key(proposal.change ->> 'name')
      order by r.id
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
