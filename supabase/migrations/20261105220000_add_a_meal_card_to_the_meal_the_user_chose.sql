-- The user may add Bite's meal card to another meal than the one Bite gave (#429, ADR 0085). The
-- card keeps the meal it was added to, so that it says so wherever it is read again.
drop function public.log_coach_meal_card(bigint, numeric[]);

-- Logs the caller's pending card `card_id`, with `grams` per item in the card's order when the
-- user changed them (the card's Edit) and in `meal` when they chose another one, and gives the
-- card as it is then. A card is logged once (BB036).
create function public.log_coach_meal_card(
  card_id bigint,
  grams numeric[] default null,
  meal public.meal default null
)
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
  card.meal := coalesce(log_coach_meal_card.meal, card.meal);

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
  set status = card.status, meal = card.meal, entry_ids = card.entry_ids,
    food_ids = card.food_ids, logged = card.logged, kcal = card.kcal, logged_at = card.logged_at
  where c.id = card.id;
  return card;
end;
$$;

revoke all on function public.log_coach_meal_card(bigint, numeric[], public.meal)
  from public, anon;
grant execute on function public.log_coach_meal_card(bigint, numeric[], public.meal)
  to authenticated;
