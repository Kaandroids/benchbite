-- Meals Bite estimates in the chat, as cards the user adds, edits the grams of, or undoes (#299,
-- ADR 0062). Bite never logs a meal itself: its tool keeps a card here, the chat shows it, and
-- only the user's tap logs it, with log_meal_estimate() as Nutrition's photo does (ADR 0060). A
-- card keeps what logging made, so that its Undo removes that, and only while it is as logged.
--
-- A card is not a proposal (coach_proposals, ADR 0058): it replaces nothing, so there is nothing
-- to find as it was before applying it and no "keep"; it is logged with the grams the user may
-- change; and undoing it removes the entries and foods it made rather than putting something back.

-- Pending until the user adds it: logged, and undone again.
create type public.coach_meal_card_status as enum ('pending', 'logged', 'undone');

create table public.coach_meal_cards (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  thread_id bigint not null references public.coach_threads (id) on delete cascade,
  day date not null,
  meal public.meal not null,
  -- The items as log_meal_estimate() takes them, in the card's order, at the grams Bite gave.
  items jsonb not null check (
    jsonb_typeof(items) = 'array'
      and jsonb_array_length(items) between 1 and 12
      and octet_length(items::text) <= 16384
  ),
  status public.coach_meal_card_status not null default 'pending',
  -- What logging made: the entries in the card's order, and the user's own foods it saved.
  entry_ids bigint[],
  food_ids bigint[],
  -- What logging made as it was then, which undoing compares with what is there: `entries`, as
  -- coach_meal_card_entries() reads them, and `foods`, as coach_meal_card_foods() does.
  logged jsonb check (octet_length(logged::text) <= 16384),
  -- What the entries added, at the values they were logged with.
  kcal numeric(8, 1),
  created_at timestamptz not null default now(),
  logged_at timestamptz,
  undone_at timestamptz,
  check ((status = 'pending') = (entry_ids is null))
);

create index coach_meal_cards_user_id on public.coach_meal_cards (user_id, created_at);
create index coach_meal_cards_thread_id on public.coach_meal_cards (thread_id);

-- The user reads their cards, which the chat shows; only the functions below write them.
alter table public.coach_meal_cards enable row level security;

create policy "Users read their own meal cards"
  on public.coach_meal_cards for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.coach_meal_cards from anon;
revoke insert, update, delete, truncate on public.coach_meal_cards from authenticated;

-- The caller's entries `entry_ids` as they are now, by id, null when none is left: what undoing a
-- card compares with what it logged.
create function public.coach_meal_card_entries(entry_ids bigint[])
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'day', e.day,
      'meal', e.meal,
      'grams', e.grams,
      'foodId', e.food_id,
      'customFoodId', e.custom_food_id,
      'recipeId', e.recipe_id
    )
    order by e.id
  )
  from public.meal_entries e
  where e.id = any (coach_meal_card_entries.entry_ids) and e.user_id = (select auth.uid());
$$;

revoke all on function public.coach_meal_card_entries(bigint[]) from public, anon, authenticated;

-- The caller's own foods `food_ids` as they are now, by id: what undoing a card compares with the
-- foods it saved, to leave one the user changed meanwhile.
create function public.coach_meal_card_foods(food_ids bigint[])
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'kcal', c.kcal,
        'proteinG', c.protein_g,
        'carbsG', c.carbs_g,
        'fatG', c.fat_g,
        'portionUnit', c.portion_unit,
        'portionGrams', c.portion_grams
      )
      order by c.id
    ),
    '[]'
  )
  from public.custom_foods c
  where c.id = any (coach_meal_card_foods.food_ids) and c.user_id = (select auth.uid());
$$;

revoke all on function public.coach_meal_card_foods(bigint[]) from public, anon, authenticated;

-- Keeps a card of the meal `items` (as log_meal_estimate() takes them) on the caller's `day` and
-- `meal`, in their `thread_id`, and gives its id. It must log as it is: it is tried and rolled
-- back, so that a day out of range (BB020), a food that is not the caller's or values a food may
-- not have are refused now, with log_meal_estimate()'s own errors, rather than when the user taps
-- Add. A user makes at most 50 cards a day (BB038). Bite's tool calls it as the user.
create function public.add_coach_meal_card(
  thread_id bigint,
  day date,
  meal public.meal,
  items jsonb
)
returns bigint
language plpgsql
-- Writes cards, which callers may only read. The tried log keeps to the caller's own rows, as in
-- log_coach_meal_card().
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  card_id bigint;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform public.lock_user_limits(caller_id);
  if not exists (
    select 1 from public.coach_threads t
    where t.id = add_coach_meal_card.thread_id and t.user_id = caller_id
  ) then
    raise exception 'Thread not found' using errcode = 'P0002';
  end if;
  if (
    select count(*) from public.coach_meal_cards c
    where c.user_id = caller_id and c.created_at > now() - interval '1 day'
  ) >= 50 then
    raise exception 'Too many meal cards' using errcode = 'BB038';
  end if;

  -- Tried, as propose_coach_change() tries a change, and rolled back on purpose by the error only
  -- this block catches. Nothing but BBTRY may be caught here, or a tried meal would be kept.
  begin
    perform count(*) from public.log_meal_estimate(
      add_coach_meal_card.day, add_coach_meal_card.meal, add_coach_meal_card.items
    );
    raise exception 'Tried' using errcode = 'BBTRY';
  exception when sqlstate 'BBTRY' then
    null;
  end;

  insert into public.coach_meal_cards (user_id, thread_id, day, meal, items)
  values (
    caller_id, add_coach_meal_card.thread_id, add_coach_meal_card.day, add_coach_meal_card.meal,
    add_coach_meal_card.items
  )
  returning id into card_id;
  return card_id;
end;
$$;

-- Logs the caller's pending card `card_id`, with `grams` per item in the card's order when the
-- user changed them (the card's Edit), and gives the card as it is then. A card is logged once
-- (BB036).
create function public.log_coach_meal_card(card_id bigint, grams numeric[] default null)
returns public.coach_meal_cards
language plpgsql
-- Writes cards, which callers may only read. log_meal_estimate() then runs as the owner too, and
-- still keeps to the caller's own rows: its entries and foods take auth.uid() as their user, their
-- triggers refuse another user's food or recipe and keep the limits and the days, and it looks up
-- only the caller's own foods.
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  card public.coach_meal_cards;
  to_log jsonb;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  -- The user's lock first, as the entries' and foods' limits take it, then the card's row.
  perform public.lock_user_limits(caller_id);
  select * into card from public.coach_meal_cards c
  where c.id = log_coach_meal_card.card_id and c.user_id = caller_id
  for update;
  if not found then
    raise exception 'Meal card not found' using errcode = 'P0002';
  end if;
  if card.status <> 'pending' then
    raise exception 'Meal card already logged' using errcode = 'BB036';
  end if;

  to_log := card.items;
  if log_coach_meal_card.grams is not null then
    if cardinality(log_coach_meal_card.grams) <> jsonb_array_length(card.items)
      or array_position(log_coach_meal_card.grams, null) is not null then
      raise exception 'Grams are one for each item' using errcode = '22023';
    end if;
    to_log := (
      select jsonb_agg(
        i.value || jsonb_build_object('grams', log_coach_meal_card.grams[i.ordinality])
        order by i.ordinality
      )
      from jsonb_array_elements(card.items) with ordinality i
    );
  end if;

  select
    array_agg(l.entry_id order by l.position),
    coalesce(array_agg(l.custom_food_id order by l.position) filter (where l.created_food), '{}'),
    sum(l.kcal)
  into card.entry_ids, card.food_ids, card.kcal
  from public.log_meal_estimate(card.day, card.meal, to_log)
    with ordinality l (entry_id, custom_food_id, created_food, kcal, position);

  card.logged := jsonb_build_object(
    'entries', public.coach_meal_card_entries(card.entry_ids),
    'foods', public.coach_meal_card_foods(card.food_ids)
  );
  card.status := 'logged';
  card.logged_at := now();
  update public.coach_meal_cards c
  set status = card.status, entry_ids = card.entry_ids, food_ids = card.food_ids,
    logged = card.logged, kcal = card.kcal, logged_at = card.logged_at
  where c.id = card.id;
  return card;
end;
$$;

-- Takes back the caller's logged card `card_id` with undo_meal_estimate(), only while its entries
-- are as it logged them: one the user moved, resized or removed meanwhile is theirs now (BB035).
-- Of the foods it saved, it removes only those the user has not come to use since: one they
-- changed, logged elsewhere (a removed entry still restorable included), put in a recipe, starred
-- or that another pending card holds by its id stays as it is. Gives the card as it is then.
create function public.undo_coach_meal_card(card_id bigint)
returns public.coach_meal_cards
language plpgsql
-- Writes cards, which callers may only read; undo_meal_estimate() keeps to the caller's own rows.
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  card public.coach_meal_cards;
  unused_food_ids bigint[];
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform public.lock_user_limits(caller_id);
  select * into card from public.coach_meal_cards c
  where c.id = undo_coach_meal_card.card_id and c.user_id = caller_id
  for update;
  if not found then
    raise exception 'Meal card not found' using errcode = 'P0002';
  end if;
  if card.status <> 'logged' then
    raise exception 'Meal card not logged' using errcode = 'BB036';
  end if;
  -- Changing an entry needs no lock of the user's, so the entries are locked before the check.
  perform 1 from public.meal_entries e
  where e.id = any (card.entry_ids) and e.user_id = caller_id
  for update;
  if public.coach_meal_card_entries(card.entry_ids) is distinct from card.logged -> 'entries' then
    raise exception 'Changed since the meal was logged' using errcode = 'BB035';
  end if;

  select coalesce(array_agg(food.value['id']::bigint), '{}') into unused_food_ids
  from jsonb_array_elements(public.coach_meal_card_foods(card.food_ids)) food
  where food.value in (select jsonb_array_elements(card.logged -> 'foods'))
    and not exists (
      select 1 from public.meal_entries e
      where e.custom_food_id = food.value['id']::bigint and e.id <> all (card.entry_ids)
    )
    and not exists (
      select 1 from public.removed_meal_entries r
      where r.custom_food_id = food.value['id']::bigint and r.id <> all (card.entry_ids)
    )
    and not exists (
      select 1 from public.recipe_ingredients i where i.custom_food_id = food.value['id']::bigint
    )
    and not exists (
      select 1 from public.favourite_foods f where f.custom_food_id = food.value['id']::bigint
    )
    and not exists (
      select 1 from public.coach_meal_cards c
      where c.user_id = caller_id and c.status = 'pending'
        and c.items @> jsonb_build_array(jsonb_build_object('custom_food_id', food.value['id']))
    );

  perform public.undo_meal_estimate(card.entry_ids, unused_food_ids);
  card.status := 'undone';
  card.undone_at := now();
  update public.coach_meal_cards c
  set status = card.status, undone_at = card.undone_at
  where c.id = card.id;
  return card;
end;
$$;

revoke all on function public.add_coach_meal_card(bigint, date, public.meal, jsonb)
  from public, anon;
grant execute on function public.add_coach_meal_card(bigint, date, public.meal, jsonb)
  to authenticated;
revoke all on function public.log_coach_meal_card(bigint, numeric[]) from public, anon;
grant execute on function public.log_coach_meal_card(bigint, numeric[]) to authenticated;
revoke all on function public.undo_coach_meal_card(bigint) from public, anon;
grant execute on function public.undo_coach_meal_card(bigint) to authenticated;
